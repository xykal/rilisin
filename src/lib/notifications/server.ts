import "server-only";
import { and, count, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { after } from "next/server";
import { signalUserNotified } from "@/lib/chat/notify";
import { db } from "@/lib/db";
import { notifications, users, type NotificationData, type NotifyPrefs } from "@/lib/db/schema";
import { appUrl, emailConfigured, renderEmail, sendEmail, sendEmailBatch, type EmailMessage } from "@/lib/email";
import { safeNextPath } from "@/lib/slug";
import { mediaUrl } from "@/lib/storage";
import { signToken, verifyToken } from "@/lib/tokens";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPES,
  describeNotification,
  isNotificationType,
  type NotificationCategory,
  type NotificationDTO,
  type NotificationType,
} from "./shared";
import { queueNotificationPush } from "./push";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = typeof db | Tx;

export type NotifyInput = {
  userId: string;
  type: NotificationType;
  actorId?: string | null;
  /** Path internal ("/..."), dicek lagi oleh constraint database. */
  url: string;
  data?: NotificationData;
  /** Kejadian dengan kunci yang sama digabung selama belum dibaca (count naik). */
  groupKey?: string | null;
};

/**
 * Buat notifikasi. Tidak pernah memberi notifikasi ke pelaku sendiri.
 * Boleh dipanggil di dalam transaksi (`exec` = tx) — email dikirim terpisah lewat `queueNotificationEmails`.
 */
export async function notify(input: NotifyInput | NotifyInput[], exec: Exec = db): Promise<number[]> {
  const items = (Array.isArray(input) ? input : [input]).filter(
    (i) => i.userId && i.userId !== i.actorId && safeNextPath(i.url, "") === i.url,
  );
  const ids: number[] = [];
  for (const i of items) {
    const [row] = await exec
      .insert(notifications)
      .values({
        userId: i.userId,
        type: i.type,
        actorId: i.actorId ?? null,
        url: i.url.slice(0, 500),
        data: i.data ?? {},
        groupKey: i.groupKey ?? null,
      })
      .onConflictDoUpdate({
        target: [notifications.userId, notifications.groupKey],
        targetWhere: sql`read_at is null and group_key is not null`,
        set: {
          count: sql`${notifications.count} + 1`,
          type: sql`excluded.type`,
          actorId: sql`excluded.actor_id`,
          url: sql`excluded.url`,
          data: sql`excluded.data`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: notifications.id });
    if (row) ids.push(row.id);
  }
  if (ids.length) {
    // Ping realtime (awaited supaya tidak hilang saat respons langsung redirect): bel ambil ulang jumlah dari DB.
    await Promise.all([...new Set(items.map((i) => i.userId))].map((userId) => signalUserNotified(userId)));
  }
  return ids;
}

/** Buat notifikasi + jadwalkan email & push setelah respons terkirim (tidak memperlambat aksi user). */
export async function notifyAndEmail(input: NotifyInput | NotifyInput[]) {
  const ids = await notify(input);
  queueNotificationEmails(ids);
  queueNotificationPush(ids);
  return ids;
}

export function queueNotificationEmails(ids: number[]) {
  if (!ids.length) return;
  const run = () => deliverNotificationEmails(ids).catch((err) => console.error("[notif] email gagal", err));
  try {
    after(run);
  } catch {
    void run();
  }
}

// ─── Preferensi ─────────────────────────────────────────────────────────────
export function emailPrefEnabled(prefs: NotifyPrefs | null | undefined, category: NotificationCategory) {
  const v = prefs?.email?.[category];
  if (typeof v === "boolean") return v;
  return NOTIFICATION_CATEGORIES.find((c) => c.id === category)?.emailDefault ?? false;
}

export async function getEmailPrefs(userId: string) {
  const [u] = await db.select({ prefs: users.notifyPrefs }).from(users).where(eq(users.id, userId)).limit(1);
  return Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c.id, emailPrefEnabled(u?.prefs, c.id)])) as Record<NotificationCategory, boolean>;
}

export async function setEmailPrefs(userId: string, values: Partial<Record<NotificationCategory, boolean>>) {
  const clean = Object.fromEntries(
    Object.entries(values).filter(([k, v]) => NOTIFICATION_CATEGORIES.some((c) => c.id === k) && typeof v === "boolean"),
  );
  if (!Object.keys(clean).length) return;
  await db
    .update(users)
    .set({
      notifyPrefs: sql`jsonb_set(${users.notifyPrefs}, '{email}', coalesce(${users.notifyPrefs} -> 'email', '{}'::jsonb) || ${JSON.stringify(clean)}::jsonb)`,
    })
    .where(eq(users.id, userId));
}

// ─── Berhenti berlangganan (link di email) ──────────────────────────────────
const UNSUB_TTL = 60 * 60 * 24 * 365;

export function unsubscribeToken(userId: string, category: NotificationCategory) {
  return signToken("unsub", { u: userId, c: category }, UNSUB_TTL);
}

export function readUnsubscribeToken(token: string | null | undefined) {
  const t = verifyToken<{ u: string; c: string }>("unsub", token);
  if (!t || !NOTIFICATION_CATEGORIES.some((c) => c.id === t.c)) return null;
  return { userId: t.u, category: t.c as NotificationCategory };
}

// ─── Email ──────────────────────────────────────────────────────────────────
async function deliverNotificationEmails(ids: number[]) {
  const actor = alias(users, "actor");
  const rows = await db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      type: notifications.type,
      count: notifications.count,
      data: notifications.data,
      readAt: notifications.readAt,
      emailedAt: notifications.emailedAt,
      email: users.email,
      prefs: users.notifyPrefs,
      bannedAt: users.bannedAt,
      actorName: actor.displayName,
    })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .leftJoin(actor, eq(actor.id, notifications.actorId))
    .where(inArray(notifications.id, ids));

  const base = appUrl();
  const outbox: EmailMessage[] = [];
  for (const r of rows) {
    if (!isNotificationType(r.type)) continue;
    const meta = NOTIFICATION_TYPES[r.type];
    if (!meta.email || r.readAt || r.emailedAt || r.bannedAt) continue;
    if (!emailPrefEnabled(r.prefs, meta.category)) continue;
    // Klaim atomik: kalau dua proses berjalan bersamaan, hanya satu yang mengirim.
    const claimed = await db
      .update(notifications)
      .set({ emailedAt: new Date() })
      .where(and(eq(notifications.id, r.id), isNull(notifications.emailedAt)))
      .returning({ id: notifications.id });
    if (!claimed.length) continue;

    const { title, body } = describeNotification({ type: r.type, count: r.count, actorName: r.actorName, data: r.data });
    const token = unsubscribeToken(r.userId, meta.category);
    const category = NOTIFICATION_CATEGORIES.find((c) => c.id === meta.category)!;
    const { html, text } = renderEmail({
      heading: title,
      paragraphs: body ? [body] : [],
      cta: { label: "Buka di Rilisin", url: `${base}/notifikasi/buka/${r.id}` },
      footnote: `Kamu menerima email ini karena notifikasi "${category.label}" aktif.`,
      unsubscribeUrl: `${base}/notifikasi/berhenti?t=${encodeURIComponent(token)}`,
    });
    outbox.push({
      to: r.email,
      subject: title,
      html,
      text,
      headers: {
        // RFC 8058: tombol "berhenti berlangganan" satu klik di Gmail/Yahoo
        "List-Unsubscribe": `<${base}/api/notifications/unsubscribe?t=${encodeURIComponent(token)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  }
  // Sedikit = kirim satu-satu; banyak (mis. versi baru ke semua pengikut) = batch 100 per request.
  if (outbox.length <= 2) for (const m of outbox) await sendEmail(m);
  else await sendEmailBatch(outbox);
}

// ─── Baca ────────────────────────────────────────────────────────────────────
export async function getUnreadCount(userId: string) {
  const [r] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return r?.n ?? 0;
}

export async function listNotifications(userId: string, opts: { limit?: number; offset?: number; unreadOnly?: boolean } = {}) {
  const actor = alias(users, "actor");
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      count: notifications.count,
      data: notifications.data,
      readAt: notifications.readAt,
      updatedAt: notifications.updatedAt,
      actorName: actor.displayName,
      actorUsername: actor.username,
      actorAvatar: actor.avatarKey,
    })
    .from(notifications)
    .leftJoin(actor, eq(actor.id, notifications.actorId))
    .where(and(eq(notifications.userId, userId), opts.unreadOnly ? isNull(notifications.readAt) : undefined))
    .orderBy(desc(notifications.updatedAt), desc(notifications.id))
    .limit(limit)
    .offset(Math.max(opts.offset ?? 0, 0));
  return rows.map((r): NotificationDTO => {
    const { title, body } = describeNotification({ type: r.type, count: r.count, actorName: r.actorName, data: r.data });
    return {
      id: r.id,
      type: r.type,
      title,
      body,
      href: `/notifikasi/buka/${r.id}`,
      count: r.count,
      read: Boolean(r.readAt),
      at: r.updatedAt.toISOString(),
      actor: r.actorName ? { name: r.actorName, username: r.actorUsername ?? "", avatarUrl: mediaUrl(r.actorAvatar) } : null,
    };
  });
}

export async function countNotifications(userId: string, unreadOnly = false) {
  const [r] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), unreadOnly ? isNull(notifications.readAt) : undefined));
  return r?.n ?? 0;
}

/** Tandai dibaca dan kembalikan tujuan link-nya (null kalau bukan milik user ini). */
export async function openNotification(userId: string, id: number) {
  const [row] = await db
    .update(notifications)
    .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ url: notifications.url });
  return row ? safeNextPath(row.url, "/notifikasi") : null;
}

export async function markAllRead(userId: string) {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return rows.length;
}

/** Bersih-bersih: notifikasi yang sudah dibaca > 90 hari (dipanggil sesekali, murah berkat index). */
export async function pruneOldNotifications() {
  await db.delete(notifications).where(and(lt(notifications.updatedAt, sql`now() - interval '90 days'`), sql`${notifications.readAt} is not null`));
}

export { emailConfigured };
