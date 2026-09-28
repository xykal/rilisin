import "server-only";
import { and, asc, count, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { isStaff, type CurrentUser } from "@/lib/auth/current-user";
import { cleanText, ContentError, guardContent } from "@/lib/community/guard";
import { REVIEW_LIMITS, plainSnippet } from "@/lib/community/shared";
import { db } from "@/lib/db";
import { entitlements, productReviews, products, releases, users } from "@/lib/db/schema";
import { notifyAndEmail } from "@/lib/notifications/server";
import { rateLimit } from "@/lib/rate-limit";

type Viewer = Pick<CurrentUser, "id" | "role"> | null;

export type ReviewEligibility =
  | { ok: true; source: string }
  | { ok: false; reason: "guest" | "seller" | "not_owner" | "unpublished" };

/** Hanya pemilik (punya entitlement: download gratis / beli / hadiah) yang boleh mengulas. Seller tidak boleh mengulas karyanya sendiri. */
export async function reviewEligibility(user: Pick<CurrentUser, "id"> | null, product: { id: string; sellerId: string; status: string }): Promise<ReviewEligibility> {
  if (!user) return { ok: false, reason: "guest" };
  if (product.status !== "published") return { ok: false, reason: "unpublished" };
  if (user.id === product.sellerId) return { ok: false, reason: "seller" };
  const [e] = await db
    .select({ source: entitlements.source })
    .from(entitlements)
    .where(and(eq(entitlements.userId, user.id), eq(entitlements.productId, product.id)))
    .limit(1);
  return e ? { ok: true, source: e.source } : { ok: false, reason: "not_owner" };
}

const visible = and(isNull(productReviews.hiddenAt), isNull(productReviews.reportHiddenAt));

/** Distribusi bintang (hanya ulasan yang tampil). */
export async function getRatingDistribution(productId: string) {
  const rows = await db
    .select({ rating: productReviews.rating, n: count() })
    .from(productReviews)
    .where(and(eq(productReviews.productId, productId), visible))
    .groupBy(productReviews.rating);
  const dist = [5, 4, 3, 2, 1].map((star) => ({ star, n: rows.find((r) => r.rating === star)?.n ?? 0 }));
  return dist;
}

export const REVIEW_SORTS = [
  { id: "terbaru", label: "Terbaru" },
  { id: "tertinggi", label: "Rating tertinggi" },
  { id: "terendah", label: "Rating terendah" },
] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number]["id"];

export type ReviewDTO = {
  id: string;
  rating: number;
  body: string;
  version: string | null;
  createdAt: Date;
  editedAt: Date | null;
  sellerReply: string | null;
  sellerRepliedAt: Date | null;
  hidden: boolean;
  hiddenReason: string | null;
  autoHidden: boolean;
  isOwner: boolean;
  purchased: boolean;
  author: { id: string; username: string; displayName: string; avatarKey: string | null };
};

/**
 * Daftar ulasan. Publik hanya melihat yang tampil; staf melihat semuanya (untuk moderasi);
 * penulis tetap melihat ulasannya sendiri walau disembunyikan (dengan keterangan).
 */
export async function listReviews(
  productId: string,
  opts: { viewer: Viewer; sort?: ReviewSort; star?: number | null; page?: number; pageSize?: number },
) {
  const pageSize = opts.pageSize ?? REVIEW_LIMITS.pageSize;
  const page = Math.max(1, Math.min(opts.page ?? 1, 200));
  const staff = isStaff(opts.viewer);
  const where: SQL[] = [eq(productReviews.productId, productId)];
  if (!staff) where.push(opts.viewer ? sql`((${visible}) or ${productReviews.userId} = ${opts.viewer.id})` : visible!);
  if (opts.star && opts.star >= 1 && opts.star <= 5) where.push(eq(productReviews.rating, opts.star));
  const order =
    opts.sort === "tertinggi"
      ? [desc(productReviews.rating), desc(productReviews.createdAt)]
      : opts.sort === "terendah"
        ? [asc(productReviews.rating), desc(productReviews.createdAt)]
        : [desc(productReviews.createdAt)];

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: productReviews.id,
        rating: productReviews.rating,
        body: productReviews.body,
        version: productReviews.version,
        createdAt: productReviews.createdAt,
        editedAt: productReviews.editedAt,
        sellerReply: productReviews.sellerReply,
        sellerRepliedAt: productReviews.sellerRepliedAt,
        hiddenAt: productReviews.hiddenAt,
        hiddenReason: productReviews.hiddenReason,
        reportHiddenAt: productReviews.reportHiddenAt,
        authorId: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarKey: users.avatarKey,
        ownSource: sql<string | null>`(select e.source::text from ${entitlements} e where e.user_id = ${productReviews.userId} and e.product_id = ${productReviews.productId} limit 1)`,
      })
      .from(productReviews)
      .innerJoin(users, eq(users.id, productReviews.userId))
      .where(and(...where))
      .orderBy(...order)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: count() }).from(productReviews).where(and(...where)),
  ]);

  const items: ReviewDTO[] = rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    body: r.body,
    version: r.version,
    createdAt: r.createdAt,
    editedAt: r.editedAt,
    sellerReply: r.sellerReply,
    sellerRepliedAt: r.sellerRepliedAt,
    hidden: Boolean(r.hiddenAt),
    hiddenReason: r.hiddenReason,
    autoHidden: Boolean(r.reportHiddenAt),
    isOwner: Boolean(r.ownSource),
    purchased: r.ownSource === "purchase",
    author: { id: r.authorId, username: r.username, displayName: r.displayName, avatarKey: r.avatarKey },
  }));
  return { items, total: total?.n ?? 0, page, pageSize };
}

export async function getMyReview(productId: string, userId: string) {
  const [r] = await db
    .select()
    .from(productReviews)
    .where(and(eq(productReviews.productId, productId), eq(productReviews.userId, userId)))
    .limit(1);
  return r ?? null;
}

async function loadProduct(productId: string) {
  const [p] = await db
    .select({ id: products.id, title: products.title, slug: products.slug, sellerId: products.sellerId, status: products.status })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!p) throw new ContentError("Produk tidak ditemukan.");
  return p;
}

/** Tulis / ubah ulasan (satu per orang per produk). Seller dapat notifikasi hanya untuk ulasan baru. */
export async function saveReview(user: CurrentUser, productId: string, input: { rating: number; body: string }) {
  const rl = rateLimit(`review:write:${user.id}`, 12, 60 * 60_000);
  if (!rl.ok) throw new ContentError("Terlalu sering mengubah ulasan. Coba lagi nanti.");
  const product = await loadProduct(productId);
  const elig = await reviewEligibility(user, product);
  if (!elig.ok) {
    throw new ContentError(
      elig.reason === "seller"
        ? "Seller tidak bisa mengulas karyanya sendiri."
        : elig.reason === "not_owner"
          ? "Hanya yang sudah mengunduh / membeli yang bisa memberi ulasan."
          : "Produk ini belum bisa diulas.",
    );
  }
  const rating = Math.round(Number(input.rating));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ContentError("Pilih rating 1–5 bintang.", "rating");
  const body = cleanText(input.body ?? "");
  if (body.length > REVIEW_LIMITS.bodyMax) throw new ContentError(`Ulasan maksimal ${REVIEW_LIMITS.bodyMax} karakter.`, "body");
  if (rating <= 2 && body.length < REVIEW_LIMITS.lowRatingMinBody) {
    throw new ContentError("Rating 1–2 bintang wajib disertai alasan (min. 15 karakter) supaya seller tahu apa yang perlu diperbaiki.", "body");
  }
  if (body) await guardContent(user, body, { context: "review", field: "body", allowLinks: false });

  const [latest] = await db
    .select({ version: releases.version })
    .from(releases)
    .where(and(eq(releases.productId, productId), eq(releases.status, "published")))
    .orderBy(desc(releases.publishedAt))
    .limit(1);

  const existing = await getMyReview(productId, user.id);
  if (existing) {
    const changed = existing.rating !== rating || existing.body !== body;
    if (changed) {
      await db
        .update(productReviews)
        .set({ rating, body, version: latest?.version ?? existing.version, updatedAt: new Date(), editedAt: new Date() })
        .where(eq(productReviews.id, existing.id));
    }
    return { created: false, id: existing.id, slug: product.slug };
  }

  const [row] = await db
    .insert(productReviews)
    .values({ productId, userId: user.id, rating, body, version: latest?.version ?? null })
    .onConflictDoNothing()
    .returning({ id: productReviews.id });
  if (!row) return { created: false, id: (await getMyReview(productId, user.id))!.id, slug: product.slug };

  await notifyAndEmail({
    userId: product.sellerId,
    type: "review_new",
    actorId: user.id,
    url: `/p/${product.slug}/ulasan#ulasan-${row.id}`,
    data: { productTitle: product.title, rating, snippet: body ? plainSnippet(body, 140) : null },
    groupKey: `review_new:${product.id}`,
  });
  return { created: true, id: row.id, slug: product.slug };
}

export async function deleteReview(user: CurrentUser, productId: string) {
  const r = await getMyReview(productId, user.id);
  if (!r) return null;
  await db.delete(productReviews).where(eq(productReviews.id, r.id));
  const [p] = await db.select({ slug: products.slug }).from(products).where(eq(products.id, productId));
  return p?.slug ?? null;
}

/** Balasan seller (satu per ulasan, bisa diubah). Penulis ulasan dapat notifikasi. */
export async function replyToReview(seller: CurrentUser, reviewId: string, text: string) {
  const rl = rateLimit(`review:reply:${seller.id}`, 30, 60 * 60_000);
  if (!rl.ok) throw new ContentError("Terlalu banyak balasan dalam 1 jam. Coba lagi nanti.");
  const [row] = await db
    .select({ review: productReviews, sellerId: products.sellerId, productTitle: products.title, slug: products.slug })
    .from(productReviews)
    .innerJoin(products, eq(products.id, productReviews.productId))
    .where(eq(productReviews.id, reviewId))
    .limit(1);
  if (!row) throw new ContentError("Ulasan tidak ditemukan.");
  if (row.sellerId !== seller.id) throw new ContentError("Hanya seller produk ini yang bisa membalas ulasan.");
  const reply = cleanText(text ?? "");
  if (reply.length < 2) throw new ContentError("Balasan masih kosong.", "reply");
  if (reply.length > REVIEW_LIMITS.replyMax) throw new ContentError(`Balasan maksimal ${REVIEW_LIMITS.replyMax} karakter.`, "reply");
  await guardContent(seller, reply, { context: "review_reply", field: "reply", allowLinks: true, maxLinks: 2 });
  const isNew = !row.review.sellerReply;
  await db.update(productReviews).set({ sellerReply: reply, sellerRepliedAt: new Date() }).where(eq(productReviews.id, reviewId));
  if (isNew || row.review.sellerReply !== reply) {
    await notifyAndEmail({
      userId: row.review.userId,
      type: "review_reply",
      actorId: seller.id,
      url: `/p/${row.slug}/ulasan#ulasan-${reviewId}`,
      data: { productTitle: row.productTitle, snippet: plainSnippet(reply, 140) },
      groupKey: `review_reply:${reviewId}`,
    });
  }
  return { slug: row.slug };
}

export async function deleteReviewReply(seller: CurrentUser, reviewId: string) {
  const [row] = await db
    .select({ sellerId: products.sellerId, slug: products.slug })
    .from(productReviews)
    .innerJoin(products, eq(products.id, productReviews.productId))
    .where(eq(productReviews.id, reviewId))
    .limit(1);
  if (!row || row.sellerId !== seller.id) return null;
  await db.update(productReviews).set({ sellerReply: null, sellerRepliedAt: null }).where(eq(productReviews.id, reviewId));
  return row.slug;
}
