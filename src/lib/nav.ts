import "server-only";
import { and, asc, count, desc, eq } from "drizzle-orm";
import type { NavData } from "@/components/nav-menus";
import { CATEGORIES, PLATFORMS } from "@/lib/config";
import { db } from "@/lib/db";
import { chatRooms, products } from "@/lib/db/schema";
import { formatRupiah } from "@/lib/format";
import { mediaUrl } from "@/lib/storage";

/** Data untuk mega menu header (kategori + jumlah karya, pilihan editor, ruang komunitas). */
export async function getNavData(): Promise<NavData> {
  const [counts, featured, rooms] = await Promise.all([
    db
      .select({ category: products.category, n: count() })
      .from(products)
      .where(eq(products.status, "published"))
      .groupBy(products.category),
    db
      .select({
        slug: products.slug,
        title: products.title,
        summary: products.summary,
        iconKey: products.iconKey,
        pricingModel: products.pricingModel,
        priceIdr: products.priceIdr,
      })
      .from(products)
      .where(and(eq(products.status, "published"), eq(products.isFeatured, true)))
      .orderBy(desc(products.publishedAt))
      .limit(3),
    db
      .select({ slug: chatRooms.slug, name: chatRooms.name, emoji: chatRooms.emoji, description: chatRooms.description })
      .from(chatRooms)
      .orderBy(asc(chatRooms.sort))
      .limit(9),
  ]);
  const byCat = new Map(counts.map((c) => [c.category, c.n]));
  return {
    categories: CATEGORIES.map((c) => ({ slug: c.slug, label: c.label, description: c.description, count: byCat.get(c.slug) ?? 0 })),
    platforms: PLATFORMS.map((p) => ({ slug: p.slug, label: p.label })),
    featured: featured.map((f) => ({
      slug: f.slug,
      title: f.title,
      summary: f.summary,
      iconUrl: mediaUrl(f.iconKey),
      price: f.pricingModel === "free" ? "Gratis" : f.pricingModel === "pwyw" ? "Seikhlasnya" : formatRupiah(f.priceIdr),
    })),
    rooms,
  };
}
