import { apiError, guardMutation } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getActiveMute, getRoomBySlug, isRoomMember, publishTyping } from "@/lib/chat/server";
import { isStaffRole } from "@/lib/chat/shared";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Indikator "sedang mengetik…" / "sedang merekam…" — tidak disimpan ke database, hanya diteruskan realtime. */
export async function POST(req: Request, ctx: RouteContext<"/api/chat/rooms/[slug]/typing">) {
  const blocked = guardMutation(req);
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Silakan masuk dulu.");
  const { slug } = await ctx.params;
  const room = await getRoomBySlug(slug);
  if (!room) return apiError(404, "Ruang tidak ditemukan.");
  // Grup privat: hanya anggota (privasi penuh — staf moderasi mengandalkan laporan). 404 supaya tidak bocor.
  if (room.isPrivate && (!user || !(await isRoomMember(room.id, user.id)))) return apiError(404, "Ruang tidak ditemukan.");
  if (room.kind === "announcement" && !isStaffRole(user.role)) return new Response(null, { status: 204 });
  if (!rateLimit(`chat:typing:${user.id}:${room.id}`, 1, 2500).ok) return new Response(null, { status: 204 });
  if (await getActiveMute(user.id, room.id)) return new Response(null, { status: 204 });
  const mode = (await req.json().catch(() => ({}))) as { mode?: string };
  await publishTyping(room.id, user.id, user.displayName, mode?.mode === "recording" ? "recording" : "typing");
  return new Response(null, { status: 204 });
}
