import { apiError, guardRead, json } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getUnreadCount } from "@/lib/notifications/server";
import { rateLimit } from "@/lib/rate-limit";

/** Dipanggil lonceng tiap ±1 menit selama tab terlihat (ringan: count dengan partial index). */
export async function GET(req: Request) {
  const blocked = guardRead(req);
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Silakan masuk");
  if (!rateLimit(`notif:unread:${user.id}`, 30, 60_000).ok) return apiError(429, "Terlalu sering");
  return json({ unread: await getUnreadCount(user.id) });
}
