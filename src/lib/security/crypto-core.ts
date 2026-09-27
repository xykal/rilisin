/**
 * Inti kriptografi TANPA penanda "server-only" supaya bisa dipakai script Node (seed, migrasi).
 * Kode aplikasi tetap impor dari "./crypto" (yang menambahkan pengaman server-only).
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

/**
 * Kunci turunan dari APP_SECRET (HKDF) — satu rahasia utama, kunci berbeda per keperluan,
 * jadi bocornya satu kunci turunan tidak membuka yang lain.
 */
function masterSecret() {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) {
    throw new Error("APP_SECRET belum diisi / terlalu pendek (min. 32 karakter)");
  }
  return s;
}

function derivedKey(purpose: string) {
  return Buffer.from(hkdfSync("sha256", masterSecret(), "rilisin-v1", purpose, 32));
}

/** Enkripsi AES-256-GCM (terautentikasi). Format: v1.iv.tag.ciphertext (base64url). */
export function encryptString(plain: string, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(`enc:${purpose}`), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptString(payload: string | null | undefined, purpose: string): string | null {
  if (!payload) return null;
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", derivedKey(`enc:${purpose}`), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** HMAC dengan kunci rahasia ("pepper") — dipakai untuk hash kode cadangan 2FA. */
export function pepperHash(value: string, purpose: string) {
  return createHmac("sha256", derivedKey(`mac:${purpose}`)).update(value).digest("hex");
}

export function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

/** Kode acak mudah dibaca (tanpa 0/O/1/l/i). */
export function randomCode(length: number) {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}
