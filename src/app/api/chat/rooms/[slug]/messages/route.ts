import { z } from "zod";
import { apiError, guardMutation, guardRead, json, readJsonBody, UUID_RE } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { actorFrom, chatErrorResponse } from "@/lib/chat/api-helpers";
import { getRoomBySlug, isRoomMember, listMessages, sendMessage, syncMessages } from "@/lib/chat/server";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Riwayat pesan (?before=seq) atau sinkronisasi perubahan (?since=ISO). Wajib login. */
export async function GET(req: Request, ctx: RouteContext<"/api/chat/rooms/[slug]/messages">) {
  const blocked = guardRead(req);
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Silakan masuk dulu.");
  const rl = rateLimit(`chat:read:${user.id}`, 120, 60_000);
  if (!rl.ok) return apiError(429, "Terlalu banyak permintaan.", { retryAfter: rl.retryAfterSec });

  const { slug } = await ctx.params;
  const room = await getRoomBySlug(slug);
  if (!room) return apiError(404, "Ruang tidak ditemukan.");
  // Grup privat: hanya anggota (privasi penuh — staf moderasi mengandalkan laporan). 404 supaya tidak bocor.
  if (room.isPrivate && (!user || !(await isRoomMember(room.id, user.id)))) return apiError(404, "Ruang tidak ditemukan.");

  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  if (since) {
    const d = new Date(since);
    if (Number.isNaN(d.getTime())) return apiError(400, "Parameter since tidak valid.");
    const messages = await syncMessages({ roomId: room.id, viewerId: user.id, since: d });
    return json({ messages, serverTime: new Date().toISOString() });
  }
  const before = url.searchParams.get("before");
  const beforeSeq = before ? Number(before) : undefined;
  if (before && (!Number.isSafeInteger(beforeSeq) || beforeSeq! <= 0)) return apiError(400, "Parameter before tidak valid.");
  const page = await listMessages({ roomId: room.id, viewerId: user.id, beforeSeq });
  return json(page);
}

const sendSchema = z.object({
  body: z.string().max(8000),
  clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  replyToId: z.string().regex(UUID_RE).nullish(),
  uploadId: z.string().regex(UUID_RE).nullish(),
  stickerKey: z.string().max(41).nullish(),
});

export async function POST(req: Request, ctx: RouteContext<"/api/chat/rooms/[slug]/messages">) {
  const blocked = guardMutation(req);
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Silakan masuk dulu.");
  const { slug } = await ctx.params;
  const room = await getRoomBySlug(slug);
  if (!room) return apiError(404, "Ruang tidak ditemukan.");
  // Grup privat: hanya anggota (privasi penuh — staf moderasi mengandalkan laporan). 404 supaya tidak bocor.
  if (room.isPrivate && (!user || !(await isRoomMember(room.id, user.id)))) return apiError(404, "Ruang tidak ditemukan.");

  const parsed = sendSchema.safeParse(await readJsonBody(req, 32 * 1024));
  if (!parsed.success) return apiError(400, "Data pesan tidak valid.");
  try {
    const message = await sendMessage(actorFrom(user), room, parsed.data, req);
    return json({ message }, 201);
  } catch (err) {
    return chatErrorResponse(err);
  }
}
