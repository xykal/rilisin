import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Dua lapis rate limit:
 *  - `rateLimit` (memori, per instance, sinkron): murah — untuk hal yang sering & risikonya kecil
 *    (indikator mengetik, polling notifikasi, stream chat).
 *  - `sharedLimit` (Postgres, dibagi semua instance): untuk jalur keamanan & anti-abuse (login, daftar,
 *    reset password, lapor, kirim chat, unduh, checkout). Di Vercel request bisa jatuh ke instance berbeda,
 *    jadi limit di memori saja bisa diakali dengan mengulang request.
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

/** Kunci disimpan sebagai hash (tidak ada IP / email mentah di database — UU PDP). */
function hashKey(key: string) {
  return createHash("sha256").update(`${key}:${process.env.APP_SECRET ?? ""}`).digest("base64url").slice(0, 32);
}

/**
 * Rate limit fixed-window yang konsisten di semua instance: satu INSERT … ON CONFLICT atomik per cek.
 * Kalau database sedang bermasalah, jatuh ke limit memori (tidak mengunci semua user karena gangguan infrastruktur).
 */
export async function sharedLimit(key: string, limit: number, windowMs: number) {
  const windowSec = Math.max(1, Math.round(windowMs / 1000));
  const nowSec = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(nowSec / windowSec);
  try {
    const rows = await db.execute<{ count: number }>(sql`
      insert into rate_limits (key, bucket, count, expires_at)
      values (${hashKey(key)}, ${bucket}, 1, to_timestamp(${(bucket + 1) * windowSec}))
      on conflict (key, bucket) do update set count = rate_limits.count + 1
      returning count
    `);
    const count = Number(rows[0]?.count ?? 1);
    if (count > limit) return { ok: false, retryAfterSec: Math.max(1, (bucket + 1) * windowSec - nowSec) };
    return { ok: true, retryAfterSec: 0 };
  } catch (err) {
    console.error("[rate-limit] database gagal, pakai limit memori", (err as Error).message);
    return rateLimit(`fallback:${key}`, limit, windowMs);
  }
}
