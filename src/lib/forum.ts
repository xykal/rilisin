import "server-only";
import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { isStaff, type CurrentUser } from "@/lib/auth/current-user";
import { getActiveMute } from "@/lib/chat/server";
import { cleanText, ContentError, guardContent, sameText } from "@/lib/community/guard";
import {
  extractMentions,
  FORUM_LIMITS,
  plainSnippet,
  replyPath,
  threadPath,
  type ForumCategoryKind,
  type ForumSort,
} from "@/lib/community/shared";
import { db } from "@/lib/db";
import { entitlements, forumCategories, forumReplies, forumThreads, forumVotes, moderationActions, products, users } from "@/lib/db/schema";
import { announceDevlog } from "@/lib/follows";
import { notifyAndEmail, type NotifyInput } from "@/lib/notifications/server";
import { rateLimit, sharedLimit } from "@/lib/rate-limit";

type Viewer = Pick<CurrentUser, "id" | "role"> | null;

const threadVisible = and(isNull(forumThreads.deletedAt), isNull(forumThreads.hiddenAt), isNull(forumThreads.reportHiddenAt))!;

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

// ─── Kategori ───────────────────────────────────────────────────────────────
export async function getForumCategories() {
  return db
    .select({
      id: forumCategories.id,
      slug: forumCategories.slug,
      name: forumCategories.name,
      emoji: forumCategories.emoji,
      description: forumCategories.description,
      kind: forumCategories.kind,
      // Nama tabel ditulis eksplisit: di query satu tabel Drizzle merender ${forumCategories.id} sebagai "id" saja,
      // yang di dalam subquery malah menunjuk ke kolom id milik forum_threads (hasilnya selalu 0).
      threads: sql<number>`(select count(*)::int from forum_threads t where t.category_id = "forum_categories"."id"
        and t.deleted_at is null and t.hidden_at is null and t.report_hidden_at is null)`,
      lastActivityAt: sql<Date | null>`(select max(t.last_activity_at) from forum_threads t where t.category_id = "forum_categories"."id"
        and t.deleted_at is null and t.hidden_at is null and t.report_hidden_at is null)`.mapWith((v) => (v ? new Date(v) : null)),
    })
    .from(forumCategories)
    .orderBy(asc(forumCategories.sort), asc(forumCategories.name));
}

export async function getCategoryBySlug(slug: string) {
  const [c] = await db.select().from(forumCategories).where(eq(forumCategories.slug, slug)).limit(1);
  return c ?? null;
}

// ─── Daftar thread ──────────────────────────────────────────────────────────
export type ThreadListItem = {
  id: string;
  title: string;
  snippet: string;
  category: { slug: string; name: string; emoji: string; kind: ForumCategoryKind };
  author: { username: string; displayName: string; avatarKey: string | null };
  replyCount: number;
  score: number;
  lastActivityAt: Date;
  createdAt: Date;
  pinned: boolean;
  locked: boolean;
  answered: boolean;
  product: { slug: string; title: string } | null;
  lastReplyBy: string | null;
};

export async function listThreads(opts: {
  categoryId?: string | null;
  excludeCategoryId?: string | null;
  authorId?: string | null;
  productId?: string | null;
  q?: string | null;
  sort?: ForumSort;
  page?: number;
  pageSize?: number;
}) {
  const pageSize = opts.pageSize ?? FORUM_LIMITS.threadsPageSize;
  const page = Math.max(1, Math.min(opts.page ?? 1, 500));
  const where: SQL[] = [threadVisible];
  if (opts.categoryId) where.push(eq(forumThreads.categoryId, opts.categoryId));
  if (opts.excludeCategoryId) where.push(sql`${forumThreads.categoryId} <> ${opts.excludeCategoryId}`);
  if (opts.authorId) where.push(eq(forumThreads.authorId, opts.authorId));
  if (opts.productId) where.push(eq(forumThreads.productId, opts.productId));
  const q = opts.q?.trim().slice(0, 100);
  if (q) {
    where.push(
      or(
        sql`to_tsvector('simple', ${forumThreads.title} || ' ' || ${forumThreads.body}) @@ websearch_to_tsquery('simple', ${q})`,
        ilike(forumThreads.title, `%${escapeLike(q)}%`),
      )!,
    );
  }
  if (opts.sort === "belum-terjawab") {
    where.push(sql`(${forumThreads.replyCount} = 0 or (${forumCategories.kind} = 'qa' and ${forumThreads.acceptedReplyId} is null))`);
    where.push(sql`${forumCategories.kind} <> 'announcement'`);
  }
  const lastBy = alias(users, "last_by");
  const pinnedFirst = sql`(${forumThreads.pinnedAt} is not null) desc`;
  const orderBy =
    opts.sort === "baru"
      ? [desc(forumThreads.createdAt)]
      : opts.sort === "teratas"
        ? [desc(forumThreads.score), desc(forumThreads.replyCount), desc(forumThreads.createdAt)]
        : opts.sort === "belum-terjawab"
          ? [desc(forumThreads.createdAt)]
          : [pinnedFirst, desc(forumThreads.lastActivityAt)];

  const base = db
    .select({
      id: forumThreads.id,
      title: forumThreads.title,
      body: forumThreads.body,
      replyCount: forumThreads.replyCount,
      score: forumThreads.score,
      lastActivityAt: forumThreads.lastActivityAt,
      createdAt: forumThreads.createdAt,
      pinnedAt: forumThreads.pinnedAt,
      lockedAt: forumThreads.lockedAt,
      acceptedReplyId: forumThreads.acceptedReplyId,
      catSlug: forumCategories.slug,
      catName: forumCategories.name,
      catEmoji: forumCategories.emoji,
      catKind: forumCategories.kind,
      authorUsername: users.username,
      authorName: users.displayName,
      authorAvatar: users.avatarKey,
      productSlug: products.slug,
      productTitle: products.title,
      productStatus: products.status,
      lastByName: lastBy.displayName,
    })
    .from(forumThreads)
    .innerJoin(forumCategories, eq(forumCategories.id, forumThreads.categoryId))
    .innerJoin(users, eq(users.id, forumThreads.authorId))
    .leftJoin(products, eq(products.id, forumThreads.productId))
    .leftJoin(lastBy, eq(lastBy.id, forumThreads.lastReplyBy));

  const [rows, [total]] = await Promise.all([
    base
      .where(and(...where))
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ n: count() })
      .from(forumThreads)
      .innerJoin(forumCategories, eq(forumCategories.id, forumThreads.categoryId))
      .where(and(...where)),
  ]);

  const items: ThreadListItem[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    snippet: plainSnippet(r.body, 160),
    category: { slug: r.catSlug, name: r.catName, emoji: r.catEmoji, kind: r.catKind },
    author: { username: r.authorUsername, displayName: r.authorName, avatarKey: r.authorAvatar },
    replyCount: r.replyCount,
    score: r.score,
    lastActivityAt: r.lastActivityAt,
    createdAt: r.createdAt,
    pinned: Boolean(r.pinnedAt),
    locked: Boolean(r.lockedAt),
    answered: Boolean(r.acceptedReplyId),
    product: r.productSlug && r.productStatus === "published" ? { slug: r.productSlug, title: r.productTitle! } : null,
    lastReplyBy: r.lastByName,
  }));
  return { items, total: total?.n ?? 0, page, pageSize };
}

// ─── Halaman thread ─────────────────────────────────────────────────────────
export async function getThread(id: string, viewer: Viewer) {
  const [row] = await db
    .select({
      thread: forumThreads,
      category: forumCategories,
      author: { id: users.id, username: users.username, displayName: users.displayName, avatarKey: users.avatarKey, role: users.role, bannedAt: users.bannedAt },
      product: { id: products.id, slug: products.slug, title: products.title, sellerId: products.sellerId, status: products.status, iconKey: products.iconKey },
    })
    .from(forumThreads)
    .innerJoin(forumCategories, eq(forumCategories.id, forumThreads.categoryId))
    .innerJoin(users, eq(users.id, forumThreads.authorId))
    .leftJoin(products, eq(products.id, forumThreads.productId))
    .where(eq(forumThreads.id, id))
    .limit(1);
  if (!row) return null;
  const t = row.thread;
  const staff = isStaff(viewer);
  const isAuthor = viewer?.id === t.authorId;
  if (t.deletedAt && !staff) return null;
  if ((t.hiddenAt || t.reportHiddenAt) && !staff && !isAuthor) return null;
  return {
    ...row,
    product: row.product?.id ? row.product : null,
    state: t.deletedAt ? ("deleted" as const) : t.hiddenAt ? ("hidden" as const) : t.reportHiddenAt ? ("auto_hidden" as const) : ("visible" as const),
    canEdit: !t.deletedAt && (staff || (isAuthor && !t.lockedAt)),
    canReply: Boolean(viewer) && !t.deletedAt && !t.hiddenAt && !t.reportHiddenAt && (!t.lockedAt || staff),
    canAccept: row.category.kind === "qa" && Boolean(viewer) && (staff || isAuthor),
  };
}
export type ThreadView = NonNullable<Awaited<ReturnType<typeof getThread>>>;

export type ReplyDTO = {
  id: string;
  body: string | null;
  state: "visible" | "hidden" | "auto_hidden" | "deleted";
  hiddenReason: string | null;
  score: number;
  createdAt: Date;
  editedAt: Date | null;
  author: { id: string; username: string; displayName: string; avatarKey: string | null; role: string };
  /** Kutipan balasan induk (null kalau tidak mengutip / induk tak terlihat oleh viewer). */
  quoted: { id: string; authorName: string; snippet: string } | null;
};

export async function listReplies(threadId: string, opts: { viewer: Viewer; page?: number; pageSize?: number }) {
  const pageSize = opts.pageSize ?? FORUM_LIMITS.repliesPageSize;
  const [total] = await db.select({ n: count() }).from(forumReplies).where(eq(forumReplies.threadId, threadId));
  const pages = Math.max(1, Math.ceil((total?.n ?? 0) / pageSize));
  const page = Math.max(1, Math.min(opts.page ?? 1, pages));
  const rows = await db
    .select({
      reply: forumReplies,
      author: { id: users.id, username: users.username, displayName: users.displayName, avatarKey: users.avatarKey, role: users.role },
    })
    .from(forumReplies)
    .innerJoin(users, eq(users.id, forumReplies.authorId))
    .where(eq(forumReplies.threadId, threadId))
    .orderBy(asc(forumReplies.createdAt), asc(forumReplies.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const staff = isStaff(opts.viewer);
  const parentIds = [...new Set(rows.map(({ reply: r }) => r.parentId).filter((v): v is string => Boolean(v)))];
  const parentRows = parentIds.length
    ? await db
        .select({ reply: forumReplies, displayName: users.displayName })
        .from(forumReplies)
        .innerJoin(users, eq(users.id, forumReplies.authorId))
        .where(and(eq(forumReplies.threadId, threadId), inArray(forumReplies.id, parentIds)))
    : [];
  const parents = new Map(parentRows.map(({ reply: p, displayName }) => [p.id, { reply: p, displayName }]));
  const items: ReplyDTO[] = rows.map(({ reply: r, author }) => {
    const state = r.deletedAt ? "deleted" : r.hiddenAt ? "hidden" : r.reportHiddenAt ? "auto_hidden" : "visible";
    const canSee = state === "visible" || staff || (state !== "deleted" && opts.viewer?.id === r.authorId);
    const pq = r.parentId ? parents.get(r.parentId) : null;
    const pstate = pq ? (pq.reply.deletedAt ? "deleted" : pq.reply.hiddenAt ? "hidden" : pq.reply.reportHiddenAt ? "auto_hidden" : "visible") : null;
    const quoted =
      pq && (pstate === "visible" || staff || (pstate !== "deleted" && opts.viewer?.id === pq.reply.authorId))
        ? { id: pq.reply.id, authorName: pq.displayName, snippet: plainSnippet(pq.reply.body, 200) }
        : null;
    return {
      id: r.id,
      body: canSee ? r.body : null,
      state,
      hiddenReason: r.hiddenReason,
      score: r.score,
      createdAt: r.createdAt,
      editedAt: r.editedAt,
      author,
      quoted,
    };
  });
  return { items, total: total?.n ?? 0, page, pages, pageSize };
}

/** Target kutipan buat composer (?kutip=): null kalau tak ada / tak terlihat oleh viewer. */
export async function getQuoteTarget(threadId: string, replyId: string, viewer: Viewer) {
  const [row] = await db
    .select({ reply: forumReplies, displayName: users.displayName })
    .from(forumReplies)
    .innerJoin(users, eq(users.id, forumReplies.authorId))
    .where(and(eq(forumReplies.id, replyId), eq(forumReplies.threadId, threadId)))
    .limit(1);
  if (!row) return null;
  const r = row.reply;
  const state = r.deletedAt ? "deleted" : r.hiddenAt ? "hidden" : r.reportHiddenAt ? "auto_hidden" : "visible";
  const canSee = state === "visible" || isStaff(viewer) || (state !== "deleted" && viewer?.id === r.authorId);
  if (!canSee) return null;
  return { id: r.id, authorName: row.displayName, snippet: plainSnippet(r.body, 200) };
}

/** Halaman tempat balasan tertentu berada (dipakai link notifikasi ?balasan=). */
export async function replyPageOf(threadId: string, replyId: string) {
  const [r] = await db
    .select({ createdAt: forumReplies.createdAt, id: forumReplies.id })
    .from(forumReplies)
    .where(and(eq(forumReplies.id, replyId), eq(forumReplies.threadId, threadId)))
    .limit(1);
  if (!r) return 1;
  const [before] = await db
    .select({ n: count() })
    .from(forumReplies)
    .where(
      and(
        eq(forumReplies.threadId, threadId),
        or(lt(forumReplies.createdAt, r.createdAt), and(eq(forumReplies.createdAt, r.createdAt), lt(forumReplies.id, r.id))),
      ),
    );
  return Math.floor((before?.n ?? 0) / FORUM_LIMITS.repliesPageSize) + 1;
}

export async function getAcceptedReply(threadId: string, replyId: string | null) {
  if (!replyId) return null;
  const [row] = await db
    .select({
      reply: forumReplies,
      author: { id: users.id, username: users.username, displayName: users.displayName, avatarKey: users.avatarKey, role: users.role },
    })
    .from(forumReplies)
    .innerJoin(users, eq(users.id, forumReplies.authorId))
    .where(and(eq(forumReplies.id, replyId), eq(forumReplies.threadId, threadId), isNull(forumReplies.deletedAt), isNull(forumReplies.hiddenAt), isNull(forumReplies.reportHiddenAt)))
    .limit(1);
  return row ?? null;
}

/** Postingan mana saja yang sudah di-upvote viewer. Kunci: "thread:<id>" / "reply:<id>". */
export async function viewerVotes(userId: string | null | undefined, threadId: string, replyIds: string[]) {
  if (!userId) return new Set<string>();
  const rows = await db
    .select({ type: forumVotes.targetType, id: forumVotes.targetId })
    .from(forumVotes)
    .where(
      and(
        eq(forumVotes.userId, userId),
        or(
          and(eq(forumVotes.targetType, "thread"), eq(forumVotes.targetId, threadId)),
          replyIds.length ? and(eq(forumVotes.targetType, "reply"), inArray(forumVotes.targetId, replyIds)) : undefined,
        ),
      ),
    );
  return new Set(rows.map((r) => `${r.type}:${r.id}`));
}

/** Badge penulis di thread produk: "Pembuat" (seller produk) & "Pemilik" (sudah download/beli). */
export async function productBadges(product: { id: string; sellerId: string } | null, authorIds: string[]) {
  const out = new Map<string, "seller" | "owner">();
  if (!product || !authorIds.length) return out;
  const owners = await db
    .select({ userId: entitlements.userId })
    .from(entitlements)
    .where(and(eq(entitlements.productId, product.id), inArray(entitlements.userId, authorIds)));
  for (const o of owners) out.set(o.userId, "owner");
  out.set(product.sellerId, "seller");
  return out;
}

// ─── Aturan posting ─────────────────────────────────────────────────────────
async function assertCanPost(actor: CurrentUser) {
  const mute = await getActiveMute(actor.id, null);
  if (mute) {
    const until = new Date(mute.until).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
    throw new ContentError(`Kamu sedang dibisukan moderator sampai ${until} WIB.`);
  }
}

function cleanTitle(raw: string) {
  const title = cleanText(raw ?? "").replace(/\s+/g, " ");
  if (title.length < FORUM_LIMITS.titleMin) throw new ContentError(`Judul minimal ${FORUM_LIMITS.titleMin} karakter — jelaskan singkat masalah/topiknya.`, "title");
  if (title.length > FORUM_LIMITS.titleMax) throw new ContentError(`Judul maksimal ${FORUM_LIMITS.titleMax} karakter.`, "title");
  if (title === title.toUpperCase() && /[A-Z]{6,}/.test(title)) throw new ContentError("Judul jangan HURUF BESAR semua.", "title");
  return title;
}

function cleanBody(raw: string, min: number, max: number, field = "body") {
  const body = cleanText(raw ?? "");
  if (body.length < min) throw new ContentError(min > 5 ? `Isi minimal ${min} karakter.` : "Balasan masih kosong.", field);
  if (body.length > max) throw new ContentError(`Isi maksimal ${max.toLocaleString("id-ID")} karakter.`, field);
  return body;
}

async function mentionTargets(text: string, exclude: string[]) {
  const names = extractMentions(text);
  if (!names.length) return [];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(sql`lower(${users.username})`, names), isNull(users.bannedAt)));
  return rows.map((r) => r.id).filter((id) => !exclude.includes(id));
}

// ─── Thread ─────────────────────────────────────────────────────────────────
export async function createThread(actor: CurrentUser, input: { categoryId: string; title: string; body: string; productId?: string | null }) {
  await assertCanPost(actor);
  const staff = isStaff(actor);
  const [cat] = await db.select().from(forumCategories).where(eq(forumCategories.id, input.categoryId)).limit(1);
  if (!cat) throw new ContentError("Pilih kategori.", "categoryId");
  if (cat.kind === "announcement" && !staff) throw new ContentError("Hanya tim Rilisin yang bisa membuat thread di Pengumuman.", "categoryId");
  const title = cleanTitle(input.title);
  const body = cleanBody(input.body, FORUM_LIMITS.bodyMin, FORUM_LIMITS.bodyMax);
  await guardContent(actor, `${title}\n${body}`, { context: "forum_thread", field: "body", allowLinks: true, maxLinks: FORUM_LIMITS.maxLinks });

  let productId: string | null = null;
  let product: { id: string; title: string; sellerId: string } | null = null;
  if (input.productId) {
    const [p] = await db
      .select({ id: products.id, status: products.status, title: products.title, sellerId: products.sellerId })
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1);
    if (p?.status === "published") {
      productId = p.id;
      product = p;
    }
  }

  if (!staff) {
    const [[hour], [day]] = await Promise.all([
      db.select({ n: count() }).from(forumThreads).where(and(eq(forumThreads.authorId, actor.id), gt(forumThreads.createdAt, sql`now() - interval '1 hour'`))),
      db.select({ n: count() }).from(forumThreads).where(and(eq(forumThreads.authorId, actor.id), gt(forumThreads.createdAt, sql`now() - interval '1 day'`))),
    ]);
    if ((hour?.n ?? 0) >= FORUM_LIMITS.threadsPerHour || (day?.n ?? 0) >= FORUM_LIMITS.threadsPerDay) {
      throw new ContentError("Kamu sudah membuat banyak thread. Istirahat dulu ya, coba lagi nanti.");
    }
  }
  const recent = await db
    .select({ title: forumThreads.title })
    .from(forumThreads)
    .where(and(eq(forumThreads.authorId, actor.id), gt(forumThreads.createdAt, sql`now() - interval '1 day'`)))
    .limit(30);
  if (recent.some((r) => sameText(r.title, title))) throw new ContentError("Kamu sudah membuat thread dengan judul yang sama hari ini.", "title");

  const [row] = await db
    .insert(forumThreads)
    .values({ categoryId: cat.id, authorId: actor.id, productId, title, body })
    .returning({ id: forumThreads.id });
  const id = row!.id;

  // Devlog resmi (kategori devlog, ditulis seller produknya) → kabari pengikut produk
  if (cat.slug === "devlog" && product && product.sellerId === actor.id) {
    await announceDevlog({ id, title, body }, product, actor.id);
  }
  const targets = await mentionTargets(body, [actor.id]);
  if (targets.length) {
    await notifyAndEmail(
      targets.map((userId) => ({
        userId,
        type: "forum_mention" as const,
        actorId: actor.id,
        url: threadPath(id),
        data: { threadTitle: title, snippet: plainSnippet(body, 140) },
        groupKey: `forum_mention:${id}`,
      })),
    );
  }
  return { id };
}

async function loadThreadForWrite(id: string) {
  const [t] = await db
    .select({ thread: forumThreads, kind: forumCategories.kind })
    .from(forumThreads)
    .innerJoin(forumCategories, eq(forumCategories.id, forumThreads.categoryId))
    .where(eq(forumThreads.id, id))
    .limit(1);
  if (!t || t.thread.deletedAt) throw new ContentError("Thread tidak ditemukan.");
  return t;
}

export async function updateThread(actor: CurrentUser, id: string, input: { title: string; body: string }) {
  const { thread } = await loadThreadForWrite(id);
  const staff = isStaff(actor);
  if (thread.authorId !== actor.id && !staff) throw new ContentError("Kamu tidak bisa mengubah thread ini.");
  if (thread.lockedAt && !staff) throw new ContentError("Thread dikunci moderator — tidak bisa diubah.");
  const title = cleanTitle(input.title);
  const body = cleanBody(input.body, FORUM_LIMITS.bodyMin, FORUM_LIMITS.bodyMax);
  if (title === thread.title && body === thread.body) return { id };
  await guardContent(actor, `${title}\n${body}`, { context: "forum_thread", field: "body", allowLinks: true, maxLinks: FORUM_LIMITS.maxLinks });
  await db.update(forumThreads).set({ title, body, editedAt: new Date(), updatedAt: new Date() }).where(eq(forumThreads.id, id));
  return { id };
}

export async function deleteThread(actor: CurrentUser, id: string) {
  const { thread } = await loadThreadForWrite(id);
  if (thread.authorId !== actor.id && !isStaff(actor)) throw new ContentError("Kamu tidak bisa menghapus thread ini.");
  await db.update(forumThreads).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(forumThreads.id, id));
  if (thread.authorId !== actor.id) {
    await db.insert(moderationActions).values({ moderatorId: actor.id, targetType: "forum_thread", targetId: id, action: "delete" });
  }
}

export async function moderateThread(staff: CurrentUser, id: string, action: "pin" | "unpin" | "lock" | "unlock") {
  if (!isStaff(staff)) throw new ContentError("Khusus moderator.");
  await loadThreadForWrite(id);
  const now = new Date();
  const set =
    action === "pin" ? { pinnedAt: now } : action === "unpin" ? { pinnedAt: null } : action === "lock" ? { lockedAt: now } : { lockedAt: null };
  await db.update(forumThreads).set(set).where(eq(forumThreads.id, id));
  await db.insert(moderationActions).values({ moderatorId: staff.id, targetType: "forum_thread", targetId: id, action });
}

// ─── Balasan ────────────────────────────────────────────────────────────────
export async function createReply(actor: CurrentUser, threadId: string, rawBody: string, parentId?: string | null) {
  await assertCanPost(actor);
  const { thread } = await loadThreadForWrite(threadId);
  const staff = isStaff(actor);
  if (thread.hiddenAt || thread.reportHiddenAt) throw new ContentError("Thread ini sedang ditinjau moderator.");
  if (thread.lockedAt && !staff) throw new ContentError("Thread dikunci — tidak menerima balasan baru.");
  const body = cleanBody(rawBody, FORUM_LIMITS.replyMin, FORUM_LIMITS.replyMax);
  await guardContent(actor, body, { context: "forum_reply", field: "body", allowLinks: true, maxLinks: FORUM_LIMITS.maxLinks });

  const burst = rateLimit(`forum:reply:${actor.id}`, 4, 30_000);
  const recent = await db
    .select({ body: forumReplies.body, threadId: forumReplies.threadId, createdAt: forumReplies.createdAt })
    .from(forumReplies)
    .where(and(eq(forumReplies.authorId, actor.id), gt(forumReplies.createdAt, sql`now() - interval '1 hour'`)))
    .orderBy(desc(forumReplies.createdAt))
    .limit(FORUM_LIMITS.repliesPerHour);
  if (!staff) {
    const last = recent[0];
    const wait = last ? Math.ceil((last.createdAt.getTime() + FORUM_LIMITS.replyGapSec * 1000 - Date.now()) / 1000) : 0;
    if (!burst.ok || wait > 0) throw new ContentError(`Pelan-pelan dulu ya — tunggu ${Math.max(wait, burst.retryAfterSec, 1)} detik lagi.`);
    if (recent.length >= FORUM_LIMITS.repliesPerHour) throw new ContentError("Kamu sudah membalas sangat banyak dalam 1 jam. Istirahat dulu ya.");
  }
  if (recent.some((r) => r.threadId === threadId && Date.now() - r.createdAt.getTime() < 10 * 60_000 && sameText(r.body, body))) {
    throw new ContentError("Balasan yang sama sudah kamu kirim barusan.", "body");
  }

  let parent: { id: string; authorId: string } | null = null;
  if (parentId) {
    const [prow] = await db
      .select({ id: forumReplies.id, authorId: forumReplies.authorId })
      .from(forumReplies)
      .where(and(eq(forumReplies.id, parentId), eq(forumReplies.threadId, threadId), isNull(forumReplies.deletedAt)))
      .limit(1);
    if (!prow) throw new ContentError("Balasan yang dikutip tidak ditemukan.", "body");
    parent = prow;
  }

  const [row] = await db.insert(forumReplies).values({ threadId, authorId: actor.id, body, parentId: parent?.id ?? null }).returning({ id: forumReplies.id });
  const replyId = row!.id;
  const url = replyPath(threadId, replyId);
  const data = { threadTitle: thread.title, snippet: plainSnippet(body, 140) };
  const notes: NotifyInput[] = [];
  if (thread.authorId !== actor.id) {
    notes.push({ userId: thread.authorId, type: "forum_reply", actorId: actor.id, url, data, groupKey: `forum_reply:${threadId}` });
  }
  if (parent && parent.authorId !== actor.id && parent.authorId !== thread.authorId) {
    notes.push({ userId: parent.authorId, type: "forum_reply", actorId: actor.id, url, data, groupKey: `forum_reply:${threadId}` });
  }
  for (const userId of await mentionTargets(body, [actor.id, thread.authorId])) {
    notes.push({ userId, type: "forum_mention", actorId: actor.id, url, data, groupKey: `forum_mention:${threadId}` });
  }
  if (notes.length) await notifyAndEmail(notes);
  return { id: replyId, url };
}

async function loadReplyForWrite(id: string) {
  const [r] = await db
    .select({ reply: forumReplies, thread: forumThreads })
    .from(forumReplies)
    .innerJoin(forumThreads, eq(forumThreads.id, forumReplies.threadId))
    .where(eq(forumReplies.id, id))
    .limit(1);
  if (!r || r.reply.deletedAt) throw new ContentError("Balasan tidak ditemukan.");
  return r;
}

export async function getReplyForEdit(id: string, viewer: CurrentUser) {
  try {
    const r = await loadReplyForWrite(id);
    if (r.reply.authorId !== viewer.id && !isStaff(viewer)) return null;
    return r;
  } catch {
    return null;
  }
}

export async function updateReply(actor: CurrentUser, id: string, rawBody: string) {
  const { reply, thread } = await loadReplyForWrite(id);
  const staff = isStaff(actor);
  if (reply.authorId !== actor.id && !staff) throw new ContentError("Kamu tidak bisa mengubah balasan ini.");
  if (thread.lockedAt && !staff) throw new ContentError("Thread dikunci moderator — balasan tidak bisa diubah.");
  const body = cleanBody(rawBody, FORUM_LIMITS.replyMin, FORUM_LIMITS.replyMax);
  if (body !== reply.body) {
    await guardContent(actor, body, { context: "forum_reply", field: "body", allowLinks: true, maxLinks: FORUM_LIMITS.maxLinks });
    await db.update(forumReplies).set({ body, editedAt: new Date(), updatedAt: new Date() }).where(eq(forumReplies.id, id));
  }
  return { threadId: thread.id, url: replyPath(thread.id, id) };
}

export async function deleteReply(actor: CurrentUser, id: string) {
  const { reply, thread } = await loadReplyForWrite(id);
  if (reply.authorId !== actor.id && !isStaff(actor)) throw new ContentError("Kamu tidak bisa menghapus balasan ini.");
  await db.update(forumReplies).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(forumReplies.id, id));
  if (thread.acceptedReplyId === id) await db.update(forumThreads).set({ acceptedReplyId: null }).where(eq(forumThreads.id, thread.id));
  if (reply.authorId !== actor.id) {
    await db.insert(moderationActions).values({ moderatorId: actor.id, targetType: "forum_reply", targetId: id, action: "delete" });
  }
  return { threadId: thread.id };
}

// ─── Vote & jawaban terbaik ─────────────────────────────────────────────────
export async function toggleVote(actor: CurrentUser, targetType: "thread" | "reply", targetId: string) {
  const rl = await sharedLimit(`forum:vote:${actor.id}`, 60, 60_000);
  if (!rl.ok) throw new ContentError("Terlalu banyak vote, tunggu sebentar.");
  let threadId: string;
  if (targetType === "thread") {
    const { thread } = await loadThreadForWrite(targetId);
    if (thread.authorId === actor.id) throw new ContentError("Tidak bisa upvote thread sendiri.");
    if (thread.hiddenAt || thread.reportHiddenAt) throw new ContentError("Thread ini sedang ditinjau moderator.");
    threadId = thread.id;
  } else {
    const { reply, thread } = await loadReplyForWrite(targetId);
    if (reply.authorId === actor.id) throw new ContentError("Tidak bisa upvote balasan sendiri.");
    if (reply.hiddenAt || reply.reportHiddenAt) throw new ContentError("Balasan ini sedang ditinjau moderator.");
    threadId = thread.id;
  }
  const inserted = await db.insert(forumVotes).values({ userId: actor.id, targetType, targetId }).onConflictDoNothing().returning({ id: forumVotes.targetId });
  if (!inserted.length) {
    await db.delete(forumVotes).where(and(eq(forumVotes.userId, actor.id), eq(forumVotes.targetType, targetType), eq(forumVotes.targetId, targetId)));
  }
  return { voted: inserted.length > 0, threadId };
}

export async function setAcceptedAnswer(actor: CurrentUser, threadId: string, replyId: string | null) {
  const { thread, kind } = await loadThreadForWrite(threadId);
  if (kind !== "qa") throw new ContentError("Jawaban terbaik hanya ada di kategori Tanya Jawab.");
  if (thread.authorId !== actor.id && !isStaff(actor)) throw new ContentError("Hanya penanya yang bisa memilih jawaban terbaik.");
  if (!replyId) {
    await db.update(forumThreads).set({ acceptedReplyId: null }).where(eq(forumThreads.id, threadId));
    return;
  }
  const [r] = await db
    .select({ id: forumReplies.id, authorId: forumReplies.authorId, deletedAt: forumReplies.deletedAt, hiddenAt: forumReplies.hiddenAt, reportHiddenAt: forumReplies.reportHiddenAt })
    .from(forumReplies)
    .where(and(eq(forumReplies.id, replyId), eq(forumReplies.threadId, threadId)))
    .limit(1);
  if (!r || r.deletedAt || r.hiddenAt || r.reportHiddenAt) throw new ContentError("Balasan tidak ditemukan.");
  if (thread.acceptedReplyId === r.id) return;
  await db.update(forumThreads).set({ acceptedReplyId: r.id }).where(eq(forumThreads.id, threadId));
  if (r.authorId !== actor.id) {
    await notifyAndEmail({
      userId: r.authorId,
      type: "forum_accepted",
      actorId: actor.id,
      url: replyPath(threadId, r.id),
      data: { threadTitle: thread.title },
    });
  }
}

/** Daftar produk yang boleh ditautkan ke thread (untuk chip "Terkait produk"). */
export async function getProductForThread(slug: string | null | undefined) {
  if (!slug) return null;
  const [p] = await db
    .select({ id: products.id, slug: products.slug, title: products.title, iconKey: products.iconKey })
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.status, "published")))
    .limit(1);
  return p ?? null;
}
