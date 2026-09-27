import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { clientIpFrom, hashIp } from "@/lib/http";

const SESSION_DAYS = 30;

export function isSecureCookieEnv() {
  return process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false";
}

/**
 * Nama cookie. Di HTTPS pakai prefix `__Host-`: browser menjamin cookie hanya di-set lewat
 * HTTPS, untuk domain persis ini (tanpa subdomain), path "/" — mencegah cookie tossing.
 */
export const SESSION_COOKIE = isSecureCookieEnv() ? "__Host-rilisin_session" : "rilisin_session";

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Opsi cookie.
 * - httpOnly: tidak bisa dibaca JavaScript (aman dari XSS pencuri token)
 * - Di HTTPS: SameSite=None + Partitioned supaya login tetap jalan saat app dibuka di
 *   dalam iframe (preview sandbox). Perlindungan CSRF tetap ada: Server Actions dicek
 *   Origin-nya oleh Next.js, dan route handler kita mengecek Origin + Content-Type.
 *   Di production dengan domain sendiri (tanpa iframe), cukup ganti ke SameSite "lax".
 */
export function cookieOptions(expires: Date) {
  const secure = isSecureCookieEnv();
  return {
    httpOnly: true,
    path: "/",
    expires,
    secure,
    sameSite: secure ? ("none" as const) : ("lax" as const),
    partitioned: secure,
  };
}

/** Buat session baru (selalu token baru → mencegah session fixation). */
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const h = await headers();
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    ipHash: hashIp(clientIpFrom(h)),
    lastSeenAt: new Date(),
  });
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export async function readSessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function currentSessionId() {
  const token = await readSessionToken();
  return token ? hashToken(token) : null;
}

export async function destroySession() {
  const token = await readSessionToken();
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  (await cookies()).set(SESSION_COOKIE, "", { ...cookieOptions(new Date(0)), maxAge: 0 });
}

/** Keluarkan semua perangkat lain (dipakai setelah ganti password / aktifkan 2FA). */
export async function revokeOtherSessions(userId: string, keepSessionId: string | null) {
  const where = keepSessionId
    ? and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId))
    : eq(sessions.userId, userId);
  const rows = await db.delete(sessions).where(where).returning({ id: sessions.id });
  return rows.length;
}
