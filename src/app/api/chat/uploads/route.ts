import { randomUUID } from "node:crypto";
import { and, count, eq, gt } from "drizzle-orm";
import sharp, { type OutputInfo } from "sharp";
import { apiError, guardMutation, json } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { CHAT_LIMITS } from "@/lib/chat/shared";
import { db } from "@/lib/db";
import { chatUploads } from "@/lib/db/schema";
import { detectImageType } from "@/lib/files";
import { rateLimit } from "@/lib/rate-limit";
import { mediaUrl, storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

const DAILY_QUOTA = 40;

/**
 * Upload gambar untuk chat. Body = file mentah (image/png|jpeg|webp), maks 8 MB.
 * Server mengecek magic bytes (bukan cuma ekstensi), membuang metadata EXIF (lokasi GPS dll),
 * mengecilkan ke maks 1600 px, dan menyimpan sebagai WebP dengan nama acak.
 */
export async function POST(req: Request) {
  const blocked = guardMutation(req, { contentType: /^image\/(png|jpeg|webp)$/i });
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Silakan masuk dulu.");

  const rl = rateLimit(`chat:upload:${user.id}`, 10, 10 * 60_000);
  if (!rl.ok) return apiError(429, "Terlalu banyak upload gambar. Coba lagi nanti.", { retryAfter: rl.retryAfterSec });
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(chatUploads)
    .where(and(eq(chatUploads.uploaderId, user.id), gt(chatUploads.createdAt, new Date(Date.now() - 24 * 3_600_000))));
  if (n >= DAILY_QUOTA) return apiError(429, `Batas ${DAILY_QUOTA} gambar per hari tercapai.`);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > CHAT_LIMITS.imageMaxBytes) return apiError(413, "Gambar maksimal 8 MB.");
  if (!req.body) return apiError(400, "File kosong.");

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = req.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > CHAT_LIMITS.imageMaxBytes) {
      await reader.cancel();
      return apiError(413, "Gambar maksimal 8 MB.");
    }
    chunks.push(value);
  }
  const buf = Buffer.concat(chunks);
  if (!detectImageType(buf.subarray(0, 16))) return apiError(415, "File bukan gambar PNG/JPG/WebP yang valid.");

  let out: { data: Buffer; info: OutputInfo };
  try {
    out = await sharp(buf, { failOn: "error", limitInputPixels: 40_000_000 })
      .rotate()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    return apiError(415, "Gambar rusak atau tidak bisa dibaca.");
  }

  const key = `public/chat/${user.id}/${randomUUID()}.webp`;
  await storage().write(key, out.data);
  const [row] = await db
    .insert(chatUploads)
    .values({ uploaderId: user.id, storageKey: key, width: out.info.width, height: out.info.height, sizeBytes: out.data.length })
    .returning({ id: chatUploads.id });
  return json({ id: row!.id, url: mediaUrl(key), w: out.info.width, h: out.info.height }, 201);
}
