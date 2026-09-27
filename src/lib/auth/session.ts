import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";

export const SESSION_COOKIE = "rilisin_session";
const SESSION_DAYS = 30;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Opsi cookie session.
 * - httpOnly: tidak bisa dibaca JavaScript (aman dari XSS pencuri token)
 * - Di HTTPS: SameSite=None + Partitioned supaya login tetap jalan saat app dibuka di
 *   dalam iframe (preview sandbox). Perlindungan CSRF tetap ada: Server Actions dicek
 *   Origin-nya oleh Next.js, dan route handler kita mengecek Origin secara manual.
 *   Di production dengan domain sendiri, cukup ganti ke SameSite "lax".
 */
function cookieOptions(expires: Date) {
  const secure = process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false";
  return {
    httpOnly: true,
    path: "/",
    expires,
    secure,
    sameSite: secure ? ("none" as const) : ("lax" as const),
    partitioned: secure,
  };
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt, userAgent });
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export async function readSessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function destroySession() {
  const token = await readSessionToken();
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  (await cookies()).set(SESSION_COOKIE, "", { ...cookieOptions(new Date(0)), maxAge: 0 });
}
