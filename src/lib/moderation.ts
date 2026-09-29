import "server-only";
import { and, count, countDistinct, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { countOpenContentReports } from "@/lib/community/reports";
import { products, releases, reports, sellerProfiles } from "@/lib/db/schema";

/** Jumlah pekerjaan moderator: karya/rilis menunggu review + pesan chat, postingan forum & ulasan yang dilaporkan. */
export async function getModerationCounts() {
  const [[p], [r], [rep], [s], content] = await Promise.all([
    db.select({ n: count() }).from(products).where(eq(products.status, "review")),
    db
      .select({ n: count() })
      .from(releases)
      .innerJoin(products, eq(products.id, releases.productId))
      .where(and(eq(releases.status, "review"), eq(products.status, "published"))),
    db
      .select({ n: countDistinct(reports.targetId) })
      .from(reports)
      .where(and(eq(reports.status, "open"), eq(reports.targetType, "chat_message"))),
    db.select({ n: count() }).from(sellerProfiles).where(eq(sellerProfiles.status, "pending")),
    countOpenContentReports(),
  ]);
  const reviews = (p?.n ?? 0) + (r?.n ?? 0);
  const openReports = rep?.n ?? 0;
  return { reviews, reports: openReports, contentReports: content, sellers: s?.n ?? 0, total: reviews + openReports + content };
}
