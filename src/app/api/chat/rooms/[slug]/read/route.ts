import { z } from "zod";
import { apiError, guardMutation, readJsonBody } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getRoomBySlug, markRead } from "@/lib/chat/server";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const schema = z.object({ seq: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) });

/** Tandai sudah dibaca sampai pesan ke-`seq` (untuk badge belum dibaca). */
export async function POST(req: Request, ctx: RouteContext<"/api/chat/rooms/[slug]/read">) {
  const blocked = guardMutation(req);
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Silakan masuk dulu.");
  if (!rateLimit(`chat:readmark:${user.id}`, 60, 60_000).ok) return new Response(null, { status: 204 });
  const { slug } = await ctx.params;
  const room = await getRoomBySlug(slug);
  if (!room) return apiError(404, "Ruang tidak ditemukan.");
  const parsed = schema.safeParse(await readJsonBody(req, 1024));
  if (!parsed.success) return apiError(400, "Data tidak valid.");
  await markRead(user.id, room.id, parsed.data.seq);
  return new Response(null, { status: 204 });
}
