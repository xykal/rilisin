/**
 * Pembersihan teks pesan (dipakai server sebelum menyimpan).
 *  - Buang karakter kontrol & karakter tak terlihat yang bisa dipakai menipu tampilan
 *    (bidi override ala "Trojan Source", zero-width, Hangul filler untuk pesan "kosong").
 *    ZWJ (U+200D) & variation selector (U+FE0F) dipertahankan karena dipakai emoji.
 *  - Batasi tanda diakritik bertumpuk ("zalgo" text) maks 2 per huruf.
 *  - Rapikan baris kosong berlebihan.
 */
const INVISIBLE_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\u3164\uFEFF\uFFA0\uFFF9-\uFFFB]/g;

export function normalizeMessage(input: string) {
  return input
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE_RE, "")
    .replace(/(\p{M}{2})\p{M}+/gu, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

/** Link yang dirender bisa diklik (hanya http/https — tidak ada javascript:/data:). */
export const LINKIFY_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]{2,2000}/gi;

/** Deteksi link untuk aturan anti-spam (termasuk domain tanpa http, misal situs.xyz, wa.me). */
const LINKISH_RE =
  /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,63}\.(?:com|net|org|id|co\.id|my\.id|biz\.id|xyz|site|online|top|vip|link|info|me|io|app|dev|ly|gg|club|shop|store|live|pro|cc|tk|ml|ga|cf|ru|cn)\b(?:\/\S*)?/gi;

export function countLinks(text: string) {
  return (text.match(LINKISH_RE) ?? []).length;
}

const EMOJI_ONLY_RE =
  /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*|\p{Regional_Indicator}{2}|\s)+$/u;

/** Pesan berisi 1–3 emoji saja → ditampilkan besar (seperti WhatsApp). */
export function isEmojiOnly(text: string) {
  const t = text.trim();
  if (!t || t.length > 32 || !EMOJI_ONLY_RE.test(t)) return false;
  const count = [...new Intl.Segmenter("id", { granularity: "grapheme" }).segment(t.replace(/\s/g, ""))].length;
  return count >= 1 && count <= 3;
}
