import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Token bertanda tangan (HMAC-SHA256) untuk upload & download file.
 * Format: base64url(JSON payload) + "." + base64url(signature)
 * Stateless: tidak perlu tabel, cukup APP_SECRET yang sama di semua server.
 */
function secret() {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) {
    throw new Error("APP_SECRET belum diisi / terlalu pendek (min. 32 karakter)");
  }
  return s;
}

function sign(data: string) {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function signToken<T extends object>(
  type: string,
  payload: T,
  ttlSeconds: number,
): string {
  const body = Buffer.from(
    JSON.stringify({ ...payload, typ: type, exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyToken<T>(type: string, token: string | null | undefined): T | null {
  if (!token || token.length > 4096) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.typ !== type) return null;
    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) return null;
    return payload as T;
  } catch {
    return null;
  }
}
