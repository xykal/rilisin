import { z } from "zod";
import { apiError, json, readJsonBody } from "@/lib/api";
import { submitProductFlow } from "@/lib/seller/submit";
import { v1auth } from "@/lib/v1";

export const dynamic = "force-dynamic";

const schema = z.object({ scheduledAt: z.string().max(40).optional().default("") });

/** Kirim produk (+ semua rilis draft ber-file) ke review — atau langsung tayang kalau seller terpercaya. */
export async function POST(req: Request, ctx: RouteContext<"/api/v1/products/[id]/submit">) {
  const r = await v1auth(req, "seller:write");
  if ("error" in r) return r.error;
  const { id } = await ctx.params;
  const parsed = schema.safeParse((await readJsonBody(req, 1024)) ?? {});
  if (!parsed.success) return apiError(400, "Body tidak valid.");
  const out = await submitProductFlow(id, { id: r.auth.user.id, isTrusted: r.auth.user.seller?.isTrusted ?? false }, parsed.data.scheduledAt);
  if (!out.ok) {
    const status = out.code === "not-found" ? 404 : out.code === "schedule" ? 400 : 422;
    return apiError(status, out.message, out.checklist ? { checklist: out.checklist } : {});
  }
  return json({ outcome: out.outcome, productId: out.productId });
}
