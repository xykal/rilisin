import "server-only";
import { and, count, countDistinct, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, releases, reports } from "@/lib/db/schema";

/** Jumlah pekerjaan moderator: karya/rilis menunggu review + pesan chat yang dilaporkan. */
export async function getModerationCounts() {
  const [[p], [r], [rep]] = await Promise.all([
    db.select({ n: count() }).from(products).where(eq(products.status, "review")),
    db
      .select({ n: count() })
      .from(releases)
      .innerJoin(products, eq(products.id, releases.productId))
      .where(and(eq(releases.status, "review"), eq(products.status, "published"))),
    db.select({ n: countDistinct(reports.targetId) }).from(reports).where(eq(reports.status, "open")),
  ]);
  const reviews = (p?.n ?? 0) + (r?.n ?? 0);
  const openReports = rep?.n ?? 0;
  return { reviews, reports: openReports, total: reviews + openReports };
}
