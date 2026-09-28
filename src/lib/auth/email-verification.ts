import "server-only";
import { randomBytes } from "node:crypto";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createSession, hashToken, isSecureCookieEnv } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { emailVerifications, users } from "@/lib/db/schema";
import { appUrl, renderEmail, sendEmail } from "@/lib/email";
import { getClientIp, hashIp } from "@/lib/http";
import { sharedLimit } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security/events";

/**
 * Verifikasi email untuk akun yang mendaftar sendiri (bukan lewat Google — akun Google
 * sudah dipercaya karena Google melaporkan `email_verified`).
 *
 * Token: 32 byte acak, hanya HASH-nya yang disimpan (id = hashToken(token)), sekali pakai,
 * 24 jam. Link asli hanya dikirim lewat email, tidak pernah masuk URL yang bisa dilihat orang
 * lain: email memuat link `/verifikasi-email/buka?token=...`, halaman itu langsung memindahkan
 * token ke cookie HttpOnly (seperti alur reset password) supaya URL bersih dan token tidak
 * tertinggal di riwayat browser.
 */

export const VERIFY_TTL_HOURS = 24;
const MAX_PER_HOUR = 3;
export const VERIFY_COOKIE = isSecureCookieEnv() ? "__Secure-rilisin_verify" : "rilisin_verify";
export const VERIFY_COOKIE_PATH = "/verifikasi-email";

function runLater(fn: () => Promise<unknown>) {
  const run = () => fn().catch((err) => console.error("[verifikasi-email] gagal", err));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** Buat token baru untuk seorang pengguna dan kirim emailnya. Token lama otomatis hangus. */
async function issueVerification(userId: string, ip: string | null) {
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.displayName, bannedAt: users.bannedAt, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || user.bannedAt || user.emailVerifiedAt) return;

  const token = randomBytes(32).toString("base64url");
  await db.update(emailVerifications).set({ usedAt: new Date() }).where(and(eq(emailVerifications.userId, user.id), isNull(emailVerifications.usedAt)));
  await db.insert(emailVerifications).values({
    id: hashToken(token),
    userId: user.id,
    email: user.email,
    expiresAt: new Date(Date.now() + VERIFY_TTL_HOURS * 60 * 60_000),
    ipHash: ip ? hashIp(ip) : null,
  });
  await logSecurityEvent("email_verification_requested", { userId: user.id });

  const link = `${appUrl()}/verifikasi-email/buka?token=${encodeURIComponent(token)}`;
  const { html, text } = renderEmail({
    heading: "Verifikasi email Rilisin kamu",
    paragraphs: [
      `Halo ${user.name}, satu langkah lagi: konfirmasi bahwa ${user.email} memang milikmu.`,
      `Link ini berlaku ${VERIFY_TTL_HOURS} jam dan sekali pakai.`,
    ],
    cta: { label: "Verifikasi email", url: link },
    footnote: "Bukan kamu yang mendaftar? Abaikan email ini — tanpa verifikasi, kami tidak bisa memastikan email ini benar-benar milikmu (email terverifikasi dipakai untuk memulihkan akun).",
  });
  await sendEmail({ to: user.email, subject: "Verifikasi email Rilisin kamu", html, text });
}

/** Dipakai tepat setelah pendaftaran: kirim link verifikasi (tanpa menahan respons). */
export function sendVerificationAfterRegister(userId: string, ip: string | null) {
  runLater(() => issueVerification(userId, ip));
}

/** Kirim ulang link verifikasi untuk akun yang sedang login. */
export async function requestEmailVerification() {
  const user = await getCurrentUser();
  if (!user) return { error: "Masuk dulu ya." as const };
  if (user.emailVerifiedAt) return { ok: true as const };
  const ip = await getClientIp();
  if (!(await sharedLimit(`verify:ip:${ip}`, 5, 15 * 60_000)).ok) return { limited: true as const };

  const [recent] = await db
    .select({ n: count() })
    .from(emailVerifications)
    .where(and(eq(emailVerifications.userId, user.id), gt(emailVerifications.createdAt, sql`now() - interval '1 hour'`)));
  if ((recent?.n ?? 0) >= MAX_PER_HOUR) return { limited: true as const };

  await issueVerification(user.id, ip);
  return { ok: true as const };
}

/** Cek token (tanpa memakainya). */
export async function findValidVerification(token: string | null | undefined) {
  if (!token || token.length < 20 || token.length > 200) return null;
  const [row] = await db
    .select({ id: emailVerifications.id, userId: emailVerifications.userId, email: users.email, username: users.username, bannedAt: users.bannedAt })
    .from(emailVerifications)
    .innerJoin(users, eq(users.id, emailVerifications.userId))
    .where(and(eq(emailVerifications.id, hashToken(token)), isNull(emailVerifications.usedAt), gt(emailVerifications.expiresAt, new Date())))
    .limit(1);
  if (!row || row.bannedAt) return null;
  return row;
}

export async function readVerifyCookie() {
  return (await cookies()).get(VERIFY_COOKIE)?.value ?? null;
}

export async function setVerifyCookie(token: string) {
  (await cookies()).set(VERIFY_COOKIE, token, {
    httpOnly: true,
    secure: isSecureCookieEnv(),
    sameSite: "lax",
    path: VERIFY_COOKIE_PATH,
    maxAge: VERIFY_TTL_HOURS * 3600,
  });
}

export async function clearVerifyCookie() {
  (await cookies()).set(VERIFY_COOKIE, "", {
    httpOnly: true,
    secure: isSecureCookieEnv(),
    sameSite: "lax",
    path: VERIFY_COOKIE_PATH,
    maxAge: 0,
  });
}

/**
 * Pakai token: tandai email terverifikasi, token hangus. Kalau pengguna belum punya session
 * (link dibuka di perangkat lain), buatkan session — orang yang memegang email itu memang
 * pemiliknya. Lalu kirim email pemberitahuan supaya pemilik tahu kalau ada verifikasi tak wajar.
 */
export async function completeEmailVerification(token: string) {
  const found = await findValidVerification(token);
  if (!found) return { error: "Link verifikasi sudah tidak berlaku. Minta link baru ya." as const };

  const claimed = await db
    .update(emailVerifications)
    .set({ usedAt: new Date() })
    .where(and(eq(emailVerifications.id, found.id), isNull(emailVerifications.usedAt)))
    .returning({ id: emailVerifications.id });
  if (!claimed.length) return { error: "Link verifikasi sudah dipakai. Minta link baru ya." as const };

  const current = await getCurrentUser();
  if (!current) await createSession(found.userId);
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(and(eq(users.id, found.userId), isNull(users.emailVerifiedAt)));
  await logSecurityEvent("email_verified", { userId: found.userId });

  runLater(async () => {
    const { html, text } = renderEmail({
      heading: "Email kamu sudah terverifikasi",
      paragraphs: [
        `${found.email} sekarang terverifikasi di Rilisin. Fitur yang butuh email terverifikasi sudah terbuka.`,
        "Bukan kamu? Segera ganti password dan aktifkan verifikasi 2 langkah (2FA) di menu Keamanan akun.",
      ],
      cta: { label: "Buka Keamanan akun", url: `${appUrl()}/akun/keamanan` },
    });
    await sendEmail({ to: found.email, subject: "Email Rilisin kamu sudah terverifikasi", html, text });
  });
  return { ok: true as const, email: found.email };
}
