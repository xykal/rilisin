import "server-only";
import { randomUUID } from "node:crypto";
import { and, count, eq, max, sql } from "drizzle-orm";
import sharp from "sharp";
import type { CurrentUser } from "@/lib/auth/current-user";
import { LIMITS } from "@/lib/config";
import { db } from "@/lib/db";
import { blockedHashes, productMedia, products, releaseFiles, releases } from "@/lib/db/schema";
import { RELEASE_FILE_TYPES, detectImageType, extensionOf, sanitizeFilename } from "@/lib/files";
import { storage } from "@/lib/storage";
import { signToken, verifyToken } from "@/lib/tokens";

export type UploadPurpose = "icon" | "cover" | "screenshot" | "release_file";

type UploadToken = {
  u: string; // user id
  p: UploadPurpose;
  t: string; // target id (product id / release id)
  k: string; // storage key sementara
  f: string; // nama file asli
  s: number; // ukuran yang dideklarasikan
  pl?: string; // platform (khusus release_file)
};

export class UploadError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp"]);

/** Pastikan user boleh mengubah produk ini (pemilik & status masih bisa diedit). */
async function assertEditableProduct(userId: string, productId: string) {
  const [product] = await db
    .select({ id: products.id, status: products.status, sellerId: products.sellerId })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product || product.sellerId !== userId) throw new UploadError("Produk tidak ditemukan", 404);
  if (product.status === "review") throw new UploadError("Produk sedang direview — tunggu hasilnya dulu ya.", 409);
  if (product.status === "suspended") throw new UploadError("Produk ditangguhkan moderator.", 403);
  return product;
}

/** Pastikan rilis masih draft & milik user. */
async function assertEditableRelease(userId: string, releaseId: string) {
  const [row] = await db
    .select({
      id: releases.id,
      status: releases.status,
      productId: products.id,
      sellerId: products.sellerId,
      productStatus: products.status,
      platforms: products.platforms,
    })
    .from(releases)
    .innerJoin(products, eq(products.id, releases.productId))
    .where(eq(releases.id, releaseId))
    .limit(1);
  if (!row || row.sellerId !== userId) throw new UploadError("Rilis tidak ditemukan", 404);
  if (row.status !== "draft") throw new UploadError("File hanya bisa ditambahkan ke rilis berstatus draft.", 409);
  if (row.productStatus === "suspended") throw new UploadError("Produk ditangguhkan moderator.", 403);
  return row;
}

export async function initUpload(
  user: CurrentUser,
  input: { purpose: string; targetId: string; filename: string; size: number; platform?: string },
) {
  if (!user.seller) throw new UploadError("Aktifkan toko dulu untuk upload.", 403);
  const { purpose, targetId, filename, size } = input;
  if (!["icon", "cover", "screenshot", "release_file"].includes(purpose)) throw new UploadError("Jenis upload tidak dikenal");
  if (!/^[0-9a-f-]{36}$/i.test(targetId)) throw new UploadError("Target tidak valid");
  if (!filename || filename.length > 200) throw new UploadError("Nama file tidak valid");
  if (!Number.isSafeInteger(size) || size <= 0) throw new UploadError("Ukuran file tidak valid");

  const ext = extensionOf(filename);
  let platform: string | undefined;

  if (purpose === "release_file") {
    if (!ext || !RELEASE_FILE_TYPES[ext]) {
      throw new UploadError(`Tipe file .${ext ?? "?"} belum didukung. Gunakan: ${Object.keys(RELEASE_FILE_TYPES).join(", ")}`);
    }
    if (size > LIMITS.releaseFileMaxBytes) {
      throw new UploadError(`Ukuran maksimal file ${Math.round(LIMITS.releaseFileMaxBytes / 1024 / 1024)} MB (batas prototype).`, 413);
    }
    const release = await assertEditableRelease(user.id, targetId);
    platform = input.platform;
    if (!platform || !release.platforms.includes(platform)) throw new UploadError("Pilih platform file (sesuai platform produk).");
    if (ext === "apk" && platform !== "android") throw new UploadError("File APK harus untuk platform Android.");
    const [{ n }] = await db.select({ n: count() }).from(releaseFiles).where(eq(releaseFiles.releaseId, targetId));
    if (n >= LIMITS.filesPerRelease) throw new UploadError(`Maksimal ${LIMITS.filesPerRelease} file per rilis.`);
  } else {
    if (!ext || !IMAGE_EXT.has(ext)) throw new UploadError("Gambar harus PNG, JPG, atau WEBP.");
    if (size > LIMITS.imageMaxBytes) throw new UploadError("Ukuran gambar maksimal 5 MB.", 413);
    await assertEditableProduct(user.id, targetId);
    if (purpose === "screenshot") {
      const [{ n }] = await db.select({ n: count() }).from(productMedia).where(eq(productMedia.productId, targetId));
      if (n >= LIMITS.screenshotsMax) throw new UploadError(`Maksimal ${LIMITS.screenshotsMax} screenshot.`);
    }
  }

  const key = `tmp/${user.id}/${randomUUID()}`;
  const payload: UploadToken = { u: user.id, p: purpose as UploadPurpose, t: targetId, k: key, f: filename, s: size, pl: platform };
  const token = signToken("up", payload, 60 * 60);
  return { token, uploadUrl: await storage().uploadUrl(key, token, size), maxBytes: size };
}

export function readUploadToken(token: string | null | undefined) {
  return verifyToken<UploadToken>("up", token);
}

async function processImage(buf: Buffer, purpose: "icon" | "cover" | "screenshot") {
  const base = sharp(buf, { failOn: "error", limitInputPixels: 50_000_000 }).rotate();
  const pipeline =
    purpose === "icon"
      ? base.resize(512, 512, { fit: "cover" })
      : purpose === "cover"
        ? base.resize(1280, 720, { fit: "cover" })
        : base.resize(1600, 1600, { fit: "inside", withoutEnlargement: true });
  return pipeline.webp({ quality: 84 }).toBuffer({ resolveWithObject: true });
}

export async function completeUpload(user: CurrentUser, token: string) {
  const t = readUploadToken(token);
  if (!t || t.u !== user.id) throw new UploadError("Token upload tidak valid / kedaluwarsa. Ulangi upload.", 403);
  const store = storage();
  const info = await store.stat(t.k);
  if (!info) throw new UploadError("File belum terupload. Ulangi upload.", 409);

  try {
    if (info.size !== t.s) throw new UploadError("Ukuran file tidak sesuai. Ulangi upload.");

    // ─── Gambar: validasi isi → konversi ke WEBP (sekalian membuang metadata EXIF/GPS) ───
    if (t.p !== "release_file") {
      await assertEditableProduct(user.id, t.t);
      const buf = await store.read(t.k);
      if (!detectImageType(buf.subarray(0, 16))) throw new UploadError("File bukan gambar PNG/JPG/WEBP yang valid.");
      let processed;
      try {
        processed = await processImage(buf, t.p);
      } catch {
        throw new UploadError("Gambar rusak atau tidak bisa diproses.");
      }
      const finalKey = `public/products/${t.t}/${t.p}-${randomUUID().slice(0, 8)}.webp`;
      await store.write(finalKey, processed.data);

      if (t.p === "screenshot") {
        const [{ n }] = await db.select({ n: count() }).from(productMedia).where(eq(productMedia.productId, t.t));
        if (n >= LIMITS.screenshotsMax) {
          await store.remove(finalKey);
          throw new UploadError(`Maksimal ${LIMITS.screenshotsMax} screenshot.`);
        }
        const [{ m }] = await db.select({ m: max(productMedia.sort) }).from(productMedia).where(eq(productMedia.productId, t.t));
        await db.insert(productMedia).values({
          productId: t.t,
          storageKey: finalKey,
          width: processed.info.width,
          height: processed.info.height,
          sort: (m ?? -1) + 1,
        });
      } else {
        const [old] = await db
          .select({ iconKey: products.iconKey, coverKey: products.coverKey })
          .from(products)
          .where(eq(products.id, t.t));
        const patch = t.p === "icon" ? { iconKey: finalKey } : { coverKey: finalKey };
        await db.update(products).set(patch).where(eq(products.id, t.t));
        const oldKey = t.p === "icon" ? old?.iconKey : old?.coverKey;
        if (oldKey) await store.remove(oldKey).catch(() => {});
      }
      await db.update(products).set({ updatedAt: new Date() }).where(eq(products.id, t.t));
      return { kind: t.p, url: store.publicUrl(finalKey) };
    }

    // ─── File rilis: cek magic bytes, hash, blocklist ───
    await assertEditableRelease(user.id, t.t);
    const ext = extensionOf(t.f)!;
    const type = RELEASE_FILE_TYPES[ext];
    if (!type) throw new UploadError("Tipe file tidak didukung.");
    const head = await store.readRange(t.k, 0, 4096);
    const tailLen = Math.min(info.size, 8 * 1024 * 1024);
    const tail = await store.readRange(t.k, info.size - tailLen, tailLen);
    if (!type.check(head, tail)) {
      throw new UploadError(`Isi file tidak cocok dengan ekstensi .${ext} (${type.label}). File mungkin rusak atau salah nama.`);
    }
    if (ext === "apk" && !tail.includes("AndroidManifest.xml") && !head.includes("AndroidManifest.xml")) {
      throw new UploadError("File .apk tidak berisi AndroidManifest.xml — sepertinya bukan APK yang valid.");
    }

    const sha256 = await store.sha256(t.k);
    const [blocked] = await db.select().from(blockedHashes).where(eq(blockedHashes.sha256, sha256)).limit(1);
    if (blocked) throw new UploadError("File ini diblokir oleh moderator dan tidak bisa diupload.", 403);

    const [dupInRelease] = await db
      .select({ id: releaseFiles.id })
      .from(releaseFiles)
      .where(and(eq(releaseFiles.releaseId, t.t), eq(releaseFiles.sha256, sha256)))
      .limit(1);
    if (dupInRelease) throw new UploadError("File yang sama sudah ada di rilis ini.", 409);

    const filename = sanitizeFilename(t.f);
    // …/<acak>/<nama-asli> → di Vercel Blob, file yang di-download otomatis bernama sesuai aslinya
    const finalKey = `private/releases/${t.t}/${randomUUID().slice(0, 8)}/${filename}`;
    await store.move(t.k, finalKey);
    const [file] = await db
      .insert(releaseFiles)
      .values({
        releaseId: t.t,
        platform: t.pl ?? "universal",
        filename,
        storageKey: finalKey,
        sizeBytes: info.size,
        sha256,
        detectedType: type.label,
      })
      .returning({ id: releaseFiles.id });
    await db
      .update(products)
      .set({ updatedAt: new Date() })
      .where(eq(products.id, sql`(select product_id from ${releases} where id = ${t.t})`));
    return { kind: "release_file" as const, id: file!.id, sha256 };
  } finally {
    // file sementara selalu dibersihkan (kalau sudah dipindah, ini tidak melakukan apa-apa)
    await store.remove(t.k).catch(() => {});
  }
}
