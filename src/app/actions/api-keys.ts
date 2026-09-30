"use server";

import { and, count, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { API_SCOPES, createApiKey, revokeApiKey as revokeKey, type ApiScope } from "@/lib/api-keys";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { sharedLimit } from "@/lib/rate-limit";
import { fieldErrorsFrom, type FormState } from "./form-state";

/** Bikin API key. Secret dikembalikan sekali di respons (success) — salin sekarang atau hilang selamanya. */
export async function createApiKeyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Masuk dulu." };
  const values = { name: String(formData.get("name") ?? "") };
  const rl = await sharedLimit(`apikey:${user.id}`, 10, 60 * 60_000);
  if (!rl.ok) return { error: "Terlalu sering. Coba lagi nanti.", values };
  const name = values.name.trim();
  if (name.length < 2 || name.length > 60) return { fieldErrors: { name: "Nama 2–60 karakter" }, values };
  const picked = formData.getAll("scopes").map(String).filter((s): s is ApiScope => (API_SCOPES as readonly string[]).includes(s));
  // Scope dikunci ke peran: seller butuh toko approved, admin:read butuh staf.
  const allowed: ApiScope[] = [];
  if (user.seller?.status === "approved") allowed.push("seller:read", "seller:write");
  if (user.role === "admin" || user.role === "moderator") allowed.push("admin:read");
  const scopes = [...new Set(picked.filter((s) => allowed.includes(s)))];
  if (!scopes.length) return { error: "Pilih minimal 1 scope yang sesuai peranmu (toko approved / staf).", values };
  const expRaw = String(formData.get("expires") ?? "never");
  const expiresAt = expRaw === "30d" ? new Date(Date.now() + 30 * 86400_000) : expRaw === "90d" ? new Date(Date.now() + 90 * 86400_000) : null;
  const [{ n }] = await db.select({ n: count() }).from(apiKeys).where(and(eq(apiKeys.userId, user.id), isNull(apiKeys.revokedAt)));
  if ((n ?? 0) >= 10) return { error: "Maksimal 10 API key aktif. Cabut yang tidak dipakai dulu.", values };
  const key = await createApiKey(user.id, { name, scopes, expiresAt });
  revalidatePath("/akun/api-key");
  return { success: `API key dibuat. Salin sekarang — tidak akan ditampilkan lagi: ${key.secret}`, values: {} };
}

export async function revokeApiKeyAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/masuk?next=/akun/api-key");
  await revokeKey(user.id, String(formData.get("keyId") ?? ""));
  revalidatePath("/akun/api-key");
  redirect("/akun/api-key?hasil=cabut");
}
