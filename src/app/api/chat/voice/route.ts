import { randomUUID } from "node:crypto";
import { and, count, eq, gt } from "drizzle-orm";
import { apiError, guardMutation, json } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { CHAT_LIMITS } from "@/lib/chat/shared";
import { db } from "@/lib/db";
import { chatUploads } from "@/lib/db/schema";
import { detectAudioType } from "@/lib/files";
import { sharedLimit } from "@/lib/rate-limit";
import { mediaUrl, storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

const DAILY_QUOTA = 40; // pool bersama gambar chat
const EXT = { webm: "webm", ogg: "ogg", mp4: "m4a" } as const;

/**
 * Upload voice note untuk chat. Body = audio mentah (webm/opus, ogg, mp4),
 * maks 2 MB (±2 menit). Server mengecek magic bytes (bukan cuma Content-Type).
 * Durasi dikirim browser via header x-voice-sec (1–120 detik, hanya label tampil).
 */
export async function POST(req: Request) {
  const blocked = guardMutation(req, { contentType: /^audio\/(webm|ogg|mp4)$/i });
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Silakan masuk dulu.");

  const rawSec = req.headers.get("x-voice-sec");
  if (rawSec === null) return apiError(400, "Durasi voice note tidak valid.");
  const sec = Math.min(CHAT_LIMITS.voiceMaxSec, Math.max(1, Math.round(Number(rawSec))));
  if (!Number.isFinite(sec)) return apiError(400, "Durasi voice note tidak valid.");

  const rl = await sharedLimit(`chat:voice:${user.id}`, 10, 10 * 60_000);
  if (!rl.ok) return apiError(429, "Terlalu banyak voice note. Coba lagi nanti.", { retryAfter: rl.retryAfterSec });
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(chatUploads)
    .where(and(eq(chatUploads.uploaderId, user.id), gt(chatUploads.createdAt, new Date(Date.now() - 24 * 3_600_000))));
  if (n >= DAILY_QUOTA) return apiError(429, `Batas ${DAILY_QUOTA} upload per hari tercapai.`);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > CHAT_LIMITS.voiceMaxBytes) return apiError(413, "Voice note maksimal 2 MB.");
  if (!req.body) return apiError(400, "File kosong.");

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = req.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > CHAT_LIMITS.voiceMaxBytes) {
      await reader.cancel();
      return apiError(413, "Voice note maksimal 2 MB.");
    }
    chunks.push(value);
  }
  const buf = Buffer.concat(chunks);
  const kind = detectAudioType(buf.subarray(0, 16));
  if (!kind) return apiError(415, "File bukan audio WebM/Ogg/M4A yang valid.");

  const key = `public/chat/${user.id}/${randomUUID()}.${EXT[kind]}`;
  await storage().write(key, buf);
  // width/height NOT NULL di skema: 0 = bukan gambar (durasi disimpan di pesan, bukan di sini).
  const [row] = await db
    .insert(chatUploads)
    .values({ uploaderId: user.id, storageKey: key, width: 0, height: 0, sizeBytes: buf.length })
    .returning({ id: chatUploads.id });
  return json({ id: row!.id, url: mediaUrl(key), sec, bytes: buf.length }, 201);
}
