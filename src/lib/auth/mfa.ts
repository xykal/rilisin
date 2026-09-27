import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { authChallenges, recoveryCodes, users } from "@/lib/db/schema";
import { decryptString, pepperHash, randomCode, randomToken, sha256Hex } from "@/lib/security/crypto";
import { verifyTotp } from "@/lib/security/totp";
import { cookieOptions, isSecureCookieEnv } from "./session";

export const MFA_COOKIE = isSecureCookieEnv() ? "__Host-rilisin_mfa" : "rilisin_mfa";
const CHALLENGE_MIN = 10;
export const MFA_MAX_ATTEMPTS = 5;
export const TOTP_PURPOSE = "totp-secret";

/** Password benar tapi akun pakai 2FA → simpan tantangan sementara (10 menit, maks 5 percobaan). */
export async function createMfaChallenge(userId: string, nextPath: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + CHALLENGE_MIN * 60_000);
  await db.delete(authChallenges).where(eq(authChallenges.userId, userId));
  await db.insert(authChallenges).values({ id: sha256Hex(token), userId, nextPath, expiresAt });
  (await cookies()).set(MFA_COOKIE, token, cookieOptions(expiresAt));
}

export async function readMfaChallenge() {
  const token = (await cookies()).get(MFA_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select()
    .from(authChallenges)
    .where(and(eq(authChallenges.id, sha256Hex(token)), gt(authChallenges.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function clearMfaChallenge(id?: string) {
  if (id) await db.delete(authChallenges).where(eq(authChallenges.id, id));
  (await cookies()).set(MFA_COOKIE, "", { ...cookieOptions(new Date(0)), maxAge: 0 });
}

export function normalizeRecoveryCode(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** 10 kode cadangan format xxxxx-xxxxx. Hanya hash ber-pepper yang disimpan. */
export async function issueRecoveryCodes(userId: string) {
  const codes = Array.from({ length: 10 }, () => `${randomCode(5)}-${randomCode(5)}`);
  await db.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
  await db.insert(recoveryCodes).values(
    codes.map((c) => ({ userId, codeHash: pepperHash(normalizeRecoveryCode(c), "recovery") })),
  );
  return codes;
}

/**
 * Cek kode dari user: 6 digit TOTP, atau kode cadangan.
 * Return: "totp" | "recovery" | null. Otomatis mencatat step TOTP / menandai kode cadangan terpakai.
 */
export async function verifySecondFactor(userId: string, input: string): Promise<"totp" | "recovery" | null> {
  const [u] = await db
    .select({ secret: users.totpSecretEnc, lastStep: users.totpLastStep })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u?.secret) return null;

  const digits = input.replace(/[\s-]/g, "");
  if (/^\d{6}$/.test(digits)) {
    const secret = decryptString(u.secret, TOTP_PURPOSE);
    if (!secret) return null;
    const step = verifyTotp(secret, digits, u.lastStep);
    if (step == null) return null;
    await db.update(users).set({ totpLastStep: step }).where(eq(users.id, userId));
    return "totp";
  }

  const normalized = normalizeRecoveryCode(input);
  if (normalized.length !== 10) return null;
  const used = await db
    .update(recoveryCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(recoveryCodes.userId, userId),
        eq(recoveryCodes.codeHash, pepperHash(normalized, "recovery")),
        isNull(recoveryCodes.usedAt),
      ),
    )
    .returning({ id: recoveryCodes.id });
  return used.length ? "recovery" : null;
}
