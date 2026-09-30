import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, json, readJsonBody } from "@/lib/api";
import { CATEGORIES, LICENSES, PLATFORMS } from "@/lib/config";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { sharedLimit } from "@/lib/rate-limit";
import { slugify } from "@/lib/slug";
import { v1auth } from "@/lib/v1";

export const dynamic = "force-dynamic";

const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as [string, ...string[]];
const PLATFORM_SLUGS = PLATFORMS.map((p) => p.slug) as [string, ...string[]];

/** Daftar produk milik sendiri (AI seller). */
export async function GET(req: Request) {
  const r = await v1auth(req, "seller:read");
  if ("error" in r) return r.error;
  const rows = await db
    .select({ id: products.id, slug: products.slug, title: products.title, status: products.status, category: products.category, priceIdr: products.priceIdr, createdAt: products.createdAt })
    .from(products)
    .where(eq(products.sellerId, r.auth.user.id))
    .orderBy(desc(products.createdAt))
    .limit(50);
  return json({ products: rows });
}

const createSchema = z.object({
  title: z.string().trim().min(3).max(80),
  summary: z.string().trim().min(10).max(160),
  category: z.enum(CATEGORY_SLUGS),
  platforms: z.array(z.enum(PLATFORM_SLUGS)).min(1).max(6),
  license: z.enum(LICENSES),
  tags: z.string().max(300).optional().default(""),
  descriptionMd: z.string().max(20000).optional().default(""),
  websiteUrl: z.string().trim().max(300).optional().default(""),
  sourceUrl: z.string().trim().max(300).optional().default(""),
  pricingModel: z.enum(["free", "fixed", "pwyw"]).optional().default("free"),
  priceIdr: z.coerce.number().int().min(0).max(10_000_000).optional().default(0),
  minPriceIdr: z.coerce.number().int().min(0).max(10_000_000).optional().default(0),
});

function validUrl(v: string): string | null {
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Bikin draft produk. Kirim ke review: POST /api/v1/products/:id/submit. */
export async function POST(req: Request) {
  const r = await v1auth(req, "seller:write");
  if ("error" in r) return r.error;
  const rl = await sharedLimit(`create-product:${r.auth.user.id}`, 20, 24 * 60 * 60_000);
  if (!rl.ok) return apiError(429, "Batas membuat produk hari ini tercapai.");
  const body = await readJsonBody(req, 32 * 1024);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return apiError(400, "Data produk tidak valid.", { issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
  const d = parsed.data;
  if ((d.websiteUrl && !validUrl(d.websiteUrl)) || (d.sourceUrl && !validUrl(d.sourceUrl))) return apiError(400, "websiteUrl/sourceUrl harus URL http(s) yang valid.");
  const tags = [...new Set(d.tags.split(",").map((t) => slugify(t, 24)).filter(Boolean))].slice(0, 8);

  const base = slugify(d.title) || "produk";
  let slug = base;
  for (let i = 1; i < 50; i++) {
    const [exists] = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug)).limit(1);
    if (!exists) break;
    slug = `${base}-${i + 1}`;
  }

  const [product] = await db
    .insert(products)
    .values({
      sellerId: r.auth.user.id,
      slug,
      title: d.title,
      summary: d.summary,
      descriptionMd: d.descriptionMd,
      category: d.category,
      platforms: d.platforms,
      tags,
      license: d.license,
      websiteUrl: validUrl(d.websiteUrl),
      sourceUrl: validUrl(d.sourceUrl),
      pricingModel: d.pricingModel,
      priceIdr: d.pricingModel === "free" ? 0 : d.priceIdr,
      minPriceIdr: d.pricingModel === "pwyw" ? d.minPriceIdr : 0,
    })
    .returning({ id: products.id });
  return json({ id: product!.id, slug, status: "draft" }, 201);
}
