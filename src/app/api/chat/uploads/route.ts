import { randomUUID } from "node:crypto";
import { and, count, eq, gt } from "drizzle-orm";
import sharp, { type OutputInfo } from "sharp";
import { apiError, guardMutation, json } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { CHAT_LIMITS } from "@/lib/chat/shared";
import { db } from "@/lib/db";
import { chatUploads } from "@/lib/db/schema";
import { detectImageType } from "@/lib/files";
import { sharedLimit } from "@/lib/rate-limit";
import { mediaUrl, storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

const DAILY_QUOTA = 40;

/** Magic bytes format audio hasil MediaRecorder browser (webm/opus Chrome, mp4/aac Safari, ogg Firefox). */
function detectAudio(buf: Buffer): "webm" | "mp4" | "ogg" | null {
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "webm";
  if (buf.length >= 4 && buf.subarray(0, 4).toString("latin1") === "OggS") return "ogg";
  if (buf.length >= 8 && buf.subarray(4, 8).toString("latin1") === "ftyp") return "mp4";
  return null;
}

async function readBody(req: Request, maxBytes: number): Promise<Buffer | "overflow" | null> {
  if (!req.body) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = req.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return "overflow";
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Upload lampiran chat: gambar (PNG/JPG/WebP → WebP 1600px, EXIF dibuang) atau pesan suara (webm/mp4/ogg apa adanya).
 * Body = file mentah. Pesan suara wajib kirim header x-audio-secs (durasi detik, maks 300).
 */
export async function POST(req: Request) {
  const blocked = guardMutation(req, { contentType: /^(image\/(png|jpeg|webp)|audio\/(webm|mp4|ogg))(;.*)?$/i });
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Silakan masuk dulu.");

  const rl = await sharedLimit(`chat:upload:${user.id}`, 10, 10 * 60_000);
  if (!rl.ok) return apiError(429, "Terlalu banyak upload. Coba lagi nanti.", { retryAfter: rl.retryAfterSec });
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(chatUploads)
    .where(and(eq(chatUploads.uploaderId, user.id), gt(chatUploads.createdAt, new Date(Date.now() - 24 * 3_600_000))));
  if (n >= DAILY_QUOTA) return apiError(429, `Batas ${DAILY_QUOTA} lampiran per hari tercapai.`);

  const isAudio = (req.headers.get("content-type") ?? "").toLowerCase().startsWith("audio/");
  const declared = Number(req.headers.get("content-length") ?? 0);
  const maxBytes = isAudio ? CHAT_LIMITS.audioMaxBytes : CHAT_LIMITS.imageMaxBytes;
  if (declared > maxBytes) return apiError(413, isAudio ? "Pesan suara maksimal 5 MB." : "Gambar maksimal 8 MB.");

  // ── Pesan suara ──
  if (isAudio) {
    const secs = Number(req.headers.get("x-audio-secs") ?? 0);
    if (!Number.isInteger(secs) || secs < 1 || secs > CHAT_LIMITS.audioMaxSecs)
      return apiError(400, `Durasi pesan suara 1–${CHAT_LIMITS.audioMaxSecs} detik.`);
    const buf = await readBody(req, maxBytes);
    if (buf === "overflow") return apiError(413, "Pesan suara maksimal 5 MB.");
    if (!buf || buf.length === 0) return apiError(400, "File kosong.");
    const fmt = detectAudio(buf);
    if (!fmt) return apiError(415, "File bukan audio webm/mp4/ogg yang valid.");
    const key = `public/chat/audio/${user.id}/${randomUUID()}.${fmt}`;
    await storage().write(key, buf);
    const [row] = await db
      .insert(chatUploads)
      .values({ uploaderId: user.id, storageKey: key, width: 0, height: 0, sizeBytes: buf.length, kind: "audio", durationSecs: secs })
      .returning({ id: chatUploads.id });
    return json({ id: row!.id, url: mediaUrl(key), secs }, 201);
  }

  // ── Gambar ──
  const buf = await readBody(req, maxBytes);
  if (buf === "overflow") return apiError(413, "Gambar maksimal 8 MB.");
  if (!buf || buf.length === 0) return apiError(400, "File kosong.");
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
