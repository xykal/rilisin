"use server";

import { redirect } from "next/navigation";
import { clearResetCookie, completePasswordReset, readResetCookie, requestPasswordReset, RESET_TTL_MIN } from "@/lib/auth/password-reset";
import { getClientIp } from "@/lib/http";
import { logSecurityEvent } from "@/lib/security/events";
import { checkFormGuard } from "@/lib/security/form-guard";
import { verifyTurnstile } from "@/lib/security/turnstile";
import type { FormState } from "./form-state";

export async function requestResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().slice(0, 200);
  if (!checkFormGuard(formData)) {
    await logSecurityEvent("bot_blocked", { meta: { form: "lupa_password" } });
    return { error: "Permintaan ditolak. Muat ulang halaman lalu coba lagi.", values: { email } };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Masukkan alamat email yang valid.", fieldErrors: { email: "Email tidak valid" }, values: { email } };
  const ip = await getClientIp();
  const human = await verifyTurnstile(formData, { action: "lupa-password", ip });
  if (!human.ok) return { error: human.reason, values: { email } };
  const r = await requestPasswordReset(email, ip);
  if (r.limited) return { error: "Terlalu banyak permintaan dari jaringan ini. Coba lagi 15 menit lagi.", values: { email } };
  return {
    success: `Kalau ${email} terdaftar, link untuk mengatur ulang password sudah dikirim. Cek inbox dan folder spam — link berlaku ${RESET_TTL_MIN} menit.`,
  };
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = await readResetCookie();
  if (!token) return { error: "Sesi reset habis. Buka lagi link dari email atau minta link baru." };
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password !== confirm) return { error: "Konfirmasi password tidak sama.", fieldErrors: { confirm: "Tidak sama dengan password baru" } };
  const r = await completePasswordReset(token, password);
  if ("error" in r) return { error: r.error, fieldErrors: "field" in r && r.field ? { [r.field]: r.error } : undefined };
  await clearResetCookie();
  redirect("/masuk?reset=1");
}
