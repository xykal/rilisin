"use server";

import { eq, or, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { clearMfaChallenge, createMfaChallenge, MFA_MAX_ATTEMPTS, readMfaChallenge, verifySecondFactor } from "@/lib/auth/mfa";
import { fakePasswordCheck, hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { RESERVED_USERNAMES } from "@/lib/config";
import { db } from "@/lib/db";
import { authChallenges, users } from "@/lib/db/schema";
import { getClientIp } from "@/lib/http";
import { consumeSharedLimit, peekSharedLimit, sharedLimit } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security/events";
import { checkFormGuard } from "@/lib/security/form-guard";
import { loginNeedsChallenge, verifyTurnstile } from "@/lib/security/turnstile";
import { getAccountLock, LOCK_THRESHOLD } from "@/lib/security/login-guard";
import { checkNewPassword } from "@/lib/security/password-policy";
import { safeNextPath } from "@/lib/slug";
import { fieldErrorsFrom, type FormState } from "./form-state";

const registerSchema = z.object({
  displayName: z.string().trim().min(2, "Nama minimal 2 karakter").max(50, "Nama maksimal 50 karakter"),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{2,19}$/, "3–20 karakter: huruf kecil, angka, atau _ (diawali huruf)"),
  email: z.string().trim().toLowerCase().max(200).pipe(z.email("Format email tidak valid")),
  password: z.string().max(200, "Password terlalu panjang"),
});

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ip = await getClientIp();
  const rl = await sharedLimit(`register:${ip}`, 10, 60 * 60 * 1000);
  if (!rl.ok) return { error: "Terlalu banyak percobaan daftar. Coba lagi nanti." };

  const values = {
    displayName: String(formData.get("displayName") ?? ""),
    username: String(formData.get("username") ?? ""),
    email: String(formData.get("email") ?? ""),
  };
  // Anti-bot: honeypot + form yang dikirim terlalu cepat
  if (!checkFormGuard(formData)) {
    await logSecurityEvent("bot_blocked", { meta: { form: "register" } });
    return { error: "Pendaftaran gagal diverifikasi. Muat ulang halaman lalu coba lagi.", values };
  }
  const human = await verifyTurnstile(formData, { action: "daftar", ip });
  if (!human.ok) {
    await logSecurityEvent("bot_blocked", { meta: { form: "register", reason: "turnstile" } });
    return { error: human.reason, values };
  }

  const parsed = registerSchema.safeParse({ ...values, password: formData.get("password") ?? "" });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };

  const { displayName, username, email, password } = parsed.data;
  if (RESERVED_USERNAMES.has(username)) {
    return { fieldErrors: { username: "Username ini tidak bisa dipakai" }, values };
  }
  const weak = checkNewPassword(password, { email, username });
  if (weak) return { fieldErrors: { password: weak }, values };

  const existing = await db
    .select({ email: users.email, username: users.username })
    .from(users)
    .where(or(sql`lower(${users.email}) = ${email}`, sql`lower(${users.username}) = ${username}`));
  const fieldErrors: Record<string, string> = {};
  if (existing.some((u) => u.email.toLowerCase() === email)) fieldErrors.email = "Email sudah terdaftar — silakan masuk";
  if (existing.some((u) => u.username.toLowerCase() === username)) fieldErrors.username = "Username sudah dipakai";
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  let userId: string;
  try {
    const [user] = await db
      .insert(users)
      .values({ email, username, displayName, passwordHash: await hashPassword(password) })
      .returning({ id: users.id });
    userId = user!.id;
  } catch {
    return { error: "Gagal membuat akun (mungkin email/username baru saja dipakai). Coba lagi.", values };
  }

  await logSecurityEvent("register", { userId });
  await createSession(userId);
  redirect(safeNextPath(formData.get("next"), "/"));
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const identifier = String(formData.get("identifier") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(formData.get("password") ?? "");
  const values = { identifier };
  if (!identifier || !password) return { error: "Isi email/username dan password.", values };
  if (!checkFormGuard(formData, { requireToken: false })) {
    await logSecurityEvent("bot_blocked", { meta: { form: "login" } });
    return { error: "Email/username atau password salah.", values };
  }

  const ip = await getClientIp();
  // Hanya menghitung percobaan GAGAL (lihat consumeSharedLimit di bawah): banyak pengguna sah berbagi satu IP
  // (NAT operator seluler, WiFi kantor/kampus). Kalau semua percobaan dihitung, satu orang brute force bisa
  // mengunci login seluruh jaringan. Brute force selalu gagal, jadi kegagalanlah yang dihitung.
  const rlIp = await peekSharedLimit(`login-ip:${ip}`, 30, 10 * 60 * 1000);
  const rlId = await peekSharedLimit(`login-id:${identifier}`, 10, 10 * 60 * 1000);
  if (!rlIp.ok || !rlId.ok) {
    return { error: "Terlalu banyak percobaan masuk. Tunggu beberapa menit lalu coba lagi.", values };
  }
  // Setelah ≥ 3 kali salah dari jaringan ini: wajib lolos Turnstile (bot tebak password berhenti di sini)
  if (await loginNeedsChallenge(ip)) {
    const human = await verifyTurnstile(formData, { action: "masuk", ip });
    if (!human.ok) return { error: human.reason, values, challenge: true };
  }

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash, bannedAt: users.bannedAt, totpEnabledAt: users.totpEnabledAt })
    .from(users)
    .where(
      identifier.includes("@")
        ? sql`lower(${users.email}) = ${identifier}`
        : sql`lower(${users.username}) = ${identifier}`,
    )
    .limit(1);

  // Akun dikunci sementara setelah terlalu banyak password salah (dicek SEBELUM verifikasi password)
  if (user) {
    const lock = await getAccountLock(user.id);
    if (lock.locked) {
      await fakePasswordCheck();
      return { error: `Akun dikunci sementara karena terlalu banyak percobaan gagal. Coba lagi dalam ${lock.minutes} menit.`, values };
    }
  }

  const valid = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : await fakePasswordCheck();
  if (!user || !valid) {
    // Percobaan gagal → baru dihitung ke limit IP & identifier (pasangan peekSharedLimit di atas)
    await Promise.all([consumeSharedLimit(`login-ip:${ip}`, 10 * 60 * 1000), consumeSharedLimit(`login-id:${identifier}`, 10 * 60 * 1000)]);
    if (user) {
      await logSecurityEvent("login_failed", { userId: user.id });
      const lock = await getAccountLock(user.id);
      if (lock.failures === LOCK_THRESHOLD) await logSecurityEvent("login_locked", { userId: user.id });
    } else {
      // Dicatat juga (tanpa akun) supaya tebak-tebakan email acak dari satu jaringan ikut memicu Turnstile
      await logSecurityEvent("login_failed", { meta: { unknownAccount: true } });
    }
    return { error: "Email/username atau password salah.", values, challenge: await loginNeedsChallenge(ip) };
  }
  if (user.bannedAt) return { error: "Akun ini sedang dinonaktifkan. Hubungi admin.", values };

  const next = safeNextPath(formData.get("next"), "/");
  if (user.totpEnabledAt) {
    await createMfaChallenge(user.id, next);
    redirect("/masuk/verifikasi");
  }

  await createSession(user.id);
  await logSecurityEvent("login_success", { userId: user.id });
  redirect(next);
}

/** Langkah ke-2 login: kode 6 digit dari aplikasi authenticator, atau kode cadangan. */
export async function verifyMfaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const challenge = await readMfaChallenge();
  if (!challenge) return { error: "Sesi verifikasi sudah habis. Silakan masuk ulang.", values: { expired: "1" } };

  const ip = await getClientIp();
  if (!(await sharedLimit(`mfa-ip:${ip}`, 20, 10 * 60 * 1000)).ok) {
    return { error: "Terlalu banyak percobaan. Tunggu beberapa menit." };
  }

  const code = String(formData.get("code") ?? "").trim().slice(0, 40);
  const result = code ? await verifySecondFactor(challenge.userId, code) : null;
  if (!result) {
    const attempts = challenge.attempts + 1;
    await logSecurityEvent("mfa_challenge_failed", { userId: challenge.userId, meta: { attempts } });
    if (attempts >= MFA_MAX_ATTEMPTS) {
      await clearMfaChallenge(challenge.id);
      await logSecurityEvent("mfa_challenge_locked", { userId: challenge.userId });
      return { error: "Terlalu banyak kode salah. Demi keamanan, silakan masuk ulang dari awal.", values: { expired: "1" } };
    }
    await db.update(authChallenges).set({ attempts }).where(eq(authChallenges.id, challenge.id));
    return { error: `Kode salah atau sudah kedaluwarsa. Sisa percobaan: ${MFA_MAX_ATTEMPTS - attempts}.` };
  }

  const [user] = await db.select({ bannedAt: users.bannedAt }).from(users).where(eq(users.id, challenge.userId));
  await clearMfaChallenge(challenge.id);
  if (!user || user.bannedAt) return { error: "Akun ini sedang dinonaktifkan. Hubungi admin.", values: { expired: "1" } };

  await createSession(challenge.userId);
  await logSecurityEvent(result === "recovery" ? "recovery_code_used" : "login_success", {
    userId: challenge.userId,
    meta: { mfa: result },
  });
  redirect(safeNextPath(challenge.nextPath, "/"));
}

export async function cancelMfaAction() {
  const challenge = await readMfaChallenge();
  await clearMfaChallenge(challenge?.id);
  redirect("/masuk");
}

export async function logoutAction() {
  const user = await getCurrentUser();
  await destroySession();
  if (user) await logSecurityEvent("logout", { userId: user.id });
  redirect("/");
}
