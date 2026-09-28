import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { forumReplies, forumThreads, moderationActions, productReviews, products, reports, users } from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security/events";
import { ContentError, type ContentActor } from "./guard";
import { AUTO_HIDE_TARGETS, FORUM_LIMITS, REASONS_BY_TARGET, replyPath, threadPath, type ContentReportReason, type ContentTargetType } from "./shared";

export type ContentSnapshot = {
  title?: string | null;
  body: string;
  rating?: number | null;
  authorId: string;
  authorName?: string | null;
  authorUsername?: string | null;
  context?: string | null;
  url: string;
  postedAt?: string;
};

type TargetState = {
  authorId: string;
  deletedAt: Date | null;
  hiddenAt: Date | null;
  reportHiddenAt: Date | null;
  snapshot: Omit<ContentSnapshot, "authorName" | "authorUsername">;
};

/** Ambil isi & status konten yang dilaporkan / dimoderasi. */
export async function loadTarget(type: ContentTargetType, id: string): Promise<TargetState | null> {
  if (type === "forum_thread") {
    const [t] = await db.select().from(forumThreads).where(eq(forumThreads.id, id)).limit(1);
    if (!t) return null;
    return {
      authorId: t.authorId,
      deletedAt: t.deletedAt,
      hiddenAt: t.hiddenAt,
      reportHiddenAt: t.reportHiddenAt,
      snapshot: { title: t.title, body: t.body, authorId: t.authorId, url: threadPath(t.id), postedAt: t.createdAt.toISOString() },
    };
  }
  if (type === "forum_reply") {
    const [r] = await db
      .select({ reply: forumReplies, threadTitle: forumThreads.title })
      .from(forumReplies)
      .innerJoin(forumThreads, eq(forumThreads.id, forumReplies.threadId))
      .where(eq(forumReplies.id, id))
      .limit(1);
    if (!r) return null;
    return {
      authorId: r.reply.authorId,
      deletedAt: r.reply.deletedAt,
      hiddenAt: r.reply.hiddenAt,
      reportHiddenAt: r.reply.reportHiddenAt,
      snapshot: {
        body: r.reply.body,
        authorId: r.reply.authorId,
        context: r.threadTitle,
        url: replyPath(r.reply.threadId, r.reply.id),
        postedAt: r.reply.createdAt.toISOString(),
      },
    };
  }
  if (type === "product") {
    const [p] = await db
      .select({ id: products.id, title: products.title, summary: products.summary, slug: products.slug, sellerId: products.sellerId, status: products.status, createdAt: products.createdAt })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);
    if (!p) return null;
    return {
      authorId: p.sellerId,
      deletedAt: null,
      hiddenAt: p.status === "suspended" ? new Date() : null,
      reportHiddenAt: null,
      snapshot: { title: p.title, body: p.summary, authorId: p.sellerId, context: "Produk", url: `/p/${p.slug}`, postedAt: p.createdAt.toISOString() },
    };
  }
  if (type === "user") {
    const [u] = await db
      .select({ id: users.id, username: users.username, displayName: users.displayName, bio: users.bio, bannedAt: users.bannedAt, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!u) return null;
    return {
      authorId: u.id,
      deletedAt: null,
      hiddenAt: u.bannedAt,
      reportHiddenAt: null,
      snapshot: { title: u.displayName, body: u.bio ?? "", authorId: u.id, context: "Profil", url: `/@${u.username}`, postedAt: u.createdAt.toISOString() },
    };
  }
  const [v] = await db
    .select({ review: productReviews, productTitle: products.title, productSlug: products.slug })
    .from(productReviews)
    .innerJoin(products, eq(products.id, productReviews.productId))
    .where(eq(productReviews.id, id))
    .limit(1);
  if (!v) return null;
  return {
    authorId: v.review.userId,
    deletedAt: null,
    hiddenAt: v.review.hiddenAt,
    reportHiddenAt: v.review.reportHiddenAt,
    snapshot: {
      body: v.review.body,
      rating: v.review.rating,
      authorId: v.review.userId,
      context: v.productTitle,
      url: `/p/${v.productSlug}/ulasan#ulasan-${v.review.id}`,
      postedAt: v.review.createdAt.toISOString(),
    },
  };
}

async function setReportHidden(type: ContentTargetType, id: string, hidden: boolean) {
  if (!AUTO_HIDE_TARGETS.includes(type)) return;
  const value = hidden ? new Date() : null;
  if (type === "forum_thread") await db.update(forumThreads).set({ reportHiddenAt: value }).where(eq(forumThreads.id, id));
  else if (type === "forum_reply") await db.update(forumReplies).set({ reportHiddenAt: value }).where(eq(forumReplies.id, id));
  else await db.update(productReviews).set({ reportHiddenAt: value }).where(eq(productReviews.id, id));
}

async function setModHidden(type: ContentTargetType, id: string, by: string | null, reason: string | null) {
  if (!AUTO_HIDE_TARGETS.includes(type)) return;
  const values = by
    ? { hiddenAt: new Date(), hiddenBy: by, hiddenReason: reason }
    : { hiddenAt: null, hiddenBy: null, hiddenReason: null, reportHiddenAt: null };
  if (type === "forum_thread") await db.update(forumThreads).set(values).where(eq(forumThreads.id, id));
  else if (type === "forum_reply") await db.update(forumReplies).set(values).where(eq(forumReplies.id, id));
  else await db.update(productReviews).set(values).where(eq(productReviews.id, id));
}

/**
 * Lapor konten. Satu laporan per orang per konten; disembunyikan otomatis kalau dilaporkan
 * FORUM_LIMITS.reportHideThreshold orang berbeda (menunggu keputusan moderator).
 */
export async function reportContent(actor: ContentActor, type: ContentTargetType, id: string, reason: ContentReportReason, note?: string) {
  const rl = rateLimit(`content:report:${actor.id}`, 10, 60 * 60_000);
  if (!rl.ok) throw new ContentError("Kamu sudah banyak melapor dalam 1 jam terakhir. Coba lagi nanti.");
  if (!REASONS_BY_TARGET[type].includes(reason)) throw new ContentError("Alasan laporan tidak cocok untuk konten ini.");
  const target = await loadTarget(type, id);
  if (!target || target.deletedAt) throw new ContentError("Konten ini sudah tidak tersedia.");
  if (target.authorId === actor.id) {
    throw new ContentError(type === "user" ? "Tidak bisa melaporkan akun sendiri." : type === "product" ? "Tidak bisa melaporkan karya sendiri." : "Tidak bisa melaporkan postingan sendiri.");
  }

  const [author] = await db.select({ name: users.displayName, username: users.username }).from(users).where(eq(users.id, target.authorId));
  const inserted = await db
    .insert(reports)
    .values({
      reporterId: actor.id,
      targetType: type,
      targetId: id,
      reason,
      note: note?.trim().slice(0, 500) || null,
      snapshot: { ...target.snapshot, authorName: author?.name ?? null, authorUsername: author?.username ?? null },
    })
    .onConflictDoNothing()
    .returning({ id: reports.id });
  if (!inserted.length) return { already: true, hidden: Boolean(target.reportHiddenAt || target.hiddenAt) };
  await logSecurityEvent("content_report", { userId: actor.id, meta: { type, id, reason } });

  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(distinct ${reports.reporterId})::int` })
    .from(reports)
    .where(and(eq(reports.targetType, type), eq(reports.targetId, id), eq(reports.status, "open")));
  let hidden = Boolean(target.reportHiddenAt || target.hiddenAt);
  if (!hidden && AUTO_HIDE_TARGETS.includes(type) && n >= FORUM_LIMITS.reportHideThreshold) {
    await setReportHidden(type, id, true);
    await logSecurityEvent("content_auto_hidden", { userId: target.authorId, meta: { type, id, reports: n } });
    hidden = true;
  }
  return { already: false, hidden };
}

async function resolveReports(type: ContentTargetType, id: string, staffId: string, status: "resolved" | "dismissed", resolution: string) {
  await db
    .update(reports)
    .set({ status, resolvedBy: staffId, resolvedAt: new Date(), resolution })
    .where(and(eq(reports.targetType, type), eq(reports.targetId, id), eq(reports.status, "open")));
}

/** Moderator menyembunyikan konten (tetap tersimpan untuk audit, penulis melihat alasannya). */
export async function hideContent(staffId: string, type: ContentTargetType, id: string, reason: string) {
  const r = reason.trim().slice(0, 300) || "Melanggar aturan komunitas";
  await setModHidden(type, id, staffId, r);
  await resolveReports(type, id, staffId, "resolved", "hidden");
  await db.insert(moderationActions).values({ moderatorId: staffId, targetType: type, targetId: id, action: "hide", note: r });
  await logSecurityEvent("admin_hide_content", { userId: staffId, meta: { type, id, reason: r } });
}

/** Pulihkan konten (hapus status tersembunyi, termasuk yang otomatis karena laporan). */
export async function restoreContent(staffId: string, type: ContentTargetType, id: string) {
  await setModHidden(type, id, null, null);
  await resolveReports(type, id, staffId, "dismissed", "restored");
  await db.insert(moderationActions).values({ moderatorId: staffId, targetType: type, targetId: id, action: "restore" });
  await logSecurityEvent("admin_restore_content", { userId: staffId, meta: { type, id } });
}

/** Laporan tidak terbukti: tolak semua laporan terbuka & tampilkan lagi kalau tadi disembunyikan otomatis. */
export async function dismissContentReports(staffId: string, type: ContentTargetType, id: string) {
  const target = await loadTarget(type, id);
  if (target?.reportHiddenAt) await setReportHidden(type, id, false);
  await resolveReports(type, id, staffId, "dismissed", "dismissed");
  await db.insert(moderationActions).values({ moderatorId: staffId, targetType: type, targetId: id, action: "dismiss_reports" });
  await logSecurityEvent("admin_dismiss_report", { userId: staffId, meta: { type, id } });
}

export type ContentReportGroup = {
  targetType: ContentTargetType;
  targetId: string;
  n: number;
  reasons: string[];
  lastAt: Date;
  snapshot: ContentSnapshot;
  items: { reporter: string; reason: string; note: string | null; at: string }[];
  state: { deleted: boolean; hidden: boolean; autoHidden: boolean; authorBanned: boolean; authorRole: string; authorCreatedAt: Date | null } | null;
};

/** Antrean laporan forum & ulasan untuk halaman moderator (dikelompokkan per konten). */
export async function listContentReportGroups(limit = 50): Promise<ContentReportGroup[]> {
  const groups = await db.execute<{
    target_type: ContentTargetType;
    target_id: string;
    n: number;
    reasons: string[];
    last_at: Date;
    snapshot: ContentSnapshot;
    items: { reporter: string; reason: string; note: string | null; at: string }[];
  }>(sql`
    select r.target_type, r.target_id, count(*)::int as n, array_agg(distinct r.reason) as reasons, max(r.created_at) as last_at,
      (array_agg(r.snapshot order by r.created_at))[1] as snapshot,
      json_agg(json_build_object('reporter', u.username, 'reason', r.reason, 'note', r.note, 'at', r.created_at) order by r.created_at) as items
    from ${reports} r join ${users} u on u.id = r.reporter_id
    where r.status = 'open' and r.target_type in ('forum_thread', 'forum_reply', 'review', 'product', 'user')
    group by r.target_type, r.target_id
    order by count(*) desc, max(r.created_at) desc
    limit ${limit}
  `);
  const authorIds = [...new Set(groups.map((g) => g.snapshot?.authorId).filter(Boolean))] as string[];
  const authors = authorIds.length
    ? await db.select({ id: users.id, bannedAt: users.bannedAt, role: users.role, createdAt: users.createdAt }).from(users).where(inArray(users.id, authorIds))
    : [];
  const byAuthor = new Map(authors.map((a) => [a.id, a]));
  const out: ContentReportGroup[] = [];
  for (const g of groups) {
    const t = await loadTarget(g.target_type, g.target_id);
    const a = byAuthor.get(g.snapshot?.authorId);
    out.push({
      targetType: g.target_type,
      targetId: g.target_id,
      n: g.n,
      reasons: g.reasons,
      lastAt: new Date(g.last_at),
      snapshot: g.snapshot,
      items: g.items,
      state: t
        ? {
            deleted: Boolean(t.deletedAt),
            hidden: Boolean(t.hiddenAt),
            autoHidden: Boolean(t.reportHiddenAt),
            authorBanned: Boolean(a?.bannedAt),
            authorRole: a?.role ?? "user",
            authorCreatedAt: a?.createdAt ?? null,
          }
        : null,
    });
  }
  return out;
}

export async function countOpenContentReports() {
  const [r] = await db
    .select({ n: sql<number>`count(distinct (${reports.targetType}, ${reports.targetId}))::int` })
    .from(reports)
    .where(and(eq(reports.status, "open"), inArray(reports.targetType, ["forum_thread", "forum_reply", "review", "product", "user"])));
  return r?.n ?? 0;
}

/** Moderator menangguhkan produk yang dilaporkan: hilang dari katalog & tidak bisa diunduh, seller melihat alasannya. */
export async function suspendReportedProduct(staffId: string, productId: string, reason: string) {
  const r = reason.trim().slice(0, 300) || "Melanggar aturan konten (dari laporan anggota)";
  await db.update(products).set({ status: "suspended", rejectionReason: r, isFeatured: false }).where(eq(products.id, productId));
  await resolveReports("product", productId, staffId, "resolved", "suspended");
  await db.insert(moderationActions).values({ moderatorId: staffId, targetType: "product", targetId: productId, action: "suspend", note: r });
  await logSecurityEvent("admin_hide_content", { userId: staffId, meta: { type: "product", id: productId, reason: r } });
}
