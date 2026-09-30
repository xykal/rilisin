import { and, count, eq, inArray } from "drizzle-orm";
import { productChecklist } from "@/lib/checklist";
import { db } from "@/lib/db";
import { moderationActions, productMedia, products, releaseFiles, releases } from "@/lib/db/schema";
import { announceProductPublished, announceReleasePublished } from "@/lib/follows";
import { parseScheduledAt } from "@/lib/releases";

/**
 * Logika kirim-ke-review terpusat — dipakai form dashboard (submitProductAction/submitReleaseAction)
 * DAN API v1. Satu-satunya tempat aturan checklist, jadwal, & auto-publish trusted seller hidup.
 */
export type SubmitOutcome = "review" | "published" | "scheduled";
export type SubmitErrorCode = "not-found" | "state" | "checklist" | "schedule" | "nofile";
export type SubmitResult =
  | { ok: true; outcome: SubmitOutcome; productId: string }
  | { ok: false; code: SubmitErrorCode; message: string; productId: string | null; checklist?: { key: string; label: string; done: boolean }[] };

async function loadProduct(productId: string, sellerId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return null;
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.sellerId, sellerId)))
    .limit(1);
  return product ?? null;
}

async function loadRelease(releaseId: string, sellerId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(releaseId)) return null;
  const [row] = await db
    .select({ id: releases.id, status: releases.status, version: releases.version, productId: products.id, productStatus: products.status })
    .from(releases)
    .innerJoin(products, eq(products.id, releases.productId))
    .where(and(eq(releases.id, releaseId), eq(products.sellerId, sellerId)))
    .limit(1);
  return row ?? null;
}

/** Kirim produk (+ semua rilis draft ber-file) ke review / tayang (trusted). scheduledAtRaw: "" = sekarang. */
export async function submitProductFlow(productId: string, seller: { id: string; isTrusted: boolean }, scheduledAtRaw: string): Promise<SubmitResult> {
  const product = await loadProduct(productId, seller.id);
  if (!product) return { ok: false, code: "not-found", message: "Produk tidak ditemukan.", productId };
  if (!["draft", "rejected"].includes(product.status)) return { ok: false, code: "state", message: "Hanya produk draft / ditolak yang bisa dikirim.", productId: product.id };

  const [{ n: mediaCount }] = await db.select({ n: count() }).from(productMedia).where(eq(productMedia.productId, product.id));
  const pendingReleases = await db
    .select({ id: releases.id, files: count(releaseFiles.id) })
    .from(releases)
    .leftJoin(releaseFiles, eq(releaseFiles.releaseId, releases.id))
    .where(and(eq(releases.productId, product.id), inArray(releases.status, ["draft", "rejected"])))
    .groupBy(releases.id);
  const withFiles = pendingReleases.filter((r) => r.files > 0);

  const { complete, items } = productChecklist({ ...product, mediaCount, hasReleaseWithFiles: withFiles.length > 0 });
  if (!complete) return { ok: false, code: "checklist", message: "Checklist produk belum lengkap.", productId: product.id, checklist: items };

  let scheduledAt: Date | null;
  try {
    scheduledAt = parseScheduledAt(scheduledAtRaw);
  } catch {
    return { ok: false, code: "schedule", message: "Jadwal tidak valid.", productId: product.id };
  }
  const trusted = seller.isTrusted;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(products)
      .set({
        status: trusted ? "published" : "review",
        submittedAt: now,
        publishedAt: trusted ? (product.publishedAt ?? (scheduledAt ? null : now)) : null,
        rejectionReason: null,
        updatedAt: now,
      })
      .where(eq(products.id, product.id));
    await tx
      .update(releases)
      .set({ status: trusted ? "published" : "review", submittedAt: now, publishedAt: trusted && !scheduledAt ? now : null, rejectionReason: null, scheduledAt })
      .where(inArray(releases.id, withFiles.map((r) => r.id)));
    if (trusted) {
      await tx.insert(moderationActions).values({
        moderatorId: null,
        targetType: "product",
        targetId: product.id,
        action: "auto_publish_trusted",
        note: "Seller terpercaya — tayang otomatis (tetap bisa diaudit)",
      });
    }
  });

  if (trusted && !product.publishedAt && !scheduledAt) await announceProductPublished(product.id);
  return { ok: true, outcome: trusted ? (scheduledAt ? "scheduled" : "published") : "review", productId: product.id };
}

/** Kirim rilis draft (produk sudah tayang) ke review / tayang (trusted). */
export async function submitReleaseFlow(releaseId: string, seller: { id: string; isTrusted: boolean }, scheduledAtRaw: string): Promise<SubmitResult> {
  const release = await loadRelease(releaseId, seller.id);
  if (!release) return { ok: false, code: "not-found", message: "Rilis tidak ditemukan.", productId: null };
  if (release.productStatus !== "published" || release.status !== "draft")
    return { ok: false, code: "state", message: "Hanya rilis draft dari produk tayang yang bisa dikirim.", productId: release.productId };

  const [{ n }] = await db.select({ n: count() }).from(releaseFiles).where(eq(releaseFiles.releaseId, release.id));
  if (n === 0) return { ok: false, code: "nofile", message: "Rilis belum punya file.", productId: release.productId };

  let scheduledAt: Date | null;
  try {
    scheduledAt = parseScheduledAt(scheduledAtRaw);
  } catch {
    return { ok: false, code: "schedule", message: "Jadwal tidak valid.", productId: release.productId };
  }
  const trusted = seller.isTrusted;
  const now = new Date();
  await db
    .update(releases)
    .set({ status: trusted ? "published" : "review", submittedAt: now, publishedAt: trusted && !scheduledAt ? now : null, scheduledAt })
    .where(eq(releases.id, release.id));
  await db.update(products).set({ updatedAt: now }).where(eq(products.id, release.productId));
  if (trusted) {
    await db.insert(moderationActions).values({
      targetType: "release",
      targetId: release.id,
      action: "auto_publish_trusted",
      note: scheduledAt ? `v${release.version} terjadwal ${scheduledAt.toISOString()}` : `v${release.version}`,
    });
    if (!scheduledAt) await announceReleasePublished(release.id);
  }
  return { ok: true, outcome: trusted ? (scheduledAt ? "scheduled" : "published") : "review", productId: release.productId };
}
