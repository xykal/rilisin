import { SITE } from "@/lib/config";

/** Password yang paling sering dipakai / dibobol (versi ringkas, termasuk yang populer di Indonesia). */
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd", "p@ssword",
  "12345678", "123456789", "1234567890", "0123456789", "12341234", "11223344", "12344321",
  "11111111", "00000000", "88888888", "99999999", "87654321", "987654321", "123123123",
  "qwerty123", "qwertyuiop", "qwerty1234", "1q2w3e4r", "1qaz2wsx", "zxcvbnm123", "asdfghjkl",
  "iloveyou", "iloveyou1", "admin123", "admin1234", "administrator", "abc12345", "abcd1234",
  "letmein123", "welcome123", "sayang123", "sayangku", "sayangkamu", "cintaku", "aku cinta kamu",
  "bismillah", "bismillah123", "indonesia", "indonesia1", "indonesia123", "jakarta123",
  "rahasia", "rahasia123", "katasandi", "katasandi123", "doraemon", "superman", "persib1933",
  "garuda123", "merdeka45", "merdeka1945", "alhamdulillah", "anjing123", "kucing123",
]);

/**
 * Aturan password baru: min. 10 karakter, bukan password umum, tidak mengandung
 * username/email/nama situs. Mengembalikan pesan error, atau null kalau aman.
 */
export function checkNewPassword(
  password: string,
  ctx: { email?: string | null; username?: string | null } = {},
): string | null {
  if (password.length < 10) return "Password minimal 10 karakter";
  if (password.length > 200) return "Password terlalu panjang (maks. 200)";
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || /^(.)\1+$/.test(password)) {
    return "Password ini terlalu umum dan mudah ditebak";
  }
  if (new Set(password).size < 5) return "Password terlalu sederhana — pakai kombinasi yang lebih beragam";
  if (lower.includes(SITE.name.toLowerCase())) return `Password jangan mengandung kata "${SITE.name}"`;
  for (const part of [ctx.username, ctx.email?.split("@")[0]]) {
    if (part && part.length >= 4 && lower.includes(part.toLowerCase())) {
      return "Password jangan mengandung username atau email kamu";
    }
  }
  return null;
}
