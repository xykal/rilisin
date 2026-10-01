import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { after } from "next/server";
import { db } from "@/lib/db";
import { notifications, users, type NotifyPrefs } from "@/lib/db/schema";
import { appUrl } from "@/lib/email";
import { NOTIFICATION_CATEGORIES, NOTIFICATION_TYPES, describeNotification, isNotificationType, type NotificationCategory } from "./shared";

/**
 * Push HP via OneSignal (Web Push). Mati-aman: tanpa kedua env di bawah,
 * semua fungsi jadi no-op dan UI menampilkan "belum aktif".
 *  - NEXT_PUBLIC_ONESIGNAL_APP_ID (publik, dipakai browser)
 *  - ONESIGNAL_REST_API_KEY (RAHASIA server, jangan bocor ke client)
 * Panduan setup: docs/PUSH.md
 */
const APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID?.trim() ?? "";
const REST_KEY = process.env.ONESIGNAL_REST_API_KEY?.trim() ?? "";

export const pushConfigured = () => APP_ID.length > 0 && REST_KEY.length > 0;

// ─── Preferensi push (kunci `push` di users.notify_prefs, tanpa migrasi) ────
export function pushPrefEnabled(prefs: NotifyPrefs | null | undefined, category: NotificationCategory) {
  const v = prefs?.push?.[category];
  if (typeof v === "boolean") return v;
  return NOTIFICATION_CATEGORIES.find((c) => c.id === category)?.pushDefault ?? false;
}

export async function getPushPrefs(userId: string) {
  const [u] = await db.select({ prefs: users.notifyPrefs }).from(users).where(eq(users.id, userId)).limit(1);
  return Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c.id, pushPrefEnabled(u?.prefs, c.id)])) as Record<NotificationCategory, boolean>;
}

export async function setPushPrefs(userId: string, values: Partial<Record<NotificationCategory, boolean>>) {
  const clean = Object.fromEntries(
    Object.entries(values).filter(([k, v]) => NOTIFICATION_CATEGORIES.some((c) => c.id === k) && typeof v === "boolean"),
  );
  if (!Object.keys(clean).length) return;
  await db
    .update(users)
    .set({
      notifyPrefs: sql`jsonb_set(${users.notifyPrefs}, '{push}', coalesce(${users.notifyPrefs} -> 'push', '{}'::jsonb) || ${JSON.stringify(clean)}::jsonb)`,
    })
    .where(eq(users.id, userId));
}

// ─── Pengiriman (dijadwalkan lewat `after`, cerminan email) ──────────────────
export function queueNotificationPush(ids: number[]) {
  if (!ids.length || !pushConfigured()) return;
  const run = () => deliverNotificationPush(ids).catch((err) => console.error("[notif] push gagal", err));
  try {
    after(run);
  } catch {
    void run();
  }
}

type PushItem = { externalId: string; title: string; body: string; url: string };

async function deliverNotificationPush(ids: number[]) {
  const actor = alias(users, "actor");
  const rows = await db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      type: notifications.type,
      count: notifications.count,
      data: notifications.data,
      readAt: notifications.readAt,
      pushedAt: notifications.pushedAt,
      prefs: users.notifyPrefs,
      bannedAt: users.bannedAt,
      actorName: actor.displayName,
    })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .leftJoin(actor, eq(actor.id, notifications.actorId))
    .where(inArray(notifications.id, ids));

  const base = appUrl();
  const items: PushItem[] = [];
  for (const r of rows) {
    if (!isNotificationType(r.type)) continue;
    const meta = NOTIFICATION_TYPES[r.type];
    if (r.readAt || r.pushedAt || r.bannedAt) continue;
    if (!pushPrefEnabled(r.prefs, meta.category)) continue;
    // Klaim atomik (cerminan email): hanya satu pengirim per notifikasi.
    const claimed = await db
      .update(notifications)
      .set({ pushedAt: new Date() })
      .where(and(eq(notifications.id, r.id), isNull(notifications.pushedAt)))
      .returning({ id: notifications.id });
    if (!claimed.length) continue;
    const { title, body } = describeNotification({ type: r.type, count: r.count, actorName: r.actorName, data: r.data });
    items.push({ externalId: r.userId, title, body: body || title, url: `${base}/notifikasi/buka/${r.id}` });
  }
  await sendPush(items);
}

/**
 * Kirim via OneSignal REST API. Pesan identik (mis. versi baru ke semua pengikut)
 * digabung jadi satu request. Tidak pernah melempar (kegagalan = log saja). Kembalian: total penerima, atau null kalau ditolak/gagal.
 */
export async function sendPush(items: PushItem[]): Promise<number | null> {
  if (!items.length) return 0;
  if (!pushConfigured()) return null;
  const groups = new Map<string, { title: string; body: string; url: string; externalIds: string[] }>();
  for (const m of items) {
    const k = `${m.title}\n${m.body}\n${m.url}`;
    const g = groups.get(k) ?? { title: m.title, body: m.body, url: m.url, externalIds: [] };
    if (!g.externalIds.includes(m.externalId)) g.externalIds.push(m.externalId);
    groups.set(k, g);
  }
  const results = await Promise.allSettled(
    [...groups.values()].map(async (g) => {
      // Ikon eksplisit: tanpa ini OneSignal memakai "/default-icon" bawaannya → 404 di console user.
      let icon = "https://rilisin.xyverse.my.id/icons/icon-192.png";
      try {
        icon = `${new URL(g.url).origin}/icons/icon-192.png`;
      } catch {}
      const res = await fetch("https://api.onesignal.com/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${REST_KEY}` },
        body: JSON.stringify({
          app_id: APP_ID,
          include_aliases: { external_id: g.externalIds },
          target_channel: "push",
          headings: { en: g.title.slice(0, 100) },
          contents: { en: g.body.slice(0, 200) },
          url: g.url,
          chrome_web_icon: icon,
          firefox_icon: icon,
        }),
      });
      if (!res.ok) {
        console.error("[notif] push ditolak", res.status, (await res.text()).slice(0, 300));
        return null;
      }
      try {
        const j = (await res.json()) as { recipients?: number };
        return typeof j.recipients === "number" ? j.recipients : 0;
      } catch {
        return null;
      }
    }),
  );
  return results.reduce<number>((n, r) => n + (r.status === "fulfilled" ? (r.value ?? 0) : 0), 0);
}
