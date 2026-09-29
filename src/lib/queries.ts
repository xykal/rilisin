import "server-only";
import { and, asc, count, countDistinct, desc, eq, ilike, inArray, isNull, lte, ne, or, sql, sum, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  downloadLogs,
  entitlements,
  products,
  releaseFiles,
  releases,
  sellerProfiles,
  users,
} from "@/lib/db/schema";

// ─── Kartu produk (dipakai di beranda, katalog, profil, library) ────────────
const cardSelect = {
  id: products.id,
  slug: products.slug,
  title: products.title,
  summary: products.summary,
  category: products.category,
  platforms: products.platforms,
  pricingModel: products.pricingModel,
  priceIdr: products.priceIdr,
  minPriceIdr: products.minPriceIdr,
  iconKey: products.iconKey,
  coverKey: products.coverKey,
  downloadCount: products.downloadCount,
  ratingCount: products.ratingCount,
  ratingSum: products.ratingSum,
  publishedAt: products.publishedAt,
  isFeatured: products.isFeatured,
  sellerUsername: users.username,
  sellerName: sql<string>`coalesce(${sellerProfiles.storeName}, ${users.displayName})`,
};

export type ProductCardData = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  platforms: string[];
  pricingModel: "free" | "fixed" | "pwyw";
  priceIdr: number;
  minPriceIdr: number;
  iconKey: string | null;
  coverKey: string | null;
  downloadCount: number;
  ratingCount: number;
  ratingSum: number;
  publishedAt: Date | null;
  isFeatured: boolean;
  sellerUsername: string;
  sellerName: string;
};

/** Jumlah pengunduh unik 7 hari terakhir → dasar urutan "trending". */
const downloads7d = sql<number>`(
  select count(distinct dl.user_id)::int from ${downloadLogs} dl
  where dl.product_id = ${products.id} and dl.created_at > now() - interval '7 days'
)`;

function cardQuery() {
  return db
    .select(cardSelect)
    .from(products)
    .innerJoin(users, eq(users.id, products.sellerId))
    .leftJoin(sellerProfiles, eq(sellerProfiles.userId, products.sellerId));
}

const isPublished = eq(products.status, "published");

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export type CatalogFilters = {
  q?: string;
  category?: string;
  platform?: string;
  price?: string;
  sort?: string;
  page?: number;
};

export async function listCatalog(f: CatalogFilters, pageSize = 24) {
  const where: SQL[] = [isPublished];
  if (f.category) where.push(eq(products.category, f.category));
  if (f.platform) where.push(sql`${f.platform} = any(${products.platforms})`);
  if (f.price === "gratis") where.push(eq(products.pricingModel, "free"));
  if (f.price === "berbayar") where.push(ne(products.pricingModel, "free"));
  const q = f.q?.trim().slice(0, 100);
  if (q) {
    where.push(
      or(
        sql`to_tsvector('simple', ${products.title} || ' ' || ${products.summary}) @@ websearch_to_tsquery('simple', ${q})`,
        ilike(products.title, `%${escapeLike(q)}%`),
        ilike(products.summary, `%${escapeLike(q)}%`),
        sql`${q.toLowerCase()} = any(${products.tags})`,
      )!,
    );
  }
  const whereSql = and(...where);
  const bayesRating = sql`(${products.ratingSum} + 3.5 * 5) / (${products.ratingCount} + 5.0)`;
  const orderBy =
    f.sort === "rating"
      ? [desc(bayesRating), desc(products.ratingCount), desc(products.downloadCount)]
      : f.sort === "baru"
      ? [desc(products.publishedAt)]
      : f.sort === "populer"
        ? [desc(products.downloadCount), desc(products.publishedAt)]
        : [desc(downloads7d), desc(products.downloadCount), desc(products.publishedAt)];

  const page = Math.max(1, Math.min(f.page ?? 1, 500));
  const [items, totalRows] = await Promise.all([
    cardQuery()
      .where(whereSql)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(products).where(whereSql),
  ]);
  return { items: items as ProductCardData[], total: totalRows[0]?.total ?? 0, page, pageSize };
}

export async function getHomeData() {
  const [trending, newest, featured, statsRows] = await Promise.all([
    cardQuery()
      .where(isPublished)
      .orderBy(desc(downloads7d), desc(products.downloadCount))
      .limit(8),
    cardQuery().where(isPublished).orderBy(desc(products.publishedAt)).limit(4),
    cardQuery()
      .where(and(isPublished, eq(products.isFeatured, true)))
      .orderBy(desc(products.downloadCount))
      .limit(3),
    db
      .select({
        products: count(),
        sellers: countDistinct(products.sellerId),
        downloads: sum(products.downloadCount).mapWith(Number),
      })
      .from(products)
      .where(isPublished),
  ]);
  const stats = statsRows[0] ?? { products: 0, sellers: 0, downloads: 0 };
  return {
    trending: trending as ProductCardData[],
    newest: newest as ProductCardData[],
    featured: featured as ProductCardData[],
    stats: { ...stats, downloads: stats.downloads ?? 0 },
  };
}

// ─── Halaman produk ──────────────────────────────────────────────────────────
export async function getProductBySlug(slug: string) {
  return db.query.products.findFirst({
    where: eq(products.slug, slug),
    with: {
      seller: {
        columns: { id: true, username: true, displayName: true, avatarKey: true, createdAt: true },
        with: { sellerProfile: true },
      },
      media: { orderBy: (m, { asc }) => [asc(m.sort), asc(m.createdAt)] },
      releases: {
        where: (r, { and, eq, isNull, lte, or }) =>
          and(eq(r.status, "published"), or(isNull(r.scheduledAt), lte(r.scheduledAt, new Date()))),
        orderBy: (r, { desc }) => [desc(r.publishedAt)],
        with: { files: { orderBy: (f, { asc }) => [asc(f.platform), asc(f.createdAt)] } },
      },
    },
  });
}

export async function getSellerStats(sellerId: string) {
  const [row] = await db
    .select({ products: count(), downloads: sum(products.downloadCount).mapWith(Number) })
    .from(products)
    .where(and(eq(products.sellerId, sellerId), isPublished));
  return { products: row?.products ?? 0, downloads: row?.downloads ?? 0 };
}

export async function hasEntitlement(userId: string, productId: string) {
  const [row] = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(and(eq(entitlements.userId, userId), eq(entitlements.productId, productId)))
    .limit(1);
  return Boolean(row);
}

export async function getMoreFromSeller(sellerId: string, excludeId: string) {
  return (await cardQuery()
    .where(and(isPublished, eq(products.sellerId, sellerId), ne(products.id, excludeId)))
    .orderBy(desc(products.downloadCount))
    .limit(3)) as ProductCardData[];
}

// ─── Profil seller ───────────────────────────────────────────────────────────
export async function getSellerProfile(username: string) {
  const [row] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      bio: users.bio,
      avatarKey: users.avatarKey,
      location: users.location,
      userWebsiteUrl: users.websiteUrl,
      coverKey: users.coverKey,
      createdAt: users.createdAt,
      storeName: sellerProfiles.storeName,
      tagline: sellerProfiles.tagline,
      websiteUrl: sellerProfiles.websiteUrl,
      isTrusted: sellerProfiles.isTrusted,
    })
    .from(users)
    .leftJoin(sellerProfiles, and(eq(sellerProfiles.userId, users.id), eq(sellerProfiles.status, "approved")))
    .where(sql`lower(${users.username}) = ${username.toLowerCase()}`)
    .limit(1);
  if (!row) return null;
  const items = (await cardQuery()
    .where(and(isPublished, eq(products.sellerId, row.id)))
    .orderBy(desc(products.publishedAt))) as ProductCardData[];
  const stats = await getSellerStats(row.id);
  return { ...row, items, stats };
}

// ─── Library ─────────────────────────────────────────────────────────────────
export async function getLibrary(userId: string) {
  const rows = await db
    .select({
      ...cardSelect,
      acquiredAt: entitlements.createdAt,
      source: entitlements.source,
      lastDownloadAt: sql<Date | null>`(
        select max(dl.created_at) from ${downloadLogs} dl
        where dl.user_id = ${userId} and dl.product_id = ${products.id}
      )`.mapWith((v) => (v ? new Date(v) : null)),
      latestVersion: sql<string | null>`(
        select r.version from ${releases} r
        where r.product_id = ${products.id} and r.status = 'published' and (r.scheduled_at is null or r.scheduled_at <= now())
        order by r.published_at desc limit 1
      )`,
      latestReleasedAt: sql<Date | null>`(
        select max(r.published_at) from ${releases} r
        where r.product_id = ${products.id} and r.status = 'published' and (r.scheduled_at is null or r.scheduled_at <= now())
      )`.mapWith((v) => (v ? new Date(v) : null)),
      productStatus: products.status,
    })
    .from(entitlements)
    .innerJoin(products, eq(products.id, entitlements.productId))
    .innerJoin(users, eq(users.id, products.sellerId))
    .leftJoin(sellerProfiles, eq(sellerProfiles.userId, products.sellerId))
    .where(eq(entitlements.userId, userId))
    .orderBy(desc(entitlements.createdAt));
  return rows;
}

// ─── Seller Center ───────────────────────────────────────────────────────────
export async function getSellerProducts(sellerId: string) {
  return db.query.products.findMany({
    where: eq(products.sellerId, sellerId),
    orderBy: (p, { desc }) => [desc(p.updatedAt)],
    with: {
      releases: {
        orderBy: (r, { desc }) => [desc(r.createdAt)],
        columns: { id: true, version: true, status: true, publishedAt: true, rejectionReason: true },
      },
    },
  });
}

export async function getSellerDownloads7d(sellerId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(downloadLogs)
    .innerJoin(products, eq(products.id, downloadLogs.productId))
    .where(and(eq(products.sellerId, sellerId), sql`${downloadLogs.createdAt} > now() - interval '7 days'`));
  return row?.n ?? 0;
}

export async function getProductForOwner(productId: string, sellerId: string) {
  return db.query.products.findFirst({
    where: and(eq(products.id, productId), eq(products.sellerId, sellerId)),
    with: {
      media: { orderBy: (m, { asc }) => [asc(m.sort), asc(m.createdAt)] },
      releases: {
        orderBy: (r, { desc }) => [desc(r.createdAt)],
        with: { files: { orderBy: (f, { asc }) => [asc(f.createdAt)] } },
      },
    },
  });
}

// ─── Admin ───────────────────────────────────────────────────────────────────
export async function getReviewQueue() {
  const newProducts = await db
    .select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      category: products.category,
      iconKey: products.iconKey,
      submittedAt: products.submittedAt,
      sellerUsername: users.username,
      sellerCreatedAt: users.createdAt,
      androidRegistration: products.androidRegistration,
      platforms: products.platforms,
    })
    .from(products)
    .innerJoin(users, eq(users.id, products.sellerId))
    .where(eq(products.status, "review"))
    .orderBy(asc(products.submittedAt));

  const releaseUpdates = await db
    .select({
      releaseId: releases.id,
      version: releases.version,
      submittedAt: releases.submittedAt,
      productId: products.id,
      title: products.title,
      iconKey: products.iconKey,
      sellerUsername: users.username,
    })
    .from(releases)
    .innerJoin(products, eq(products.id, releases.productId))
    .innerJoin(users, eq(users.id, products.sellerId))
    .where(and(eq(releases.status, "review"), eq(products.status, "published")))
    .orderBy(asc(releases.submittedAt));

  return { newProducts, releaseUpdates };
}

export async function getProductForReview(productId: string) {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    with: {
      seller: {
        columns: { id: true, username: true, displayName: true, email: true, createdAt: true },
        with: { sellerProfile: true },
      },
      media: { orderBy: (m, { asc }) => [asc(m.sort)] },
      releases: {
        orderBy: (r, { desc }) => [desc(r.createdAt)],
        with: { files: { orderBy: (f, { asc }) => [asc(f.createdAt)] } },
      },
    },
  });
  if (!product) return null;

  const hashes = product.releases.flatMap((r) => r.files.map((f) => f.sha256));
  const duplicates = hashes.length
    ? await db
        .select({
          sha256: releaseFiles.sha256,
          productTitle: products.title,
          productSlug: products.slug,
          sellerUsername: users.username,
        })
        .from(releaseFiles)
        .innerJoin(releases, eq(releases.id, releaseFiles.releaseId))
        .innerJoin(products, eq(products.id, releases.productId))
        .innerJoin(users, eq(users.id, products.sellerId))
        .where(and(inArray(releaseFiles.sha256, hashes), ne(products.sellerId, product.sellerId)))
    : [];

  const [sellerCounts] = await db
    .select({
      total: count(),
      published: sql<number>`count(*) filter (where ${products.status} = 'published')`.mapWith(Number),
      rejected: sql<number>`count(*) filter (where ${products.status} = 'rejected')`.mapWith(Number),
    })
    .from(products)
    .where(eq(products.sellerId, product.sellerId));

  return { product, duplicates, sellerCounts };
}
