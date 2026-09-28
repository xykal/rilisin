import "server-only";
import { randomBytes } from "node:crypto";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { after } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { hashToken, isSecureCookieEnv } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { passwordResets, sessions, users } from "@/lib/db/schema";
import { appUrl, renderEmail, sendEmail } from "@/lib/email";
import { hashIp } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security/events";
import { checkNewPassword } from "@/lib/security/password-policy";

export const RESET_TTL_MIN = 30;
const MAX_PER_HOUR = 3;
/** Cookie berisi token mentah, hanya dikirim ke /atur-ulang-password (token tidak tinggal di URL / riwayat browser). */
export const RESET_COOKIE = isSecureCookieEnv() ? "__Secure-rilisin_reset" : "rilisin_reset";
export const RESET_COOKIE_PATH = "/atur-ulang-password";

function runLater(fn: () => Promise<unknown>) {
  const run = () => fn().catch((err) => console.error("[reset] gagal", err));
  try {
    after(run);
  } catch {
    void run();
  }
}

/**
 * Minta link reset. Hasil SELALU sama untuk email terdaftar maupun tidak (anti enumerasi akun);
 * email dikirim setelah respons (waktu respons tidak membocorkan apa-apa).
 */
export async function requestPasswordReset(rawEmail: string, ip: string) {
  const email = rawEmail.trim().toLowerCase().slice(0, 200);
  const ipLimit = rateLimit(`reset:ip:${ip}`, 5, 15 * 60_000);
  if (!ipLimit.ok) return { limited: true };
  if (!email.includes("@")) return { limited: false };

  runLater(async () => {
    const [user] = await db
      .select({ id: users.id, email: users.email, name: users.displayName, bannedAt: users.bannedAt })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);
    if (!user || user.bannedAt) return;
    const [recent] = await db
      .select({ n: count() })
      .from(passwordResets)
      .where(and(eq(passwordResets.userId, user.id), gt(passwordResets.createdAt, sql`now() - interval '1 hour'`)));
    if ((recent?.n ?? 0) >= MAX_PER_HOUR) return;

    const token = randomBytes(32).toString("base64url");
    // Link lama otomatis tidak berlaku lagi: hanya link terbaru yang bisa dipakai.
    await db.update(passwordResets).set({ usedAt: new Date() }).where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)));
    await db.insert(passwordResets).values({
      id: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + RESET_TTL_MIN * 60_000),
      ipHash: hashIp(ip),
    });
    await logSecurityEvent("password_reset_requested", { userId: user.id });
    const link = `${appUrl()}/atur-ulang-password/buka?token=${encodeURIComponent(token)}`;
    const { html, text } = renderEmail({
      heading: "Atur ulang password Rilisin",
      paragraphs: [
        `Halo ${user.name}, ada permintaan untuk mengatur ulang password akunmu.`,
        `Link ini hanya berlaku ${RESET_TTL_MIN} menit dan sekali pakai.`,
      ],
      cta: { label: "Atur ulang password", url: link },
      footnote: "Bukan kamu yang meminta? Abaikan email ini — password kamu tidak berubah. Jangan teruskan link ini ke siapa pun.",
    });
    await sendEmail({ to: user.email, subject: "Atur ulang password Rilisin", html, text });
  });
  return { limited: false };
}

/** Cek token (tanpa memakainya). */
export async function findValidReset(token: string | null | undefined) {
  if (!token || token.length < 20 || token.length > 200) return null;
  const [row] = await db
    .select({ id: passwordResets.id, userId: passwordResets.userId, email: users.email, username: users.username, bannedAt: users.bannedAt })
    .from(passwordResets)
    .innerJoin(users, eq(users.id, passwordResets.userId))
    .where(and(eq(passwordResets.id, hashToken(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())))
    .limit(1);
  if (!row || row.bannedAt) return null;
  return row;
}

export async function readResetCookie() {
  return (await cookies()).get(RESET_COOKIE)?.value ?? null;
}

export async function setResetCookie(token: string) {
  (await cookies()).set(RESET_COOKIE, token, {
    httpOnly: true,
    secure: isSecureCookieEnv(),
    sameSite: "lax",
    path: RESET_COOKIE_PATH,
    maxAge: RESET_TTL_MIN * 60,
  });
}

export async function clearResetCookie() {
  (await cookies()).set(RESET_COOKIE, "", { httpOnly: true, secure: isSecureCookieEnv(), sameSite: "lax", path: RESET_COOKIE_PATH, maxAge: 0 });
}

/**
 * Pakai token: ganti password, token hangus, SEMUA sesi dikeluarkan (termasuk penyerang yang mungkin sudah masuk),
 * lalu kirim email pemberitahuan. 2FA tetap aktif — login berikutnya tetap minta kode.
 */
export async function completePasswordReset(token: string, newPassword: string) {
  const reset = await findValidReset(token);
  if (!reset) return { error: "Link reset sudah tidak berlaku. Minta link baru ya." as const };
  const problem = checkNewPassword(newPassword, { email: reset.email, username: reset.username });
  if (problem) return { error: problem, field: "password" as const };

  const claimed = await db
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResets.id, reset.id), isNull(passwordResets.usedAt)))
    .returning({ id: passwordResets.id });
  if (!claimed.length) return { error: "Link reset sudah dipakai. Minta link baru ya." as const };

  await db.update(users).set({ passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() }).where(eq(users.id, reset.userId));
  const revoked = await db.delete(sessions).where(eq(sessions.userId, reset.userId)).returning({ id: sessions.id });
  await logSecurityEvent("password_reset", { userId: reset.userId, meta: { revokedSessions: revoked.length } });

  runLater(async () => {
    const { html, text } = renderEmail({
      heading: "Password akunmu baru saja diganti",
      paragraphs: [
        "Password Rilisin kamu berhasil diatur ulang lewat link email. Semua perangkat yang sedang login sudah dikeluarkan.",
        "Bukan kamu? Segera minta link reset baru dan aktifkan verifikasi 2 langkah (2FA) di menu Keamanan akun.",
      ],
      cta: { label: "Buka Keamanan akun", url: `${appUrl()}/akun/keamanan` },
    });
    await sendEmail({ to: reset.email, subject: "Password Rilisin kamu diganti", html, text });
  });
  return { ok: true as const };
}
