import { apiError, guardMutation, json, readJsonBody } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { markAllRead, openNotification } from "@/lib/notifications/server";

/** Tandai dibaca: { all: true } atau { id: 123 }. */
export async function POST(req: Request) {
  const blocked = guardMutation(req);
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Silakan masuk");
  const body = await readJsonBody<{ all?: boolean; id?: number }>(req, 1024);
  if (body?.all === true) return json({ marked: await markAllRead(user.id) });
  if (Number.isSafeInteger(body?.id) && (body!.id as number) > 0) {
    const url = await openNotification(user.id, body!.id as number);
    return url ? json({ marked: 1 }) : apiError(404, "Notifikasi tidak ditemukan");
  }
  return apiError(400, "Permintaan tidak valid");
}
