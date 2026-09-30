import { count, eq } from "drizzle-orm";
import { json } from "@/lib/api";
import { db } from "@/lib/db";
import { products, reports, sellerProfiles, users } from "@/lib/db/schema";
import { v1auth } from "@/lib/v1";

export const dynamic = "force-dynamic";

/** Statistik ringkas buat AI agent / dasbor admin (read-only). */
export async function GET(req: Request) {
  const r = await v1auth(req, "admin:read");
  if ("error" in r) return r.error;
  const [[u], [p], [pub], [rev], [sel], [rep]] = await Promise.all([
    db.select({ n: count() }).from(users),
    db.select({ n: count() }).from(products),
    db.select({ n: count() }).from(products).where(eq(products.status, "published")),
    db.select({ n: count() }).from(products).where(eq(products.status, "review")),
    db.select({ n: count() }).from(sellerProfiles).where(eq(sellerProfiles.status, "pending")),
    db.select({ n: count() }).from(reports).where(eq(reports.status, "open")),
  ]);
  return json({
    users: u!.n,
    products: p!.n,
    productsPublished: pub!.n,
    productsInReview: rev!.n,
    pendingSellers: sel!.n,
    openReports: rep!.n,
  });
}
