import "server-only";
import { isSameOrigin } from "./http";

/** Helper JSON untuk route handler API (selalu no-store: data per-user tidak boleh di-cache). */
export function json(data: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...extraHeaders },
  });
}

export function apiError(status: number, error: string, extra: Record<string, unknown> = {}) {
  const headers: Record<string, string> = {};
  if (typeof extra.retryAfter === "number") headers["Retry-After"] = String(extra.retryAfter);
  return json({ error, ...extra }, status, headers);
}

/**
 * Proteksi endpoint yang mengubah data:
 *  - Origin wajib dari app ini (CSRF)
 *  - Content-Type wajib application/json → form HTML dari situs lain tidak bisa mengirim ini
 *    tanpa preflight CORS (yang pasti kita tolak).
 */
export function guardMutation(req: Request, opts: { contentType?: RegExp; allowEmpty?: boolean } = {}) {
  if (!isSameOrigin(req)) return apiError(403, "Origin tidak diizinkan");
  const ct = req.headers.get("content-type") ?? "";
  if (ct === "" && opts.allowEmpty) return null;
  if (!(opts.contentType ?? /^application\/json\b/i).test(ct)) {
    return apiError(415, "Content-Type tidak didukung");
  }
  return null;
}

/** Tolak request baca yang jelas datang dari situs lain (Sec-Fetch-Site dikirim browser modern). */
export function guardRead(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return apiError(403, "Akses lintas situs ditolak");
  return null;
}

/** Baca body JSON dengan batas ukuran (default 16 KB) supaya tidak bisa dibanjiri body raksasa. */
export async function readJsonBody<T = unknown>(req: Request, maxBytes = 16 * 1024): Promise<T | null> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return null;
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
  } catch {
    return null;
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
