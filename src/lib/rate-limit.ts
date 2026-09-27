import "server-only";

/**
 * Rate limiter sederhana di memori (fixed window).
 * Cukup untuk 1 server. Kalau nanti jalan di banyak instance (Vercel), ganti ke
 * Upstash Redis / Supabase supaya hitungannya dibagi antar server.
 */
type Bucket = { count: number; resetAt: number };
const store = (globalThis as unknown as { __rl?: Map<string, Bucket> }).__rl ?? new Map<string, Bucket>();
(globalThis as unknown as { __rl?: Map<string, Bucket> }).__rl = store;

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (store.size > 10_000) {
    for (const [k, b] of store) if (b.resetAt < now) store.delete(k);
  }
  const bucket = store.get(key);
  if (!bucket || bucket.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  bucket.count++;
  if (bucket.count > limit) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}
