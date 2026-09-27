"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { blockedHashes, moderationActions, products, releaseFiles, releases, sellerProfiles } from "@/lib/db/schema";
import { storage } from "@/lib/storage";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function str(formData: FormData, key: string, max = 1000) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

async function log(moderatorId: string, targetType: string, targetId: string, action: string, note?: string | null) {
  await db.insert(moderationActions).values({ moderatorId, targetType, targetId, action, note: note || null });
}

/** Blokir hash file (tidak bisa diupload lagi oleh siapa pun) & hapus filenya dari storage. */
async function blockAndRemoveFiles(moderatorId: string, releaseIds: string[], reason: string) {
  if (!releaseIds.length) return 0;
  const files = await db.select().from(releaseFiles).where(inArray(releaseFiles.releaseId, releaseIds));
  for (const f of files) {
    await db
      .insert(blockedHashes)
      .values({ sha256: f.sha256, reason: reason.slice(0, 300), createdBy: moderatorId })
      .onConflictDoNothing();
    await storage().remove(f.storageKey).catch(() => {});
  }
  if (files.length) await db.delete(releaseFiles).where(inArray(releaseFiles.releaseId, releaseIds));
  return files.length;
}

export async function approveProductAction(formData: FormData) {
  const staff = await requireStaff();
  const productId = str(formData, "productId");
  if (!UUID_RE.test(productId)) return;
  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product || product.status !== "review") redirect("/admin/review");

  const now = new Date();
  const checkAndroid = formData.get("androidChecked") === "on";
  await db.transaction(async (tx) => {
    await tx
      .update(products)
      .set({
        status: "published",
        publishedAt: product.publishedAt ?? now,
        rejectionReason: null,
        updatedAt: now,
        ...(checkAndroid ? { androidCheckedAt: now } : {}),
      })
      .where(eq(products.id, productId));
    await tx
      .update(releases)
      .set({ status: "published", publishedAt: now })
      .where(and(eq(releases.productId, productId), eq(releases.status, "review")));
    await tx
      .update(releaseFiles)
      .set({ scanStatus: "clean" })
      .where(sql`${releaseFiles.releaseId} in (select id from ${releases} where product_id = ${productId})`);
  });
  await log(staff.id, "product", productId, "approve", str(formData, "note") || (checkAndroid ? "Bukti verifikasi Android dicek" : null));
  revalidatePath("/", "layout");
  redirect("/admin/review?hasil=disetujui");
}

export async function rejectProductAction(formData: FormData) {
  const staff = await requireStaff();
  const productId = str(formData, "productId");
  const reason = str(formData, "reason", 2000);
  if (!UUID_RE.test(productId)) return;
  if (reason.length < 10) redirect(`/admin/review/${productId}?error=alasan`);
  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product || product.status !== "review") redirect("/admin/review");

  const reviewReleases = await db
    .select({ id: releases.id })
    .from(releases)
    .where(and(eq(releases.productId, productId), eq(releases.status, "review")));
  const releaseIds = reviewReleases.map((r) => r.id);
  const block = formData.get("blockFiles") === "on";
  const blocked = block ? await blockAndRemoveFiles(staff.id, releaseIds, reason) : 0;

  await db
    .update(products)
    .set({ status: "rejected", rejectionReason: reason, updatedAt: new Date() })
    .where(eq(products.id, productId));
  if (releaseIds.length) {
    await db.update(releases).set({ status: "draft" }).where(inArray(releases.id, releaseIds));
  }
  await log(staff.id, "product", productId, block ? "reject_and_block" : "reject", `${reason}${blocked ? ` (${blocked} file diblokir)` : ""}`);
  revalidatePath("/", "layout");
  redirect("/admin/review?hasil=ditolak");
}

export async function approveReleaseAction(formData: FormData) {
  const staff = await requireStaff();
  const releaseId = str(formData, "releaseId");
  if (!UUID_RE.test(releaseId)) return;
  const [release] = await db.select().from(releases).where(eq(releases.id, releaseId)).limit(1);
  if (!release || release.status !== "review") redirect("/admin/review");
  const now = new Date();
  await db.update(releases).set({ status: "published", publishedAt: now, rejectionReason: null }).where(eq(releases.id, releaseId));
  await db.update(releaseFiles).set({ scanStatus: "clean" }).where(eq(releaseFiles.releaseId, releaseId));
  await db.update(products).set({ updatedAt: now }).where(eq(products.id, release.productId));
  await log(staff.id, "release", releaseId, "approve", `v${release.version}`);
  revalidatePath("/", "layout");
  redirect("/admin/review?hasil=rilis-disetujui");
}

export async function rejectReleaseAction(formData: FormData) {
  const staff = await requireStaff();
  const releaseId = str(formData, "releaseId");
  const reason = str(formData, "reason", 2000);
  if (!UUID_RE.test(releaseId)) return;
  const [release] = await db.select().from(releases).where(eq(releases.id, releaseId)).limit(1);
  if (!release || release.status !== "review") redirect("/admin/review");
  if (reason.length < 10) redirect(`/admin/review/${release.productId}?error=alasan`);
  const block = formData.get("blockFiles") === "on";
  const blocked = block ? await blockAndRemoveFiles(staff.id, [releaseId], reason) : 0;
  await db.update(releases).set({ status: "rejected", rejectionReason: reason }).where(eq(releases.id, releaseId));
  await log(staff.id, "release", releaseId, block ? "reject_and_block" : "reject", `v${release.version}: ${reason}${blocked ? ` (${blocked} file diblokir)` : ""}`);
  revalidatePath("/", "layout");
  redirect("/admin/review?hasil=rilis-ditolak");
}

export async function toggleFeaturedAction(formData: FormData) {
  const staff = await requireStaff();
  const productId = str(formData, "productId");
  if (!UUID_RE.test(productId)) return;
  const featured = formData.get("featured") === "1";
  await db.update(products).set({ isFeatured: featured }).where(eq(products.id, productId));
  await log(staff.id, "product", productId, featured ? "feature" : "unfeature");
  revalidatePath("/", "layout");
}

export async function markAndroidCheckedAction(formData: FormData) {
  const staff = await requireStaff();
  const productId = str(formData, "productId");
  if (!UUID_RE.test(productId)) return;
  await db.update(products).set({ androidCheckedAt: new Date() }).where(eq(products.id, productId));
  await log(staff.id, "product", productId, "android_checked");
  revalidatePath("/", "layout");
}

export async function suspendProductAction(formData: FormData) {
  const staff = await requireStaff();
  const productId = str(formData, "productId");
  const reason = str(formData, "reason", 2000) || "Melanggar aturan konten";
  if (!UUID_RE.test(productId)) return;
  await db.update(products).set({ status: "suspended", rejectionReason: reason, isFeatured: false }).where(eq(products.id, productId));
  await log(staff.id, "product", productId, "suspend", reason);
  revalidatePath("/", "layout");
}

export async function restoreProductAction(formData: FormData) {
  const staff = await requireStaff();
  const productId = str(formData, "productId");
  if (!UUID_RE.test(productId)) return;
  const [product] = await db.select({ status: products.status }).from(products).where(eq(products.id, productId)).limit(1);
  if (product?.status !== "suspended") return;
  await db.update(products).set({ status: "published", rejectionReason: null }).where(eq(products.id, productId));
  await log(staff.id, "product", productId, "restore");
  revalidatePath("/", "layout");
}

export async function setTrustedAction(formData: FormData) {
  const staff = await requireStaff();
  const userId = str(formData, "userId");
  if (!UUID_RE.test(userId)) return;
  const trusted = formData.get("trusted") === "1";
  await db.update(sellerProfiles).set({ isTrusted: trusted }).where(eq(sellerProfiles.userId, userId));
  await log(staff.id, "user", userId, trusted ? "trust_seller" : "untrust_seller");
  revalidatePath("/", "layout");
}
