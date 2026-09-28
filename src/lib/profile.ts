import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { plainSnippet } from "@/lib/community/shared";
import { db } from "@/lib/db";
import { forumReplies, forumThreads, productReviews, products } from "@/lib/db/schema";
import { listThreads } from "@/lib/forum";

export type MemberStats = { threads: number; replies: number; accepted: number; reviews: number; upvotes: number };

/** Statistik komunitas publik (hanya konten yang tampil). */
export async function getMemberStats(userId: string): Promise<MemberStats> {
  const [row] = await db.execute<MemberStats>(sql`
    select
      (select count(*)::int from forum_threads t
        where t.author_id = ${userId} and t.deleted_at is null and t.hidden_at is null and t.report_hidden_at is null) as threads,
      (select count(*)::int from forum_replies r join forum_threads t on t.id = r.thread_id
        where r.author_id = ${userId} and r.deleted_at is null and r.hidden_at is null and r.report_hidden_at is null
          and t.deleted_at is null and t.hidden_at is null and t.report_hidden_at is null) as replies,
      (select count(*)::int from forum_threads t join forum_replies r on r.id = t.accepted_reply_id
        where r.author_id = ${userId} and t.deleted_at is null and t.hidden_at is null and t.report_hidden_at is null) as accepted,
      (select count(*)::int from product_reviews v
        where v.user_id = ${userId} and v.hidden_at is null and v.report_hidden_at is null) as reviews,
      ((select coalesce(sum(t.score), 0) from forum_threads t where t.author_id = ${userId} and t.deleted_at is null and t.hidden_at is null)
        + (select coalesce(sum(r.score), 0) from forum_replies r where r.author_id = ${userId} and r.deleted_at is null and r.hidden_at is null))::int as upvotes
  `);
  return row ?? { threads: 0, replies: 0, accepted: 0, reviews: 0, upvotes: 0 };
}

/** Lencana dasar yang dihitung dari aktivitas (tidak disimpan — selalu sesuai data terbaru). */
export function memberBadges(p: { role: string; isSeller: boolean; isTrusted: boolean; stats: MemberStats }) {
  const out: { id: string; label: string; tone: "brand" | "blue" | "green" | "amber" | "slate" }[] = [];
  if (p.role === "admin") out.push({ id: "tim", label: "Tim Rilisin", tone: "brand" });
  if (p.role === "moderator") out.push({ id: "mod", label: "Moderator", tone: "blue" });
  if (p.isSeller) out.push({ id: "seller", label: p.isTrusted ? "Seller terpercaya" : "Seller", tone: p.isTrusted ? "green" : "slate" });
  if (p.stats.accepted >= 3) out.push({ id: "penjawab", label: "Penjawab andal", tone: "amber" });
  if (p.stats.threads + p.stats.replies >= 10) out.push({ id: "aktif", label: "Aktif di forum", tone: "slate" });
  return out;
}

export async function getMemberActivity(userId: string) {
  const threadVisible = and(isNull(forumThreads.deletedAt), isNull(forumThreads.hiddenAt), isNull(forumThreads.reportHiddenAt));
  const [threads, replies, reviews] = await Promise.all([
    listThreads({ authorId: userId, sort: "baru", pageSize: 5 }),
    db
      .select({ id: forumReplies.id, body: forumReplies.body, createdAt: forumReplies.createdAt, threadId: forumThreads.id, threadTitle: forumThreads.title })
      .from(forumReplies)
      .innerJoin(forumThreads, eq(forumThreads.id, forumReplies.threadId))
      .where(
        and(
          eq(forumReplies.authorId, userId),
          isNull(forumReplies.deletedAt),
          isNull(forumReplies.hiddenAt),
          isNull(forumReplies.reportHiddenAt),
          threadVisible,
        ),
      )
      .orderBy(desc(forumReplies.createdAt))
      .limit(5),
    db
      .select({
        id: productReviews.id,
        rating: productReviews.rating,
        body: productReviews.body,
        createdAt: productReviews.createdAt,
        productTitle: products.title,
        productSlug: products.slug,
      })
      .from(productReviews)
      .innerJoin(products, eq(products.id, productReviews.productId))
      .where(and(eq(productReviews.userId, userId), isNull(productReviews.hiddenAt), isNull(productReviews.reportHiddenAt), eq(products.status, "published")))
      .orderBy(desc(productReviews.createdAt))
      .limit(5),
  ]);
  return {
    threads: threads.items,
    replies: replies.map((r) => ({ ...r, snippet: plainSnippet(r.body, 140) })),
    reviews,
  };
}
