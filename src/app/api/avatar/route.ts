import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { apiError, guardMutation, json } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { detectImageType } from "@/lib/files";
import { sharedLimit } from "@/lib/rate-limit";
import { mediaUrl, storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Upload foto profil. Body = file mentah (PNG/JPG/WebP), maks 4 MB.
 * Server mengecek magic bytes, membuang EXIF, memotong persegi 256 px (WebP).
 */
export async function POST(req: Request) {
  const blocked = guardMutation(req, { contentType: /^image\/(png|jpeg|webp)$/i });
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Silakan masuk dulu.");

  const rl = await sharedLimit(`avatar:${user.id}`, 10, 60 * 60_000);
  if (!rl.ok) return apiError(429, "Terlalu sering ganti foto. Coba lagi nanti.", { retryAfter: rl.retryAfterSec });

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return apiError(413, "Foto maksimal 4 MB.");
  if (!req.body) return apiError(400, "File kosong.");

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = req.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return apiError(413, "Foto maksimal 4 MB.");
    }
    chunks.push(value);
  }
  const buf = Buffer.concat(chunks);
  if (!detectImageType(buf.subarray(0, 16))) return apiError(415, "File bukan gambar PNG/JPG/WebP yang valid.");

  let out: Buffer;
  try {
    out = await sharp(buf, { failOn: "error", limitInputPixels: 40_000_000 })
      .rotate()
      .resize(256, 256, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    return apiError(415, "Gambar rusak atau tidak bisa dibaca.");
  }

  const key = `public/avatars/${user.id}/${randomUUID()}.webp`;
  await storage().write(key, out);
  const [prev] = await db.select({ avatarKey: users.avatarKey }).from(users).where(eq(users.id, user.id)).limit(1);
  await db.update(users).set({ avatarKey: key }).where(eq(users.id, user.id));
  if (prev?.avatarKey && prev.avatarKey !== key) storage().remove(prev.avatarKey).catch(() => {});
  revalidatePath("/akun/profil");
  revalidatePath(`/u/${user.username}`);
  revalidatePath("/", "layout");
  return json({ url: mediaUrl(key) }, 201);
}

/** Hapus foto profil (kembali ke inisial). */
export async function DELETE(req: Request) {
  const blocked = guardMutation(req);
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Silakan masuk dulu.");
  const [prev] = await db.select({ avatarKey: users.avatarKey }).from(users).where(eq(users.id, user.id)).limit(1);
  if (!prev?.avatarKey) return json({ ok: true });
  await db.update(users).set({ avatarKey: null }).where(eq(users.id, user.id));
  storage().remove(prev.avatarKey).catch(() => {});
  revalidatePath("/akun/profil");
  revalidatePath(`/u/${user.username}`);
  revalidatePath("/", "layout");
  return json({ ok: true });
}
