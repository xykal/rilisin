import "server-only";
import { and, desc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { backupConfigured, runBackup } from "@/lib/backup";
import { db } from "@/lib/db";
import { chatMessageEdits, chatMessages, chatUploads, jobRuns, systemKv } from "@/lib/db/schema";
import { expireOverdueOrders } from "@/lib/payments/orders";
import { storage } from "@/lib/storage";

/** Jalankan tugas + catat di job_runs (dilihat di halaman Sistem admin). Error tidak menghentikan tugas lain. */
export async function runJob<T extends Record<string, unknown>>(job: string, fn: () => Promise<T>) {
  const [row] = await db.insert(jobRuns).values({ job }).returning({ id: jobRuns.id });
  try {
    const details = await fn();
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: true, details }).where(eq(jobRuns.id, row!.id));
    return { ok: true as const, details };
  } catch (err) {
    const details = { error: (err as Error).message.slice(0, 500) };
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: false, details }).where(eq(jobRuns.id, row!.id));
    console.error(`[job:${job}] gagal`, err);
    return { ok: false as const, details };
  }
}

const count = (r: unknown) => (Array.isArray(r) ? r.length : 0);

/**
 * Pembersihan harian (data kedaluwarsa & sampah). Semua batas waktu konservatif; tidak menyentuh data aktif.
 * Dipanggil cron Vercel sekali sehari (Hobby) atau manual dari halaman Sistem.
 */
export async function cleanup() {
  const out: Record<string, number> = {};
  out.sesiKedaluwarsa = count(await db.execute(sql`delete from sessions where expires_at < now() returning id`));
  out.tantangan2fa = count(await db.execute(sql`delete from auth_challenges where expires_at < now() returning id`));
  out.tokenResetLama = count(await db.execute(sql`delete from password_resets where created_at < now() - interval '1 day' returning id`));
  out.notifikasiLama = count(await db.execute(sql`delete from notifications where read_at is not null and updated_at < now() - interval '90 days' returning id`));
  out.rateLimitLama = count(await db.execute(sql`delete from rate_limits where expires_at < now() returning key`));
  out.logKeamananLama = count(await db.execute(sql`delete from security_events where created_at < now() - interval '365 days' returning id`));
  out.riwayatTugasLama = count(await db.execute(sql`delete from job_runs where started_at < now() - interval '90 days' returning id`));

  // Gambar chat yang diupload tapi tidak pernah dikirim (> 1 hari)
  const orphans = await db
    .select({ id: chatUploads.id, key: chatUploads.storageKey })
    .from(chatUploads)
    .where(and(isNull(chatUploads.usedAt), lt(chatUploads.createdAt, sql`now() - interval '1 day'`)))
    .limit(500);
  for (const o of orphans) await storage().remove(o.key).catch(() => {});
  if (orphans.length) await db.delete(chatUploads).where(inArray(chatUploads.id, orphans.map((o) => o.id)));
  out.gambarChatTakTerpakai = orphans.length;

  // Pesan chat yang "dihapus untuk semua" > 30 hari: isi & gambar dihapus permanen (baris tetap untuk urutan percakapan)
  const purged = await db
    .select({ id: chatMessages.id, imageKey: chatMessages.imageKey })
    .from(chatMessages)
    .where(and(isNotNull(chatMessages.deletedAt), lt(chatMessages.deletedAt, sql`now() - interval '30 days'`), sql`(${chatMessages.body} <> '' or ${chatMessages.imageKey} is not null)`))
    .limit(1000);
  for (const m of purged) if (m.imageKey) await storage().remove(m.imageKey).catch(() => {});
  if (purged.length) {
    const ids = purged.map((m) => m.id);
    await db.update(chatMessages).set({ body: "", imageKey: null, imageW: null, imageH: null }).where(inArray(chatMessages.id, ids));
    await db.delete(chatMessageEdits).where(inArray(chatMessageEdits.messageId, ids));
  }
  out.isiPesanTerhapusDibersihkan = purged.length;

  // Upload mentah yang tidak pernah difinalisasi (> 1 hari)
  let tmpRemoved = 0;
  try {
    const stale = (await storage().list("tmp/")).filter((f) => Date.now() - f.uploadedAt.getTime() > 86_400_000).slice(0, 500);
    for (const f of stale) {
      await storage().remove(f.key).catch(() => {});
      tmpRemoved++;
    }
  } catch (err) {
    console.error("[cleanup] daftar tmp gagal", (err as Error).message);
  }
  out.uploadMentahLama = tmpRemoved;

  await expireOverdueOrders();
  return out;
}

/** Tugas harian lengkap: pembersihan + backup terenkripsi. */
export async function runDaily() {
  const cleaned = await runJob("pembersihan", cleanup);
  const backup = backupConfigured() ? await runJob("backup", runBackup) : { ok: false as const, details: { skipped: "BACKUP_PUBLIC_KEY belum diisi" } };
  return { cleaned, backup };
}

export async function lastJobs() {
  const rows = await db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(20);
  const latest = (job: string) => rows.find((r) => r.job === job) ?? null;
  return { rows, pembersihan: latest("pembersihan"), backup: latest("backup") };
}

export async function getKv(key: string) {
  const [r] = await db.select().from(systemKv).where(eq(systemKv.key, key)).limit(1);
  return r ?? null;
}

export async function setKv(key: string, value: Record<string, unknown>) {
  await db
    .insert(systemKv)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: systemKv.key, set: { value, updatedAt: new Date() } });
}
