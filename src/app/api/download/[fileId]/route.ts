import { after } from "next/server";
import { announceDueReleases, claimDueReleases } from "@/lib/releases";
import { requireCleanScan } from "@/lib/scan";
import { autoFollowProduct } from "@/lib/follows";
import { eq, sql } from "drizzle-orm";
import { getCurrentUser, isStaff } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { downloadLogs, entitlements, products, releaseFiles, releases } from "@/lib/db/schema";
import { clientIpFrom, hashIp, isSameOrigin } from "@/lib/http";
import { sharedLimit } from "@/lib/rate-limit";
import { storage } from "@/lib/storage";

function seeOther(location: string) {
  // Location relatif → aman di balik proxy / domain apa pun
  return new Response(null, { status: 303, headers: { Location: location } });
}

/**
 * Tombol Download (form POST) → cek hak akses → catat unduhan → redirect ke signed URL.
 * Pakai POST supaya tidak bisa dipicu oleh link/gambar dari situs lain.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/download/[fileId]">) {
  const { fileId } = await ctx.params;
  if (!isSameOrigin(req)) return new Response("Origin tidak diizinkan", { status: 403 });
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return new Response("Not found", { status: 404 });

  const [file] = await db
    .select({
      id: releaseFiles.id,
      filename: releaseFiles.filename,
      storageKey: releaseFiles.storageKey,
      scanStatus: releaseFiles.scanStatus,
      releaseStatus: releases.status,
      releaseScheduledAt: releases.scheduledAt,
      productId: products.id,
      productSlug: products.slug,
      productStatus: products.status,
      pricingModel: products.pricingModel,
      sellerId: products.sellerId,
    })
    .from(releaseFiles)
    .innerJoin(releases, eq(releases.id, releaseFiles.releaseId))
    .innerJoin(products, eq(products.id, releases.productId))
    .where(eq(releaseFiles.id, fileId))
    .limit(1);
  if (!file) return new Response("File tidak ditemukan", { status: 404 });

  const user = await getCurrentUser();
  if (!user) return seeOther(`/masuk?next=${encodeURIComponent(`/p/${file.productSlug}`)}`);

  // File terinfeksi tidak pernah bisa diunduh siapa pun (file-nya juga sudah dihapus dari penyimpanan)
  if (file.scanStatus === "infected") return new Response("File diblokir: terdeteksi malware oleh antivirus.", { status: 451 });
  const privileged = user.id === file.sellerId || isStaff(user);
  // Mode ketat (setelah worker antivirus jalan): publik hanya boleh mengunduh file yang sudah dipindai bersih
  if (!privileged && requireCleanScan() && file.scanStatus !== "clean") {
    return new Response("File masih dalam pemindaian antivirus. Coba lagi beberapa menit lagi.", { status: 409 });
  }
  // Rilis terjadwal yang waktunya tiba → tayangkan dulu (lazy publish), lalu layani.
  if (file.releaseStatus === "published" && file.releaseScheduledAt && file.releaseScheduledAt <= new Date()) {
    const due = await claimDueReleases();
    if (due.length) after(() => announceDueReleases(due));
  }
  const scheduledFuture = Boolean(file.releaseScheduledAt && file.releaseScheduledAt > new Date());
  if (!privileged) {
    if (file.productStatus !== "published" || file.releaseStatus !== "published" || scheduledFuture) {
      return new Response("File tidak ditemukan", { status: 404 });
    }
    const rl = await sharedLimit(`download:${user.id}`, 40, 10 * 60 * 1000);
    if (!rl.ok) return new Response("Terlalu banyak unduhan. Coba lagi beberapa menit lagi.", { status: 429 });

    if (file.pricingModel === "free") {
      // Masuk ke Library (idempotent). Counter "unduhan" = jumlah user unik yang mengambil produk.
      const inserted = await db
        .insert(entitlements)
        .values({ userId: user.id, productId: file.productId, source: "free" })
        .onConflictDoNothing()
        .returning({ id: entitlements.id });
      if (inserted.length) {
        await db
          .update(products)
          .set({ downloadCount: sql`${products.downloadCount} + 1` })
          .where(eq(products.id, file.productId));
        // Pemilik baru otomatis mengikuti update produk (bisa berhenti di halaman produk / Diikuti)
        await autoFollowProduct(db, user.id, file.productId);
      }
    } else {
      const [owned] = await db
        .select({ id: entitlements.id })
        .from(entitlements)
        .where(sql`${entitlements.userId} = ${user.id} and ${entitlements.productId} = ${file.productId}`)
        .limit(1);
      if (!owned) return seeOther(`/p/${file.productSlug}`);
    }

    await db.insert(downloadLogs).values({
      userId: user.id,
      productId: file.productId,
      releaseFileId: file.id,
      ipHash: hashIp(clientIpFrom(req.headers)),
    });
  }

  const url = await storage().downloadUrl(file.storageKey, {
    filename: file.filename,
    userId: user.id,
    ttlSec: 10 * 60,
  });
  return seeOther(url);
}
