import { apiError, guardRead, json } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getUnreadCount, listNotifications } from "@/lib/notifications/server";
import { rateLimit } from "@/lib/rate-limit";

/** Isi panel lonceng: notifikasi terbaru + jumlah belum dibaca. */
export async function GET(req: Request) {
  const blocked = guardRead(req);
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Silakan masuk");
  if (!rateLimit(`notif:list:${user.id}`, 60, 60_000).ok) return apiError(429, "Terlalu sering");
  const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit")) || 8, 1), 20);
  const [items, unread] = await Promise.all([listNotifications(user.id, { limit }), getUnreadCount(user.id)]);
  return json({ unread, items });
}
