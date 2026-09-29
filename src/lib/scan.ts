import "server-only";
import { timingSafeEqual } from "node:crypto";
import { and, eq, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { blockedHashes, moderationActions, products, releaseFiles, releases } from "@/lib/db/schema";
import { appUrl } from "@/lib/email";
import { getKv, setKv } from "@/lib/maintenance";
import { notifyAndEmail } from "@/lib/notifications/server";
import { logSecurityEvent } from "@/lib/security/events";
import { storage, storageDriverName } from "@/lib/storage";

/**
 * Antrean scan antivirus. Worker (ClamAV, lihat folder scanner/) jalan di server mana pun yang bisa HTTPS keluar —
 * tidak perlu port masuk. Alur: worker klaim file → unduh lewat URL bertanda tangan → pindai → laporkan hasil.
 */
const LEASE_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const RESCAN_DAYS = 30;

export function scanWorkerToken() {
  const t = process.env.SCAN_WORKER_TOKEN?.trim();
  return t && t.length >= 32 ? t : null;
}

export function isWorkerRequest(req: Request) {
  const expected = scanWorkerToken();
  if (!expected) return false;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Wajib hasil scan bersih sebelum file bisa diunduh publik (aktifkan setelah worker jalan: REQUIRE_CLEAN_SCAN=1). */
export const requireCleanScan = () => process.env.REQUIRE_CLEAN_SCAN === "1";

export type ClaimedFile = { fileId: string; sha256: string; size: number; filename: string; url: string; rescan: boolean };

export async function claimFiles(opts: { limit: number; worker: string; engine: string }): Promise<ClaimedFile[]> {
  const limit = Math.min(Math.max(opts.limit, 1), 10);
  const rows = await db.transaction(async (tx) => {
    const pick = async (where: ReturnType<typeof sql>, n: number) =>
      tx.execute<{ id: string; sha256: string; size_bytes: number; filename: string; storage_key: string; scan_status: string }>(sql`
        select id, sha256, size_bytes, filename, storage_key, scan_status from release_files
        where ${where}
          and (scan_claimed_at is null or scan_claimed_at < now() - make_interval(mins => ${LEASE_MINUTES}))
        order by created_at
        limit ${n}
        for update skip locked`);
    let picked = await pick(sql`scan_status in ('pending', 'error') and scan_attempts < ${MAX_ATTEMPTS}`, limit);
    if (!picked.length) {
      // Tidak ada antrean → pindai ulang file lama dengan signature terbaru (malware baru bisa terdeteksi belakangan)
      picked = await pick(sql`scan_status = 'clean' and scanned_at < now() - make_interval(days => ${RESCAN_DAYS})`, Math.min(2, limit));
    }
    for (const r of picked) {
      await tx.update(releaseFiles).set({ scanClaimedAt: new Date(), scanAttempts: sql`${releaseFiles.scanAttempts} + 1` }).where(eq(releaseFiles.id, r.id));
    }
    return picked;
  });
  await setKv("scan_worker", { worker: opts.worker.slice(0, 80), engine: opts.engine.slice(0, 120), lastSeen: new Date().toISOString() });
  const out: ClaimedFile[] = [];
  for (const r of rows) {
    // Blob: link unduh langsung (bertanda tangan, 15 menit). Local: lewat endpoint internal (butuh token worker).
    const url =
      storageDriverName() === "local"
        ? `${appUrl()}/api/internal/scan/file/${r.id}`
        : await storage().downloadUrl(r.storage_key, { filename: r.filename, userId: "scan-worker", ttlSec: LEASE_MINUTES * 60 });
    out.push({ fileId: r.id, sha256: r.sha256, size: Number(r.size_bytes), filename: r.filename, url, rescan: r.scan_status === "clean" });
  }
  return out;
}

export async function getFileForWorker(fileId: string) {
  const [f] = await db.select({ key: releaseFiles.storageKey, filename: releaseFiles.filename }).from(releaseFiles).where(eq(releaseFiles.id, fileId)).limit(1);
  return f ?? null;
}

/** Catat hasil dari worker. File terinfeksi: hash diblokir, file dihapus, rilis ditolak, produk ditangguhkan kalau tidak ada versi lain. */
export async function recordScanResult(input: { fileId: string; status: "clean" | "infected" | "error"; engine: string; signature?: string | null }) {
  const [f] = await db
    .select({ file: releaseFiles, release: releases, product: { id: products.id, title: products.title, slug: products.slug, sellerId: products.sellerId, status: products.status } })
    .from(releaseFiles)
    .innerJoin(releases, eq(releases.id, releaseFiles.releaseId))
    .innerJoin(products, eq(products.id, releases.productId))
    .where(eq(releaseFiles.id, input.fileId))
    .limit(1);
  if (!f) return { found: false as const };
  const engine = input.engine.slice(0, 120);
  const signature = input.signature?.slice(0, 200) ?? null;

  if (input.status !== "infected") {
    await db
      .update(releaseFiles)
      .set({ scanStatus: input.status, scannedAt: new Date(), scanEngine: engine, scanSignature: input.status === "error" ? signature : null, scanClaimedAt: null })
      .where(eq(releaseFiles.id, input.fileId));
    return { found: true as const, action: input.status };
  }

  const reason = `File ${f.file.filename} terdeteksi malware oleh antivirus (${signature ?? "tanpa nama"}).`;
  await db
    .update(releaseFiles)
    .set({ scanStatus: "infected", scannedAt: new Date(), scanEngine: engine, scanSignature: signature, scanClaimedAt: null })
    .where(eq(releaseFiles.id, input.fileId));
  await db.insert(blockedHashes).values({ sha256: f.file.sha256, reason: `Malware: ${signature ?? "terdeteksi antivirus"}`.slice(0, 300) }).onConflictDoNothing();
  await storage().remove(f.file.storageKey).catch(() => {});
  if (f.release.status !== "rejected") {
    await db.update(releases).set({ status: "rejected", rejectionReason: reason }).where(eq(releases.id, f.release.id));
  }
  // Masih ada versi lain yang tayang dengan file bersih? Kalau tidak, produk ditangguhkan supaya tidak ada yang mengunduh.
  const [other] = await db
    .select({ id: releases.id })
    .from(releases)
    .where(and(eq(releases.productId, f.product.id), eq(releases.status, "published"), or(isNull(releases.scheduledAt), lte(releases.scheduledAt, new Date())), ne(releases.id, f.release.id)))
    .limit(1);
  let suspended = false;
  if (!other && f.product.status === "published") {
    await db.update(products).set({ status: "suspended", rejectionReason: reason, isFeatured: false }).where(eq(products.id, f.product.id));
    suspended = true;
  }
  await db.insert(moderationActions).values({ moderatorId: null, targetType: "release", targetId: f.release.id, action: "malware_detected", note: reason });
  await logSecurityEvent("malware_detected", { userId: f.product.sellerId, meta: { fileId: input.fileId, sha256: f.file.sha256, signature, suspended } });
  await notifyAndEmail({
    userId: f.product.sellerId,
    type: "product_rejected",
    url: `/seller/produk/${f.product.id}`,
    data: { productTitle: f.product.title, reason: `${reason} File dihapus & hash-nya diblokir.${suspended ? " Produk ditangguhkan sampai ada versi bersih." : ""}` },
  });
  return { found: true as const, action: "infected" as const, suspended };
}

export async function scanStats() {
  const [row] = await db.execute<{ pending: number; clean: number; infected: number; error: number; oldest: Date | null }>(sql`
    select count(*) filter (where scan_status = 'pending')::int as pending,
           count(*) filter (where scan_status = 'clean')::int as clean,
           count(*) filter (where scan_status = 'infected')::int as infected,
           count(*) filter (where scan_status = 'error')::int as error,
           min(created_at) filter (where scan_status = 'pending') as oldest
    from release_files`);
  return row ?? { pending: 0, clean: 0, infected: 0, error: 0, oldest: null };
}

/**
 * Status worker untuk halaman Sistem. Dianggap hidup kalau terakhir mengklaim antrean dalam
 * SCAN_WORKER_TTL_MIN menit terakhir (default 15 — cocok untuk worker yang selalu nyala).
 * Worker terjadwal (mis. cron GitHub Actions per jam) butuh jendela lebih lebar dari jeda antar-run:
 * set SCAN_WORKER_TTL_MIN sedikit di atas interval (contoh: 90 untuk cron per jam).
 */
export async function workerStatus() {
  const kv = await getKv("scan_worker");
  const seen = kv?.updatedAt ?? null;
  const ttlMin = Math.max(LEASE_MINUTES, Number(process.env.SCAN_WORKER_TTL_MIN ?? "") || LEASE_MINUTES);
  return { seen, alive: seen ? Date.now() - seen.getTime() < ttlMin * 60_000 : false, engine: String(kv?.value.engine ?? "") };
}
