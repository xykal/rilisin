import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { safeEqual } from "./crypto";

/**
 * TOTP (RFC 6238) — kompatibel dengan Google Authenticator, Microsoft Authenticator,
 * Authy, 1Password, Bitwarden, dll. Tanpa dependency tambahan.
 */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_PERIOD = 30;

export function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string) {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = ((value << 5) | B32.indexOf(ch)) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20)); // 160 bit, sesuai rekomendasi RFC 4226
}

export function totpAt(secretB32: string, step: number, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secretB32)).update(msg).digest();
  const off = h[h.length - 1]! & 0xf;
  const bin = ((h[off]! & 0x7f) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export function currentStep(nowMs = Date.now()) {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD);
}

/**
 * Verifikasi kode 6 digit (toleransi ±1 langkah ≈ ±30 detik untuk jam HP yang meleset).
 * Kode dari langkah yang sudah pernah dipakai ditolak (anti replay).
 * @returns time-step yang cocok, atau null.
 */
export function verifyTotp(secretB32: string, code: string, lastUsedStep?: number | null) {
  const c = code.replace(/[\s-]/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const now = currentStep();
  for (const step of [now, now - 1, now + 1]) {
    if (lastUsedStep != null && step <= lastUsedStep) continue;
    if (safeEqual(totpAt(secretB32, step), c)) return step;
  }
  return null;
}

export function otpauthUri(opts: { secret: string; account: string; issuer: string }) {
  const label = `${encodeURIComponent(opts.issuer)}:${encodeURIComponent(opts.account)}`;
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer: opts.issuer,
    algorithm: "SHA1",
    digits: "6",
    period: String(TOTP_PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Tampilkan secret per 4 karakter supaya mudah diketik manual. */
export function formatSecret(secret: string) {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}
