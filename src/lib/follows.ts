import "server-only";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { CurrentUser } from "@/lib/auth/current-user";
import { ContentError } from "@/lib/community/guard";
import { plainSnippet, threadPath } from "@/lib/community/shared";
import { db } from "@/lib/db";
import { follows, notifications, products, releases, sellerProfiles, users, type NotificationData } from "@/lib/db/schema";
import { notify, queueNotificationEmails } from "@/lib/notifications/server";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notifications/shared";
import { sharedLimit } from "@/lib/rate-limit";

export type FollowTarget = "seller" | "product";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = typeof db | Tx;

export async function getFollowState(viewerId: string | null | undefined, type: FollowTarget, id: string) {
  const [[c], mine] = await Promise.all([
    db.select({ n: count() }).from(follows).where(and(eq(follows.targetType, type), eq(follows.targetId, id))),
    viewerId
      ? db
          .select({ u: follows.userId })
          .from(follows)
          .where(and(eq(follows.userId, viewerId), eq(follows.targetType, type), eq(follows.targetId, id)))
          .limit(1)
      : Promise.resolve([]),
  ]);
  return { following: mine.length > 0, count: c?.n ?? 0 };
}

/** Ikuti / berhenti mengikuti. Seller yang diikuti dapat notifikasi (digabung selama belum dibaca). */
export async function toggleFollow(user: CurrentUser, type: FollowTarget, id: string) {
  const rl = await sharedLimit(`follow:${user.id}`, 60, 60_000);
  if (!rl.ok) throw new ContentError("Terlalu sering, tunggu sebentar.");
  if (type === "seller") {
    if (id === user.id) throw new ContentError("Tidak bisa mengikuti diri sendiri.");
    const [s] = await db
      .select({ id: sellerProfiles.userId })
      .from(sellerProfiles)
      .innerJoin(users, eq(users.id, sellerProfiles.userId))
      .where(and(eq(sellerProfiles.userId, id), sql`${users.bannedAt} is null`))
      .limit(1);
    if (!s) throw new ContentError("Seller tidak ditemukan.");
  } else {
    const [p] = await db.select({ sellerId: products.sellerId, status: products.status }).from(products).where(eq(products.id, id)).limit(1);
    if (!p || p.status !== "published") throw new ContentError("Produk tidak ditemukan.");
    if (p.sellerId === user.id) throw new ContentError("Ini karyamu sendiri.");
  }
  const ins = await db.insert(follows).values({ userId: user.id, targetType: type, targetId: id }).onConflictDoNothing().returning({ u: follows.userId });
  if (!ins.length) {
    await db.delete(follows).where(and(eq(follows.userId, user.id), eq(follows.targetType, type), eq(follows.targetId, id)));
    return { following: false };
  }
  if (type === "seller") {
    await notify({ userId: id, type: "new_follower", actorId: user.id, url: `/@${user.username}`, data: {}, groupKey: `new_follower:${id}` });
  }
  return { following: true };
}

/** Pemilik baru otomatis mengikuti update produknya (tanpa notifikasi ke seller). Idempoten. */
export async function autoFollowProduct(exec: Exec, userId: string, productId: string) {
  await exec.insert(follows).values({ userId, targetType: "product", targetId: productId }).onConflictDoNothing();
}

/**
 * Kirim notifikasi ke semua pengikut dalam SATU query (INSERT … SELECT), digabung per grup selama belum dibaca.
 * Email hanya untuk yang menyalakan email kategori ini (default mati → hemat kuota).
 */
export async function notifyFollowers(opts: {
  targetType: FollowTarget;
  targetId: string;
  type: NotificationType;
  actorId: string | null;
  url: string;
  data: NotificationData;
  groupKey: string;
}) {
  const rows = await db.execute<{ id: number }>(sql`
    insert into ${notifications} (user_id, type, actor_id, url, data, group_key)
    select f.user_id, ${opts.type}, ${opts.actorId}, ${opts.url}, ${JSON.stringify(opts.data)}::jsonb, ${opts.groupKey}
    from ${follows} f join ${users} u on u.id = f.user_id
    where f.target_type = ${opts.targetType} and f.target_id = ${opts.targetId}
      and u.banned_at is null and f.user_id is distinct from ${opts.actorId}
    on conflict (user_id, group_key) where read_at is null and group_key is not null
    do update set count = notifications.count + 1, type = excluded.type, actor_id = excluded.actor_id,
      url = excluded.url, data = excluded.data, updated_at = now()
    returning id
  `);
  const ids = rows.map((r) => Number(r.id));
  const category = NOTIFICATION_TYPES[opts.type].category;
  if (ids.length) {
    const optedIn = await db
      .select({ id: notifications.id })
      .from(notifications)
      .innerJoin(users, eq(users.id, notifications.userId))
      .where(and(inArray(notifications.id, ids.slice(0, 5000)), sql`(${users.notifyPrefs} -> 'email' ->> ${category}) = 'true'`));
    queueNotificationEmails(optedIn.map((r) => r.id));
  }
  return ids.length;
}

/** Karya baru tayang → kabari pengikut seller. */
export async function announceProductPublished(productId: string) {
  const [p] = await db
    .select({
      title: products.title,
      slug: products.slug,
      summary: products.summary,
      sellerId: products.sellerId,
      name: sql<string>`coalesce(${sellerProfiles.storeName}, ${users.displayName})`,
    })
    .from(products)
    .innerJoin(users, eq(users.id, products.sellerId))
    .leftJoin(sellerProfiles, eq(sellerProfiles.userId, products.sellerId))
    .where(eq(products.id, productId))
    .limit(1);
  if (!p) return 0;
  return notifyFollowers({
    targetType: "seller",
    targetId: p.sellerId,
    type: "product_new",
    actorId: p.sellerId,
    url: `/p/${p.slug}`,
    data: { productTitle: p.title, sellerName: p.name, snippet: plainSnippet(p.summary, 140) },
    groupKey: `product_new:${p.sellerId}`,
  });
}

/** Versi baru tayang → kabari pengikut produk (termasuk pemilik yang otomatis mengikuti). */
export async function announceReleasePublished(releaseId: string) {
  const [r] = await db
    .select({ version: releases.version, changelog: releases.changelogMd, productId: releases.productId, title: products.title, slug: products.slug, sellerId: products.sellerId })
    .from(releases)
    .innerJoin(products, eq(products.id, releases.productId))
    .where(eq(releases.id, releaseId))
    .limit(1);
  if (!r) return 0;
  return notifyFollowers({
    targetType: "product",
    targetId: r.productId,
    type: "product_update",
    actorId: r.sellerId,
    url: `/p/${r.slug}`,
    data: { productTitle: r.title, version: r.version, snippet: r.changelog.trim() ? plainSnippet(r.changelog, 140) : null },
    groupKey: `product_update:${r.productId}`,
  });
}

/** Devlog baru dari seller produk → kabari pengikut produk. */
export async function announceDevlog(thread: { id: string; title: string; body: string }, product: { id: string; title: string }, actorId: string) {
  return notifyFollowers({
    targetType: "product",
    targetId: product.id,
    type: "product_devlog",
    actorId,
    url: threadPath(thread.id),
    data: { productTitle: product.title, threadTitle: thread.title, snippet: plainSnippet(thread.body, 140) },
    groupKey: `product_devlog:${product.id}`,
  });
}

/** Daftar yang diikuti user (halaman /akun/diikuti). */
export async function listFollowing(userId: string) {
  const [sellers, prods] = await Promise.all([
    db
      .select({
        id: users.id,
        username: users.username,
        name: sql<string>`coalesce(${sellerProfiles.storeName}, ${users.displayName})`,
        tagline: sellerProfiles.tagline,
        avatarKey: users.avatarKey,
        since: follows.createdAt,
      })
      .from(follows)
      .innerJoin(users, eq(users.id, follows.targetId))
      .leftJoin(sellerProfiles, eq(sellerProfiles.userId, users.id))
      .where(and(eq(follows.userId, userId), eq(follows.targetType, "seller")))
      .orderBy(desc(follows.createdAt)),
    db
      .select({
        id: products.id,
        slug: products.slug,
        title: products.title,
        summary: products.summary,
        iconKey: products.iconKey,
        status: products.status,
        since: follows.createdAt,
        latestVersion: sql<string | null>`(select r.version from ${releases} r where r.product_id = ${products.id} and r.status = 'published' and (r.scheduled_at is null or r.scheduled_at <= now()) order by r.published_at desc limit 1)`,
      })
      .from(follows)
      .innerJoin(products, eq(products.id, follows.targetId))
      .where(and(eq(follows.userId, userId), eq(follows.targetType, "product")))
      .orderBy(desc(follows.createdAt)),
  ]);
  return { sellers, products: prods.filter((p) => p.status === "published") };
}
