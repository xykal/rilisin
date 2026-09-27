import { apiError, guardRead, json } from "@/lib/api";
import { getCurrentUser, isStaff } from "@/lib/auth/current-user";
import { reconcileOrder } from "@/lib/payments/orders";
import { getOrderByCode } from "@/lib/payments/queries";
import { rateLimit } from "@/lib/rate-limit";

/** Dipanggil halaman pesanan tiap ±4 detik selama menunggu pembayaran (cadangan kalau webhook telat/hilang). */
export async function GET(req: Request, ctx: RouteContext<"/api/orders/[code]/status">) {
  const blocked = guardRead(req);
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Silakan masuk");
  if (!rateLimit(`order-status:${user.id}`, 60, 60_000).ok) return apiError(429, "Terlalu sering");
  const { code } = await ctx.params;
  const row = await getOrderByCode(code);
  if (!row || (row.order.buyerId !== user.id && !isStaff(user))) return apiError(404, "Pesanan tidak ditemukan");
  const o = row.order.status === "pending" ? await reconcileOrder(code) : row.order;
  return json({ status: o?.status ?? row.order.status, paidAt: o?.paidAt ?? null }, 200, { "Cache-Control": "no-store" });
}
