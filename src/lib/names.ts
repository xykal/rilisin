import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { sellerProfiles, users } from "@/lib/db/schema";
import { RESERVED_USERNAMES } from "@/lib/config";

/**
 * Aturan nama terpusat: dipakai live-check (/api/check-nama) + validasi submit form.
 * Username: format registerSchema (auth.ts). Nama toko: format storeSchema (seller.ts) + unik.
 */
export const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/;
export const USERNAME_RULE = "3–20 karakter: huruf kecil, angka, atau _ (diawali huruf)";

export function usernameFormatError(value: string): string | null {
  const u = value.trim().toLowerCase();
  if (!USERNAME_RE.test(u)) return USERNAME_RULE;
  if (RESERVED_USERNAMES.has(u)) return "Username ini tidak bisa dipakai";
  return null;
}

export function storeNameFormatError(value: string): string | null {
  const s = value.trim();
  if (s.length < 2) return "Nama toko minimal 2 karakter";
  if (s.length > 50) return "Maksimal 50 karakter";
  if (RESERVED_USERNAMES.has(s.toLowerCase())) return "Nama toko ini tidak bisa dipakai";
  return null;
}

export async function usernameTaken(value: string): Promise<boolean> {
  const u = value.trim().toLowerCase();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = ${u}`)
    .limit(1);
  return rows.length > 0;
}

/** exceptUserId = pemilik toko sendiri (form edit boleh menyimpan nama yang sama). */
export async function storeNameTaken(value: string, exceptUserId?: string | null): Promise<boolean> {
  const name = value.trim().toLowerCase();
  const rows = await db
    .select({ userId: sellerProfiles.userId })
    .from(sellerProfiles)
    .where(sql`lower(${sellerProfiles.storeName}) = ${name}`)
    .limit(2);
  if (!rows.length) return false;
  if (exceptUserId && rows.every((r) => r.userId === exceptUserId)) return false;
  return true;
}

export type NameCheckType = "username" | "toko";

export async function checkName(
  tipe: NameCheckType,
  nilai: string,
  exceptUserId?: string | null,
): Promise<{ tersedia: boolean; pesan: string }> {
  if (tipe === "username") {
    const ferr = usernameFormatError(nilai);
    if (ferr) return { tersedia: false, pesan: ferr };
    if (await usernameTaken(nilai)) return { tersedia: false, pesan: "Username sudah dipakai" };
    return { tersedia: true, pesan: "Username tersedia" };
  }
  const ferr = storeNameFormatError(nilai);
  if (ferr) return { tersedia: false, pesan: ferr };
  if (await storeNameTaken(nilai, exceptUserId)) return { tersedia: false, pesan: "Nama toko sudah dipakai" };
  return { tersedia: true, pesan: "Nama toko tersedia" };
}
