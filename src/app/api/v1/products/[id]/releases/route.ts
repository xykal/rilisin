import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, json, readJsonBody } from "@/lib/api";
import { db } from "@/lib/db";
import { releases } from "@/lib/db/schema";
import { ownedProduct, v1auth } from "@/lib/v1";

export const dynamic = "force-dynamic";

const releaseSchema = z.object({
  version: z
    .string()
    .trim()
    .max(25)
    .regex(/^[vV]?[0-9A-Za-z][0-9A-Za-z.+-]{0,23}$/, "Versi tidak valid (contoh: 1.0.0)"),
  changelogMd: z.string().max(5000).optional().default(""),
});

/** Bikin draft rilis (file di-upload terpisah via /api/uploads/* dengan key yang sama). */
export async function POST(req: Request, ctx: RouteContext<"/api/v1/products/[id]/releases">) {
  const r = await v1auth(req, "seller:write");
  if ("error" in r) return r.error;
  const { id } = await ctx.params;
  const product = await ownedProduct(id, r.auth.user.id);
  if (!product) return apiError(404, "Produk tidak ditemukan.");
  if (product.status === "review") return apiError(422, "Produk sedang direview. Tunggu hasil review sebelum menambah rilis.");
  if (product.status === "suspended") return apiError(422, "Produk ditangguhkan moderator dan tidak bisa diubah.");

  const parsed = releaseSchema.safeParse(await readJsonBody(req, 16 * 1024));
  if (!parsed.success) return apiError(400, "Data rilis tidak valid.", { issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });

  const version = parsed.data.version.replace(/^v/i, "");
  const existing = await db.select({ version: releases.version, status: releases.status }).from(releases).where(eq(releases.productId, product.id));
  if (existing.some((x) => x.status === "draft" || x.status === "review")) return apiError(422, "Masih ada rilis draft / sedang direview. Selesaikan dulu.");
  if (existing.some((x) => x.version.toLowerCase() === version.toLowerCase())) return apiError(409, "Versi ini sudah pernah dipakai.");

  const [release] = await db.insert(releases).values({ productId: product.id, version, changelogMd: parsed.data.changelogMd }).returning({ id: releases.id });
  return json({ id: release!.id, version, status: "draft" }, 201);
}
