import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createSession, isSecureCookieEnv } from "@/lib/auth/session";
import { RESERVED_USERNAMES } from "@/lib/config";
import { db } from "@/lib/db";
import { oauthAccounts, users } from "@/lib/db/schema";
import { appUrl } from "@/lib/email";
import { logSecurityEvent } from "@/lib/security/events";
import { signToken, verifyToken } from "@/lib/tokens";

/**
 * Login Google (OAuth 2.0 + PKCE S256). Alasan tidak memakai library pihak ketiga:
 * alurnya hanya dua endpoint, dan dependency baru di jalur auth = permukaan serang
 * baru (section 11: supply chain).
 *
 * Pengaman:
 *  - `state` acak + PKCE (code_verifier tidak pernah keluar dari server) → CSRF &
 *    penyadapan authorization code tidak berguna.
 *  - state+verifier+next dibawa dalam SATU cookie HttpOnly bertanda tangan HMAC
 *    (bukan di URL), masa berlaku 10 menit, sekali pakai (dihapus saat dipakai).
 *  - email dianggap terpercaya hanya kalau Google melaporkan `email_verified: true`.
 *  - Penautan ke akun lama HANYA kalau email akun itu sudah diverifikasi, ATAU akun
 *    belum punya password. Akun lokal yang emailnya belum diverifikasi TIDAK ditautkan
 *    otomatis — kalau tidak, orang bisa mendaftar dengan email orang lain lebih dulu
 *    lalu mengambil alih akun Google-nya nanti.
 *  - Akun hasil Google dibuat TANPA password (kolom password_hash null) supaya tidak
 *    bisa dimasuki lewat form password, dan tautan Google-nya tidak bisa dilepas
 *    sampai akun punya cara masuk lain.
 */

const DEFAULT_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const DEFAULT_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

/** Cookie tiket OAuth (state + verifier + next). HttpOnly, 10 menit. */
export const OAUTH_COOKIE = isSecureCookieEnv() ? "__Secure-rilisin_oauth" : "rilisin_oauth";
const OAUTH_TTL_SEC = 600;

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl()}/api/auth/google/callback`,
    // Override URL HANYA untuk pengujian (CI memakai Google palsu). Di produksi
    // biarkan kosong. Bila nilai ini diisi orang yang tidak berwenang, token bisa
    // bocor — perlakukan seperti secret.
    authUrl: process.env.GOOGLE_AUTH_URL?.trim() || DEFAULT_AUTH_URL,
    tokenUrl: process.env.GOOGLE_TOKEN_URL?.trim() || DEFAULT_TOKEN_URL,
    userinfoUrl: process.env.GOOGLE_USERINFO_URL?.trim() || DEFAULT_USERINFO_URL,
  };
}

/** Login Google aktif? (dipakai halaman untuk memutuskan tampil atau tidaknya tombol). */
export function googleEnabled() {
  return googleConfig() !== null;
}

/** Identitas Google yang sedang tertaut di sebuah akun. */
export async function listGoogleIdentities(userId: string) {
  return db
    .select({ provider: oauthAccounts.provider, email: oauthAccounts.email, createdAt: oauthAccounts.createdAt })
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, "google")))
    .orderBy(oauthAccounts.createdAt);
}

/**
 * Langkah 1: siapkan state + PKCE, simpan tiket di cookie, kembalikan parameter
 * yang harus ditempel ke URL otorisasi Google.
 */
export async function startGoogleLogin(nextPath: string) {
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(32).toString("base64url");
  const ticket = signToken("oauth", { state, verifier, next: nextPath }, OAUTH_TTL_SEC);
  (await cookies()).set(OAUTH_COOKIE, ticket, {
    httpOnly: true,
    secure: isSecureCookieEnv(),
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_TTL_SEC,
  });
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { state, challenge };
}

/** Hapus tiket (dipakai setelah callback, sukses maupun gagal). */
export async function clearOauthTicket() {
  (await cookies()).delete(OAUTH_COOKIE);
}

async function createGoogleUser(email: string, name: string) {
  const local = email.split("@")[0] ?? "";
  const base = (local.replace(/[^a-z0-9_]/g, "").replace(/^[^a-z]+/, "") || "dev").slice(0, 12);
  const displayName = (name.trim() || base).slice(0, 50) || "Pengguna Rilisin";
  for (let attempt = 0; attempt < 6; attempt++) {
    const suffix = attempt === 0 ? "" : Math.random().toString(36).slice(2, 6);
    let username = `${base}${suffix}`;
    if (username.length < 3) username = `${username}${randomBytes(2).toString("hex")}`;
    if (RESERVED_USERNAMES.has(username)) continue;
    try {
      // passwordHash sengaja null: akun ini hanya bisa dimasuki lewat Google.
      const [row] = await db
        .insert(users)
        .values({ email, username, displayName, emailVerifiedAt: new Date() })
        .returning({ id: users.id });
      if (row) return row.id;
    } catch {
      // username/email bentrok → coba kombinasi lain
    }
  }
  throw new Error("Gagal membuat akun dari identitas Google");
}

export type OauthResult =
  | { ok: true; next: string }
  | { ok: false; error: "unconfigured" | "state" | "token" | "userinfo" | "unverified" | "banned" | "needs_password" | "failed"; next: string };

/**
 * Langkah 2: Google mengembalikan `code` + `state`. Verifikasi tiket, tukar code
 * dengan PKCE, ambil profil, lalu cari/tautkan/buat akun dan buat session.
 */
export async function finishGoogleLogin(code: string, state: string): Promise<OauthResult> {
  const cfg = googleConfig();
  if (!cfg) return { ok: false, error: "unconfigured", next: "/masuk" };

  const ticket = verifyToken<{ state: string; verifier: string; next: string }>(
    "oauth",
    (await cookies()).get(OAUTH_COOKIE)?.value,
  );
  await clearOauthTicket();
  if (!ticket) return { ok: false, error: "state", next: "/masuk?oauth=kadaluarsa" };

  const a = Buffer.from(ticket.state);
  const b = Buffer.from(state);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await logSecurityEvent("oauth_rejected", { meta: { provider: "google", reason: "state" } });
    return { ok: false, error: "state", next: "/masuk?oauth=gagal" };
  }

  const tokenRes = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
      code_verifier: ticket.verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenRes.ok) {
    await logSecurityEvent("oauth_rejected", { meta: { provider: "google", reason: "token", status: tokenRes.status } });
    return { ok: false, error: "token", next: "/masuk?oauth=gagal" };
  }
  const token = (await tokenRes.json().catch(() => null)) as { access_token?: string } | null;
  if (!token?.access_token) return { ok: false, error: "token", next: "/masuk?oauth=gagal" };

  const infoRes = await fetch(cfg.userinfoUrl, {
    headers: { authorization: `Bearer ${token.access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!infoRes.ok) return { ok: false, error: "userinfo", next: "/masuk?oauth=gagal" };
  const info = (await infoRes.json().catch(() => null)) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  } | null;
  const sub = String(info?.sub ?? "").slice(0, 64);
  const email = String(info?.email ?? "").trim().toLowerCase().slice(0, 200);
  // Hanya email yang sudah diverifikasi Google yang boleh dipakai menautkan akun.
  if (!sub || !email || info?.email_verified !== true) {
    await logSecurityEvent("oauth_rejected", { meta: { provider: "google", reason: "unverified_email" } });
    return { ok: false, error: "unverified", next: "/masuk?oauth=gagal" };
  }

  const [linked] = await db
    .select({ userId: oauthAccounts.userId })
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, "google"), eq(oauthAccounts.providerAccountId, sub)))
    .limit(1);

  // Sudah login (tombol "Hubungkan Google" di /akun/keamanan): tautkan ke akun yang
  // sedang aktif, dan hanya kalau email Google sama dengan email akun itu. Ini mencegah
  // orang menautkan identitas Google orang lain ke akunnya sendiri.
  const current = await getCurrentUser();
  if (current) {
    if (linked && linked.userId !== current.id) {
      // Identitas Google ini sudah dipakai akun lain — jangan pindahkan pemiliknya.
      await logSecurityEvent("oauth_rejected", { meta: { provider: "google", reason: "identity_dipakai_akun_lain" } });
      return { ok: false, error: "needs_password", next: "/akun/keamanan?oauth=email-beda" };
    }
    if (current.email.toLowerCase() !== email) {
      await logSecurityEvent("oauth_rejected", { meta: { provider: "google", reason: "email_mismatch" } });
      return { ok: false, error: "needs_password", next: "/akun/keamanan?oauth=email-beda" };
    }
    if (!linked) {
      await db.insert(oauthAccounts).values({ userId: current.id, provider: "google", providerAccountId: sub, email });
    }
    if (!current.emailVerifiedAt) {
      await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, current.id));
    }
    await logSecurityEvent("oauth_linked", { userId: current.id, meta: { provider: "google" } });
    return { ok: true, next: ticket.next };
  }

  if (linked) {
    const [u] = await db.select({ id: users.id, bannedAt: users.bannedAt }).from(users).where(eq(users.id, linked.userId)).limit(1);
    if (!u || u.bannedAt) return { ok: false, error: "banned", next: "/masuk?oauth=diblokir" };
    await createSession(u.id);
    await logSecurityEvent("oauth_login", { userId: u.id, meta: { provider: "google" } });
    return { ok: true, next: ticket.next };
  }

  const [byEmail] = await db
    .select({
      id: users.id,
      bannedAt: users.bannedAt,
      emailVerifiedAt: users.emailVerifiedAt,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  if (byEmail) {
    if (byEmail.bannedAt) return { ok: false, error: "banned", next: "/masuk?oauth=diblokir" };
    // Akun lokal dengan email belum diverifikasi: JANGAN tautkan otomatis.
    if (!byEmail.emailVerifiedAt && byEmail.passwordHash) {
      await logSecurityEvent("oauth_rejected", { meta: { provider: "google", reason: "unverified_local_account" } });
      return { ok: false, error: "needs_password", next: "/masuk?oauth=perlu-password" };
    }
    await db.insert(oauthAccounts).values({ userId: byEmail.id, provider: "google", providerAccountId: sub, email });
    if (!byEmail.emailVerifiedAt) {
      await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, byEmail.id));
    }
    await createSession(byEmail.id);
    await logSecurityEvent("oauth_linked", { userId: byEmail.id, meta: { provider: "google" } });
    return { ok: true, next: ticket.next };
  }

  const userId = await createGoogleUser(email, String(info?.name ?? ""));
  await db.insert(oauthAccounts).values({ userId, provider: "google", providerAccountId: sub, email });
  await createSession(userId);
  await logSecurityEvent("oauth_registered", { userId, meta: { provider: "google" } });
  return { ok: true, next: ticket.next };
}
