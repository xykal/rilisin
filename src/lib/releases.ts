import "server-only";
import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, releases } from "@/lib/db/schema";
import { announceProductPublished, announceReleasePublished } from "@/lib/follows";

/** Rilis status published dianggap tayang kalau tidak terjadwal, atau jadwalnya sudah lewat. */
export function isReleaseDue() {
  return or(isNull(releases.scheduledAt), lte(releases.scheduledAt, new Date()));
}

/**
 * Terima input datetime-local (ditulis seller dalam WIB) → Date.
 * null = kosong (tayang langsung). Lempar kalau format/waktu tidak masuk akal.
 */
export function parseScheduledAt(raw: string | null | undefined): Date | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/);
  const d = m ? new Date(`${m[1]}T${m[2]}:${m[3] ?? "00"}+07:00`) : new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error("jadwal");
  if (d.getTime() <= Date.now() || d.getTime() > Date.now() + 90 * 86400_000) throw new Error("jadwal");
  return d;
}

/** Ambil semua rilis yang jadwalnya tiba (atomik; hanya milik produk published) lalu tayangkan. */
export async function claimDueReleases() {
  return db.execute<{ id: string; product_id: string }>(sql`
    update ${releases} r set scheduled_at = null, published_at = now()
    where r.status = 'published' and r.scheduled_at is not null and r.scheduled_at <= now()
    and exists (select 1 from ${products} p where p.id = r.product_id and p.status = 'published')
    returning r.id as id, r.product_id as product_id`);
}

/** Umumkan rilis/produk yang baru tayang (panggil dalam after() — ada fan-out notifikasi). */
export async function announceDueReleases(rows: { id: string; product_id: string }[]) {
  for (const r of rows) {
    await announceReleasePublished(r.id);
    const [first] = await db
      .update(products)
      .set({ publishedAt: new Date() })
      .where(and(eq(products.id, r.product_id), isNull(products.publishedAt)))
      .returning({ id: products.id });
    if (first) await announceProductPublished(r.product_id);
  }
}

/** Jadwal tayang terdekat yang belum tiba (untuk kartu "Segera hadir" + hitung mundur). */
export async function getNextScheduledRelease(productId: string) {
  const [row] = await db
    .select({ id: releases.id, version: releases.version, changelogMd: releases.changelogMd, scheduledAt: releases.scheduledAt })
    .from(releases)
    .where(and(eq(releases.productId, productId), eq(releases.status, "published"), gt(releases.scheduledAt, new Date())))
    .orderBy(asc(releases.scheduledAt))
    .limit(1);
  return row ?? null;
}
