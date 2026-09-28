"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { issueRecoveryCodes, TOTP_PURPOSE, verifySecondFactor } from "@/lib/auth/mfa";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { revokeOtherSessions } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { recoveryCodes, sessions, users } from "@/lib/db/schema";
import { sharedLimit } from "@/lib/rate-limit";
import { decryptString, encryptString } from "@/lib/security/crypto";
import { logSecurityEvent } from "@/lib/security/events";
import { checkNewPassword } from "@/lib/security/password-policy";
import { generateTotpSecret, verifyTotp } from "@/lib/security/totp";
import type { FormState } from "./form-state";

/** Re-autentikasi: aksi sensitif wajib memasukkan password saat ini. */
async function checkCurrentPassword(userId: string, password: string) {
  const rl = await sharedLimit(`reauth:${userId}`, 8, 15 * 60 * 1000);
  if (!rl.ok) return "Terlalu banyak percobaan. Tunggu beberapa menit.";
  const [u] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, userId));
  if (!u || !(await verifyPassword(password, u.hash))) return "Password saat ini salah.";
  return null;
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/akun/keamanan");
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  const err = await checkCurrentPassword(user.id, current);
  if (err) return { fieldErrors: { currentPassword: err } };
  const weak = checkNewPassword(next, { email: user.email, username: user.username });
  if (weak) return { fieldErrors: { newPassword: weak } };
  if (next !== confirm) return { fieldErrors: { confirmPassword: "Konfirmasi password tidak sama" } };
  if (next === current) return { fieldErrors: { newPassword: "Password baru harus berbeda dari yang lama" } };

  await db.update(users).set({ passwordHash: await hashPassword(next), passwordChangedAt: new Date() }).where(eq(users.id, user.id));
  const revoked = await revokeOtherSessions(user.id, user.sessionId);
  await logSecurityEvent("password_changed", { userId: user.id, meta: { revokedSessions: revoked } });
  revalidatePath("/akun/keamanan");
  return { success: revoked ? `Password diganti. ${revoked} perangkat lain otomatis dikeluarkan.` : "Password berhasil diganti." };
}

export async function revokeSessionAction(formData: FormData) {
  const user = await requireUser("/akun/keamanan");
  const id = String(formData.get("sessionId") ?? "");
  if (!/^[0-9a-f]{64}$/.test(id) || id === user.sessionId) return;
  const rows = await db
    .delete(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, user.id)))
    .returning({ id: sessions.id });
  if (rows.length) await logSecurityEvent("session_revoked", { userId: user.id });
  revalidatePath("/akun/keamanan");
}

export async function revokeOtherSessionsAction() {
  const user = await requireUser("/akun/keamanan");
  const n = await revokeOtherSessions(user.id, user.sessionId);
  await logSecurityEvent("sessions_revoked_all", { userId: user.id, meta: { count: n } });
  revalidatePath("/akun/keamanan");
}

// ─── 2FA (TOTP) ─────────────────────────────────────────────────────────────
export async function startTotpSetupAction() {
  const user = await requireUser("/akun/keamanan");
  if (!user.mfaEnabled) {
    await db
      .update(users)
      .set({ totpPendingEnc: encryptString(generateTotpSecret(), TOTP_PURPOSE) })
      .where(eq(users.id, user.id));
  }
  redirect("/akun/keamanan/2fa");
}

export type RecoveryState = (NonNullable<FormState> & { codes?: string[] }) | undefined;

export async function confirmTotpSetupAction(_prev: RecoveryState, formData: FormData): Promise<RecoveryState> {
  const user = await requireUser("/akun/keamanan");
  if (!(await sharedLimit(`totp-setup:${user.id}`, 10, 10 * 60 * 1000)).ok) return { error: "Terlalu banyak percobaan. Tunggu sebentar." };
  const [u] = await db.select({ pending: users.totpPendingEnc, enabled: users.totpEnabledAt }).from(users).where(eq(users.id, user.id));
  if (u?.enabled) return { error: "2FA sudah aktif." };
  const secret = decryptString(u?.pending, TOTP_PURPOSE);
  if (!secret) return { error: "Sesi aktivasi habis. Mulai ulang dari halaman Keamanan akun." };

  const step = verifyTotp(secret, String(formData.get("code") ?? ""));
  if (step == null) return { fieldErrors: { code: "Kode salah. Pastikan jam di HP sudah otomatis, lalu masukkan kode terbaru." } };

  await db
    .update(users)
    .set({ totpSecretEnc: encryptString(secret, TOTP_PURPOSE), totpPendingEnc: null, totpEnabledAt: new Date(), totpLastStep: step })
    .where(eq(users.id, user.id));
  const codes = await issueRecoveryCodes(user.id);
  // Keamanan naik level → keluarkan sesi lain yang mungkin dibuat sebelum 2FA aktif
  const revoked = await revokeOtherSessions(user.id, user.sessionId);
  await logSecurityEvent("mfa_enabled", { userId: user.id, meta: { revokedSessions: revoked } });
  revalidatePath("/akun/keamanan");
  return { success: "2FA aktif!", codes };
}

export async function disableTotpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/akun/keamanan");
  const err = await checkCurrentPassword(user.id, String(formData.get("password") ?? ""));
  if (err) return { fieldErrors: { password: err } };
  const ok = await verifySecondFactor(user.id, String(formData.get("code") ?? ""));
  if (!ok) return { fieldErrors: { code: "Kode 2FA / kode cadangan salah." } };
  await db
    .update(users)
    .set({ totpSecretEnc: null, totpPendingEnc: null, totpEnabledAt: null, totpLastStep: null })
    .where(eq(users.id, user.id));
  await db.delete(recoveryCodes).where(eq(recoveryCodes.userId, user.id));
  await logSecurityEvent("mfa_disabled", { userId: user.id });
  revalidatePath("/akun/keamanan");
  return { success: "2FA dimatikan. Kami sarankan mengaktifkannya lagi secepatnya." };
}

export async function regenerateRecoveryCodesAction(_prev: RecoveryState, formData: FormData): Promise<RecoveryState> {
  const user = await requireUser("/akun/keamanan");
  if (!user.mfaEnabled) return { error: "Aktifkan 2FA dulu." };
  const err = await checkCurrentPassword(user.id, String(formData.get("password") ?? ""));
  if (err) return { fieldErrors: { password: err } };
  const codes = await issueRecoveryCodes(user.id);
  await logSecurityEvent("recovery_codes_regenerated", { userId: user.id });
  revalidatePath("/akun/keamanan");
  return { success: "Kode cadangan baru dibuat. Kode lama tidak berlaku lagi.", codes };
}
