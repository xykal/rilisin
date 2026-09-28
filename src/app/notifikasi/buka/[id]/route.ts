import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { openNotification } from "@/lib/notifications/server";

// Location relatif → aman di balik proxy / domain apa pun
const seeOther = (location: string) => new NextResponse(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });

/** Klik notifikasi (dari lonceng / email): tandai dibaca lalu arahkan ke tujuannya (selalu path internal). */
export async function GET(_req: Request, ctx: RouteContext<"/notifikasi/buka/[id]">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return seeOther(`/masuk?next=${encodeURIComponent(`/notifikasi/buka/${encodeURIComponent(id)}`)}`);
  const n = Number(id);
  const url = Number.isSafeInteger(n) && n > 0 ? await openNotification(user.id, n) : null;
  return seeOther(url ?? "/notifikasi");
}
