"use server";

import type { FormState } from "@/app/actions/form-state";
import { clearVerifyCookie, completeEmailVerification, readVerifyCookie } from "@/lib/auth/email-verification";

/** Konfirmasi verifikasi email memakai token yang ada di cookie (dikirim dari halaman ini). */
export async function confirmVerificationAction(): Promise<FormState> {
  const token = await readVerifyCookie();
  if (!token) return { error: "Link verifikasi tidak ada. Minta link baru ya." };
  const result = await completeEmailVerification(token);
  await clearVerifyCookie();
  if ("error" in result) return { error: result.error };
  return { success: `${result.email} sudah terverifikasi. Semua fitur akun sudah terbuka.` };
}
