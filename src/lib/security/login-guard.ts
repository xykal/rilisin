import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/** Kunci akun sementara setelah terlalu banyak password salah (tahan brute force terdistribusi). */
export const LOCK_THRESHOLD = 8;
export const LOCK_WINDOW_MIN = 15;

export async function getAccountLock(userId: string) {
  const rows = await db.execute<{ failures: number; last_failed: Date | null }>(sql`
    select count(*)::int as failures, max(created_at) as last_failed
    from security_events
    where user_id = ${userId}
      and type = 'login_failed'
      and created_at > greatest(
        now() - make_interval(mins => ${LOCK_WINDOW_MIN}),
        coalesce((select max(created_at) from security_events
                  where user_id = ${userId} and type = 'login_success'), 'epoch'::timestamptz)
      )
  `);
  const failures = Number(rows[0]?.failures ?? 0);
  const last = rows[0]?.last_failed ? new Date(rows[0].last_failed) : null;
  if (failures >= LOCK_THRESHOLD && last) {
    const unlockAt = last.getTime() + LOCK_WINDOW_MIN * 60_000;
    const minutes = Math.max(1, Math.ceil((unlockAt - Date.now()) / 60_000));
    return { locked: true as const, failures, minutes };
  }
  return { locked: false as const, failures, minutes: 0 };
}
