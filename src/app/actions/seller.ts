"use server";

import { announceProductPublished, announceReleasePublished } from "@/lib/follows";
import { and, count, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSeller, requireUser } from "@/lib/auth/guards";
import { productChecklist } from "@/lib/checklist";
import { CATEGORIES, LICENSES, PLATFORMS, RESERVED_USERNAMES } from "@/lib/config";
import { db } from "@/lib/db";
import { moderationActions, productMedia, products, releaseFiles, releases, sellerProfiles } from "@/lib/db/schema";
import { ANDROID_PACKAGE_RE } from "@/lib/files";
import { sharedLimit } from "@/lib/rate-limit";
import { slugify } from "@/lib/slug";
import { storage } from "@/lib/storage";
import { fieldErrorsFrom, type FormState } from "./form-state";

const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https?:\/\/[^\s]+\.[^\s]+$/i.test(v), "URL harus diawali http:// atau https://")
  .transform((v) => (v === "" ? null : v));

// ─── Aktifkan toko ────────────────────────────────────────────────────────────
const storeSchema = z.object({
  storeName: z.string().trim().min(2, "Nama toko minimal 2 karakter").max(50, "Maksimal 50 karakter"),
  tagline: z.string().trim().max(120, "Maksimal 120 karakter").transform((v) => v || null),
  websiteUrl: optionalUrl,
  agree: z.literal("on", { error: "Kamu perlu menyetujui aturan konten" }),
});

export async function activateStoreAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/seller");
  if (user.seller?.status === "approved") redirect("/seller");
  if (user.seller?.status === "pending") redirect("/seller?diajukan=1");
  const values = {
    storeName: String(formData.get("storeName") ?? ""),
    tagline: String(formData.get("tagline") ?? ""),
    websiteUrl: String(formData.get("websiteUrl") ?? ""),
  };
  if (!user.emailVerifiedAt) {
    return { error: "Verifikasi email dulu sebelum buka toko — linknya ada di halaman Verifikasi email.", values };
  }
  const rl = await sharedLimit(`activate-store:${user.id}`, 5, 60 * 60_000);
  if (!rl.ok) return { error: "Terlalu sering mencoba. Tunggu sebentar lalu coba lagi.", values };
  const parsed = storeSchema.safeParse({ ...values, agree: formData.get("agree") ?? "" });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };
  if (RESERVED_USERNAMES.has(parsed.data.storeName.toLowerCase())) {
    return { fieldErrors: { storeName: "Nama toko ini tidak bisa dipakai" }, values };
  }
  // Pengajuan baru (atau daftar ulang setelah ditolak) selalu mulai dari antrean admin.
  if (user.seller?.status === "rejected") {
    await db
      .update(sellerProfiles)
      .set({ storeName: parsed.data.storeName, tagline: parsed.data.tagline, websiteUrl: parsed.data.websiteUrl, status: "pending", rejectionReason: null, reviewedAt: null, reviewedBy: null })
      .where(eq(sellerProfiles.userId, user.id));
  } else {
    await db
      .insert(sellerProfiles)
      .values({ userId: user.id, storeName: parsed.data.storeName, tagline: parsed.data.tagline, websiteUrl: parsed.data.websiteUrl, status: "pending" })
      .onConflictDoNothing();
  }
  revalidatePath("/", "layout");
  redirect("/seller?diajukan=1");
}

// ─── Produk ───────────────────────────────────────────────────────────────────
const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as [string, ...string[]];
const PLATFORM_SLUGS = PLATFORMS.map((p) => p.slug) as [string, ...string[]];

// Aturan harga dipakai dua skema: form produk utuh & form harga wizard (langkah 2).
// Satu fungsi supaya aturannya tidak pernah beda diam-diam.
function refinePricing(d: { pricingModel: string; priceIdr: number; minPriceIdr: number }, ctx: z.RefinementCtx) {
  if (d.pricingModel === "fixed" && d.priceIdr < 10_000) {
    ctx.addIssue({ code: "custom", path: ["priceIdr"], message: "Harga minimal Rp10.000" });
  }
  if (d.pricingModel === "pwyw") {
    if (d.minPriceIdr > 0 && d.minPriceIdr < 1_000)
      ctx.addIssue({ code: "custom", path: ["minPriceIdr"], message: "Minimal Rp0 (boleh gratis) atau mulai Rp1.000" });
    if (d.priceIdr > 0 && d.priceIdr < d.minPriceIdr)
      ctx.addIssue({ code: "custom", path: ["priceIdr"], message: "Harga saran tidak boleh di bawah minimal" });
  }
}

/** Skema khusus langkah 2 wizard: harga saja, tanpa mengutak-atik info lain. */
const pricingSchema = z
  .object({
    pricingModel: z.enum(["free", "fixed", "pwyw"]),
    priceIdr: z.coerce.number().int().min(0).max(10_000_000, "Maksimal Rp10.000.000"),
    minPriceIdr: z.coerce.number().int().min(0).max(10_000_000, "Maksimal Rp10.000.000"),
  })
  .superRefine(refinePricing);

const productSchema = z
  .object({
    title: z.string().trim().min(3, "Judul minimal 3 karakter").max(80, "Judul maksimal 80 karakter"),
    summary: z.string().trim().min(10, "Ringkasan minimal 10 karakter").max(160, "Ringkasan maksimal 160 karakter"),
    category: z.enum(CATEGORY_SLUGS, { error: "Pilih kategori" }),
    platforms: z.array(z.enum(PLATFORM_SLUGS)).min(1, "Pilih minimal 1 platform").max(6),
    license: z.enum(LICENSES, { error: "Pilih lisensi" }),
    tags: z
      .string()
      .max(300)
      .transform((v) =>
        [...new Set(v.split(",").map((t) => slugify(t, 24)).filter(Boolean))].slice(0, 8),
      ),
    descriptionMd: z.string().max(20000, "Deskripsi maksimal 20.000 karakter"),
    websiteUrl: optionalUrl,
    sourceUrl: optionalUrl,
    pricingModel: z.enum(["free", "fixed", "pwyw"]),
    priceIdr: z.coerce.number().int().min(0).max(10_000_000, "Maksimal Rp10.000.000"),
    minPriceIdr: z.coerce.number().int().min(0).max(10_000_000, "Maksimal Rp10.000.000"),
  })
  .superRefine(refinePricing);

function readProductForm(formData: FormData) {
  const values = {
    title: String(formData.get("title") ?? ""),
    summary: String(formData.get("summary") ?? ""),
    category: String(formData.get("category") ?? ""),
    license: String(formData.get("license") ?? ""),
    tags: String(formData.get("tags") ?? ""),
    descriptionMd: String(formData.get("descriptionMd") ?? ""),
    websiteUrl: String(formData.get("websiteUrl") ?? ""),
    sourceUrl: String(formData.get("sourceUrl") ?? ""),
    pricingModel: String(formData.get("pricingModel") ?? "free"),
    priceIdr: String(formData.get("priceIdr") ?? "0").replace(/[^\d]/g, "") || "0",
    minPriceIdr: String(formData.get("minPriceIdr") ?? "0").replace(/[^\d]/g, "") || "0",
    platforms: formData.getAll("platforms").map(String).join(","),
  };
  const parsed = productSchema.safeParse({ ...values, platforms: formData.getAll("platforms").map(String) });
  return { values, parsed };
}

async function uniqueSlug(title: string) {
  const base = slugify(title) || "produk";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const [exists] = await db.select({ id: products.id }).from(products).where(eq(products.slug, candidate)).limit(1);
    if (!exists) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function createProductAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSeller();
  const rl = await sharedLimit(`create-product:${user.id}`, 20, 24 * 60 * 60 * 1000);
  if (!rl.ok) return { error: "Batas membuat produk hari ini tercapai. Coba lagi besok." };

  const { values, parsed } = readProductForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };
  const d = parsed.data;

  const [product] = await db
    .insert(products)
    .values({
      sellerId: user.id,
      slug: await uniqueSlug(d.title),
      title: d.title,
      summary: d.summary,
      descriptionMd: d.descriptionMd,
      category: d.category,
      platforms: d.platforms,
      tags: d.tags,
      license: d.license,
      websiteUrl: d.websiteUrl,
      sourceUrl: d.sourceUrl,
      pricingModel: d.pricingModel,
      priceIdr: d.pricingModel === "free" ? 0 : d.priceIdr,
      minPriceIdr: d.pricingModel === "pwyw" ? d.minPriceIdr : 0,
    })
    .returning({ id: products.id });

  revalidatePath("/seller", "layout");
  // Dari wizard onboarding (langkah 1): lanjut ke langkah 2, bukan ke editor biasa.
  if (formData.get("onboarding") === "1") redirect(`/seller/mulai?id=${product!.id}&langkah=2`);
  redirect(`/seller/produk/${product!.id}?dibuat=1`);
}

async function loadOwnedProduct(productId: string, sellerId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return null;
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.sellerId, sellerId)))
    .limit(1);
  return product ?? null;
}

function lockedMessage(status: string) {
  if (status === "review") return "Produk sedang direview. Tunggu hasil review sebelum mengubah data.";
  if (status === "suspended") return "Produk ditangguhkan moderator dan tidak bisa diubah.";
  return null;
}

export async function updateProductAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSeller();
  const product = await loadOwnedProduct(String(formData.get("productId")), user.id);
  if (!product) return { error: "Produk tidak ditemukan." };
  const locked = lockedMessage(product.status);
  if (locked) return { error: locked };

  const { values, parsed } = readProductForm(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };
  const d = parsed.data;

  await db
    .update(products)
    .set({
      title: d.title,
      summary: d.summary,
      descriptionMd: d.descriptionMd,
      category: d.category,
      platforms: d.platforms,
      tags: d.tags,
      license: d.license,
      websiteUrl: d.websiteUrl,
      sourceUrl: d.sourceUrl,
      pricingModel: d.pricingModel,
      priceIdr: d.pricingModel === "free" ? 0 : d.priceIdr,
      minPriceIdr: d.pricingModel === "pwyw" ? d.minPriceIdr : 0,
      updatedAt: new Date(),
    })
    .where(eq(products.id, product.id));

  revalidatePath("/", "layout");
  return { success: "Perubahan disimpan." };
}

/** Langkah 2 wizard: simpan harga saja. Batas yang sama dengan editor biasa. */
export async function updatePricingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSeller();
  const product = await loadOwnedProduct(String(formData.get("productId")), user.id);
  if (!product) return { error: "Produk tidak ditemukan." };
  const locked = lockedMessage(product.status);
  if (locked) return { error: locked };

  const values = {
    pricingModel: String(formData.get("pricingModel") ?? "free"),
    priceIdr: String(formData.get("priceIdr") ?? "0").replace(/[^\d]/g, "") || "0",
    minPriceIdr: String(formData.get("minPriceIdr") ?? "0").replace(/[^\d]/g, "") || "0",
  };
  const parsed = pricingSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };
  const d = parsed.data;

  await db
    .update(products)
    .set({
      pricingModel: d.pricingModel,
      priceIdr: d.pricingModel === "free" ? 0 : d.priceIdr,
      minPriceIdr: d.pricingModel === "pwyw" ? d.minPriceIdr : 0,
      updatedAt: new Date(),
    })
    .where(eq(products.id, product.id));

  revalidatePath("/", "layout");
  return { success: "Harga disimpan. Lanjut ke langkah 3 untuk review & kirim." };
}

const androidSchema = z.object({
  androidPackage: z
    .string()
    .trim()
    .max(150)
    .regex(ANDROID_PACKAGE_RE, "Format nama paket tidak valid (contoh: id.namadev.aplikasi)"),
  androidRegistration: z.enum(["registered", "not_registered"], { error: "Pilih status verifikasi" }),
});

export async function updateAndroidAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSeller();
  const product = await loadOwnedProduct(String(formData.get("productId")), user.id);
  if (!product) return { error: "Produk tidak ditemukan." };
  const locked = lockedMessage(product.status);
  if (locked) return { error: locked };

  const values = {
    androidPackage: String(formData.get("androidPackage") ?? ""),
    androidRegistration: String(formData.get("androidRegistration") ?? ""),
  };
  const parsed = androidSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };

  const changed =
    parsed.data.androidPackage !== product.androidPackage ||
    parsed.data.androidRegistration !== product.androidRegistration;
  await db
    .update(products)
    .set({
      androidPackage: parsed.data.androidPackage,
      androidRegistration: parsed.data.androidRegistration,
      androidCheckedAt: changed ? null : product.androidCheckedAt,
      updatedAt: new Date(),
    })
    .where(eq(products.id, product.id));
  revalidatePath("/", "layout");
  return { success: "Info Android disimpan." };
}

export async function deleteScreenshotAction(formData: FormData) {
  const user = await requireSeller();
  const mediaId = String(formData.get("mediaId"));
  const [row] = await db
    .select({ id: productMedia.id, key: productMedia.storageKey, productId: products.id, status: products.status })
    .from(productMedia)
    .innerJoin(products, eq(products.id, productMedia.productId))
    .where(and(eq(productMedia.id, mediaId), eq(products.sellerId, user.id)))
    .limit(1);
  if (!row || lockedMessage(row.status)) return;
  await db.delete(productMedia).where(eq(productMedia.id, row.id));
  await storage().remove(row.key).catch(() => {});
  revalidatePath(`/seller/produk/${row.productId}`);
}

export async function deleteProductAction(formData: FormData) {
  const user = await requireSeller();
  const product = await loadOwnedProduct(String(formData.get("productId")), user.id);
  if (!product) redirect("/seller/produk");
  if (product.publishedAt || !["draft", "rejected"].includes(product.status)) {
    // Produk yang pernah tayang tidak dihapus permanen (pengguna mungkin sudah punya di Library).
    redirect(`/seller/produk/${product.id}?error=hapus`);
  }
  const files = await db
    .select({ key: releaseFiles.storageKey })
    .from(releaseFiles)
    .innerJoin(releases, eq(releases.id, releaseFiles.releaseId))
    .where(eq(releases.productId, product.id));
  const media = await db.select({ key: productMedia.storageKey }).from(productMedia).where(eq(productMedia.productId, product.id));
  await db.delete(products).where(eq(products.id, product.id));
  const store = storage();
  for (const k of [...files.map((f) => f.key), ...media.map((m) => m.key), product.iconKey, product.coverKey]) {
    if (k) await store.remove(k).catch(() => {});
  }
  revalidatePath("/seller", "layout");
  redirect("/seller/produk?dihapus=1");
}

// ─── Rilis ────────────────────────────────────────────────────────────────────
const releaseSchema = z.object({
  version: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z][0-9A-Za-z.+-]{0,23}$/, "Versi tidak valid (contoh: 1.0.0)"),
  changelogMd: z.string().max(5000, "Catatan rilis maksimal 5.000 karakter"),
});

export async function createReleaseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSeller();
  const product = await loadOwnedProduct(String(formData.get("productId")), user.id);
  if (!product) return { error: "Produk tidak ditemukan." };
  const locked = lockedMessage(product.status);
  if (locked) return { error: locked };

  const values = {
    version: String(formData.get("version") ?? "").replace(/^v/i, ""),
    changelogMd: String(formData.get("changelogMd") ?? ""),
  };
  const parsed = releaseSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };

  const existing = await db
    .select({ version: releases.version, status: releases.status })
    .from(releases)
    .where(eq(releases.productId, product.id));
  if (existing.some((r) => r.status === "draft" || r.status === "review")) {
    return { error: "Masih ada rilis draft / sedang direview. Selesaikan dulu sebelum membuat rilis baru." };
  }
  if (existing.some((r) => r.version.toLowerCase() === parsed.data.version.toLowerCase())) {
    return { fieldErrors: { version: "Versi ini sudah pernah dipakai" }, values };
  }

  await db.insert(releases).values({ productId: product.id, version: parsed.data.version, changelogMd: parsed.data.changelogMd });
  revalidatePath(`/seller/produk/${product.id}`);
  return { success: `Rilis v${parsed.data.version} dibuat. Sekarang upload file-nya.` };
}

async function loadOwnedRelease(releaseId: string, sellerId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(releaseId)) return null;
  const [row] = await db
    .select({
      id: releases.id,
      status: releases.status,
      version: releases.version,
      productId: products.id,
      productStatus: products.status,
    })
    .from(releases)
    .innerJoin(products, eq(products.id, releases.productId))
    .where(and(eq(releases.id, releaseId), eq(products.sellerId, sellerId)))
    .limit(1);
  return row ?? null;
}

export async function deleteReleaseAction(formData: FormData) {
  const user = await requireSeller();
  const release = await loadOwnedRelease(String(formData.get("releaseId")), user.id);
  if (!release || !["draft", "rejected"].includes(release.status) || lockedMessage(release.productStatus)) return;
  const files = await db.select({ key: releaseFiles.storageKey }).from(releaseFiles).where(eq(releaseFiles.releaseId, release.id));
  await db.delete(releases).where(eq(releases.id, release.id));
  for (const f of files) await storage().remove(f.key).catch(() => {});
  revalidatePath(`/seller/produk/${release.productId}`);
}

export async function deleteReleaseFileAction(formData: FormData) {
  const user = await requireSeller();
  const fileId = String(formData.get("fileId"));
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return;
  const [row] = await db
    .select({ id: releaseFiles.id, key: releaseFiles.storageKey, releaseStatus: releases.status, productId: products.id })
    .from(releaseFiles)
    .innerJoin(releases, eq(releases.id, releaseFiles.releaseId))
    .innerJoin(products, eq(products.id, releases.productId))
    .where(and(eq(releaseFiles.id, fileId), eq(products.sellerId, user.id)))
    .limit(1);
  if (!row || row.releaseStatus !== "draft") return;
  await db.delete(releaseFiles).where(eq(releaseFiles.id, row.id));
  await storage().remove(row.key).catch(() => {});
  revalidatePath(`/seller/produk/${row.productId}`);
}

// ─── Kirim ke review ─────────────────────────────────────────────────────────
export async function submitProductAction(formData: FormData) {
  const user = await requireSeller();
  const product = await loadOwnedProduct(String(formData.get("productId")), user.id);
  if (!product) redirect("/seller/produk");
  if (!["draft", "rejected"].includes(product.status)) redirect(`/seller/produk/${product.id}`);

  const [{ n: mediaCount }] = await db.select({ n: count() }).from(productMedia).where(eq(productMedia.productId, product.id));
  const pendingReleases = await db
    .select({ id: releases.id, files: count(releaseFiles.id) })
    .from(releases)
    .leftJoin(releaseFiles, eq(releaseFiles.releaseId, releases.id))
    .where(and(eq(releases.productId, product.id), inArray(releases.status, ["draft", "rejected"])))
    .groupBy(releases.id);
  const withFiles = pendingReleases.filter((r) => r.files > 0);

  const { complete } = productChecklist({ ...product, mediaCount, hasReleaseWithFiles: withFiles.length > 0 });
  if (!complete) redirect(`/seller/produk/${product.id}?error=checklist`);

  const trusted = user.seller.isTrusted;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(products)
      .set({
        status: trusted ? "published" : "review",
        submittedAt: now,
        publishedAt: trusted ? now : null,
        rejectionReason: null,
        updatedAt: now,
      })
      .where(eq(products.id, product.id));
    await tx
      .update(releases)
      .set({ status: trusted ? "published" : "review", submittedAt: now, publishedAt: trusted ? now : null, rejectionReason: null })
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

  if (trusted && !product.publishedAt) await announceProductPublished(product.id);
  revalidatePath("/", "layout");
  redirect(`/seller/produk/${product.id}?dikirim=${trusted ? "tayang" : "review"}`);
}

export async function submitReleaseAction(formData: FormData) {
  const user = await requireSeller();
  const release = await loadOwnedRelease(String(formData.get("releaseId")), user.id);
  if (!release) redirect("/seller/produk");
  if (release.productStatus !== "published" || release.status !== "draft") redirect(`/seller/produk/${release.productId}`);

  const [{ n }] = await db.select({ n: count() }).from(releaseFiles).where(eq(releaseFiles.releaseId, release.id));
  if (n === 0) redirect(`/seller/produk/${release.productId}?error=nofile`);

  const trusted = user.seller.isTrusted;
  const now = new Date();
  await db
    .update(releases)
    .set({ status: trusted ? "published" : "review", submittedAt: now, publishedAt: trusted ? now : null })
    .where(eq(releases.id, release.id));
  await db.update(products).set({ updatedAt: now }).where(eq(products.id, release.productId));
  if (trusted) {
    await db.insert(moderationActions).values({
      targetType: "release",
      targetId: release.id,
      action: "auto_publish_trusted",
      note: `v${release.version}`,
    });
    await announceReleasePublished(release.id);
  }
  revalidatePath("/", "layout");
  redirect(`/seller/produk/${release.productId}?rilis=${trusted ? "tayang" : "review"}`);
}

export async function updateStoreAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSeller();
  const values = {
    storeName: String(formData.get("storeName") ?? ""),
    tagline: String(formData.get("tagline") ?? ""),
    websiteUrl: String(formData.get("websiteUrl") ?? ""),
  };
  const parsed = storeSchema.omit({ agree: true }).safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };
  await db
    .update(sellerProfiles)
    .set({ storeName: parsed.data.storeName, tagline: parsed.data.tagline, websiteUrl: parsed.data.websiteUrl })
    .where(eq(sellerProfiles.userId, user.id));
  revalidatePath("/", "layout");
  return { success: "Profil toko disimpan." };
}
