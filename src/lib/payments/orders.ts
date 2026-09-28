import "server-only";
import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { and, eq, lt, sql } from "drizzle-orm";
import type { CurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { entitlements, ledgerEntries, orders, paymentEvents, products, sellerProfiles, users, type Order } from "@/lib/db/schema";
import { escapeHtml, sendEmail } from "@/lib/email";
import { autoFollowProduct } from "@/lib/follows";
import { notifyAndEmail } from "@/lib/notifications/server";
import { formatDateTime, formatRupiah } from "@/lib/format";
import { sharedLimit } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security/events";
import { SITE } from "@/lib/config";
import { methodAllowed, paymentMethod, PRICE_LIMITS, type PaymentMethodId } from "./methods";
import { PAYMENT_CONFIG, pakasirConfig, paymentProvider, paymentProviderId, PaymentProviderError } from "./provider";

export class OrderError extends Error {
  constructor(
    message: string,
    readonly code: "invalid" | "owned" | "free" | "rate" | "gateway" | "not_found" = "invalid",
  ) {
    super(message);
    this.name = "OrderError";
  }
}

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // tanpa 0/O/1/I biar tidak salah baca

/** RLS-260927-7K3QX9MZ2A → 50 bit acak, tidak bisa ditebak/di-enumerasi. */
export function newOrderCode(now = new Date()) {
  const ymd = now.toISOString().slice(2, 10).replaceAll("-", "");
  const bytes = randomBytes(10);
  let rand = "";
  for (const b of bytes) rand += CODE_ALPHABET[b & 31];
  return `RLS-${ymd}-${rand}`;
}

export function effectiveCommissionBps(commissionBps: number, zeroCommissionUntil: Date | null, now = new Date()) {
  return zeroCommissionUntil && zeroCommissionUntil > now ? 0 : commissionBps;
}

/** Komisi dibulatkan ke bawah (selisih pembulatan jadi milik seller). */
export function splitAmount(amount: number, bps: number) {
  const commission = Math.floor((amount * bps) / 10_000);
  return { commission, earning: amount - commission };
}

async function logPaymentEvent(e: { provider: string; source: string; orderCode?: string | null; orderId?: string | null; result: string; payload?: Record<string, unknown> }) {
  try {
    await db.insert(paymentEvents).values({
      provider: e.provider,
      source: e.source,
      orderCode: e.orderCode ?? null,
      orderId: e.orderId ?? null,
      result: e.result,
      payload: e.payload ?? null,
    });
  } catch (err) {
    console.error("[payments] gagal mencatat event", err);
  }
}

/** Pesanan "pending" yang lewat batas waktu → expired (lazy, tanpa cron). */
export async function expireOverdueOrders() {
  await db
    .update(orders)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(orders.status, "pending"), lt(orders.expiresAt, sql`now() - interval '2 minutes'`)));
}

export type CheckoutProduct = Awaited<ReturnType<typeof getCheckoutProduct>>;

export async function getCheckoutProduct(slug: string) {
  const [p] = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      summary: products.summary,
      iconKey: products.iconKey,
      status: products.status,
      sellerId: products.sellerId,
      pricingModel: products.pricingModel,
      priceIdr: products.priceIdr,
      minPriceIdr: products.minPriceIdr,
      storeName: sellerProfiles.storeName,
      commissionBps: sellerProfiles.commissionBps,
      zeroCommissionUntil: sellerProfiles.zeroCommissionUntil,
    })
    .from(products)
    .innerJoin(sellerProfiles, eq(sellerProfiles.userId, products.sellerId))
    .where(eq(products.slug, slug))
    .limit(1);
  return p ?? null;
}

export async function ownsProduct(userId: string, productId: string) {
  const [e] = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(and(eq(entitlements.userId, userId), eq(entitlements.productId, productId)))
    .limit(1);
  return !!e;
}

/**
 * Buat pesanan + transaksi di gateway. Harga SELALU dihitung ulang di server (tidak percaya input browser),
 * kecuali nominal "bayar seikhlasnya" yang tetap dibatasi minimal & maksimal.
 * Klik ganda / refresh → pesanan pending yang sama dipakai ulang (idempoten).
 */
export async function createOrder(
  buyer: Pick<CurrentUser, "id">,
  input: { productId: string; method: string; amount?: number | null },
): Promise<{ kind: "order"; order: Order } | { kind: "claimed" }> {
  const [p] = await db
    .select({
      id: products.id,
      title: products.title,
      status: products.status,
      sellerId: products.sellerId,
      pricingModel: products.pricingModel,
      priceIdr: products.priceIdr,
      minPriceIdr: products.minPriceIdr,
      commissionBps: sellerProfiles.commissionBps,
      zeroCommissionUntil: sellerProfiles.zeroCommissionUntil,
    })
    .from(products)
    .innerJoin(sellerProfiles, eq(sellerProfiles.userId, products.sellerId))
    .where(eq(products.id, input.productId))
    .limit(1);
  if (!p || p.status !== "published") throw new OrderError("Produk ini sedang tidak tersedia.", "not_found");
  if (p.pricingModel === "free") throw new OrderError("Produk ini gratis — langsung download saja.", "free");
  if (p.sellerId === buyer.id) throw new OrderError("Kamu tidak bisa membeli produk sendiri.");
  if (await ownsProduct(buyer.id, p.id)) throw new OrderError("Kamu sudah memiliki produk ini. Cek Library.", "owned");

  let amount = p.priceIdr;
  if (p.pricingModel === "pwyw") {
    amount = Math.trunc(Number(input.amount ?? 0));
    if (!Number.isFinite(amount) || amount < 0) throw new OrderError("Nominal tidak valid.");
    if (amount === 0 && p.minPriceIdr === 0) {
      // Seller mengizinkan ambil gratis → langsung masuk Library (tanpa transaksi)
      const ins = await db
        .insert(entitlements)
        .values({ userId: buyer.id, productId: p.id, source: "free" })
        .onConflictDoNothing()
        .returning({ id: entitlements.id });
      if (ins.length) {
        await db.update(products).set({ downloadCount: sql`${products.downloadCount} + 1` }).where(eq(products.id, p.id));
        await autoFollowProduct(db, buyer.id, p.id);
      }
      return { kind: "claimed" };
    }
    const floor = Math.max(p.minPriceIdr, PRICE_LIMITS.pwywFloor);
    if (amount < floor) throw new OrderError(`Minimal ${formatRupiah(floor)}.`);
  }
  if (amount <= 0 || amount > PRICE_LIMITS.max) throw new OrderError(`Nominal harus di antara Rp1 dan ${formatRupiah(PRICE_LIMITS.max)}.`);

  const method = input.method as PaymentMethodId;
  const m = paymentMethod(method);
  if (!m) throw new OrderError("Pilih metode pembayaran.");
  if (!methodAllowed(method, amount)) throw new OrderError(`${m.label} hanya untuk nominal ${formatRupiah(m.min)}–${formatRupiah(m.max)}.`);

  if (!(await sharedLimit(`checkout:${buyer.id}`, 12, 10 * 60_000)).ok) {
    throw new OrderError("Terlalu banyak membuat pesanan. Tunggu beberapa menit.", "rate");
  }

  await expireOverdueOrders();
  const providerId = paymentProviderId();
  const provider = paymentProvider(providerId);

  const [existing] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.buyerId, buyer.id), eq(orders.productId, p.id), eq(orders.status, "pending")))
    .limit(1);
  if (existing) {
    const reusable =
      existing.provider === providerId &&
      existing.providerTxnId &&
      existing.amountIdr === amount &&
      existing.paymentMethod === method &&
      existing.expiresAt.getTime() > Date.now() + 60_000;
    if (reusable) return { kind: "order", order: existing };
    await db.update(orders).set({ status: "canceled", updatedAt: new Date() }).where(and(eq(orders.id, existing.id), eq(orders.status, "pending")));
    if (existing.providerTxnId && existing.provider === providerId) {
      provider.cancel(existing.providerTxnId).catch(() => {}); // best effort
    }
  }

  const bps = effectiveCommissionBps(p.commissionBps, p.zeroCommissionUntil);
  const { commission, earning } = splitAmount(amount, bps);
  let order: Order;
  try {
    [order] = await db
      .insert(orders)
      .values({
        code: newOrderCode(),
        buyerId: buyer.id,
        sellerId: p.sellerId,
        productId: p.id,
        productTitle: p.title,
        amountIdr: amount,
        commissionBps: bps,
        commissionIdr: commission,
        sellerEarningIdr: earning,
        provider: providerId,
        paymentMethod: method,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      })
      .returning();
  } catch (err) {
    // Balapan dua request bersamaan → unique index "1 pending per pembeli per produk" menolak yang kedua
    const [again] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.buyerId, buyer.id), eq(orders.productId, p.id), eq(orders.status, "pending")))
      .limit(1);
    if (again) return { kind: "order", order: again };
    throw err;
  }

  try {
    const pay = await provider.createPayment({ orderCode: order.code, amount, method });
    if (providerId === "pakasir" && pay.isSandbox && !pakasirConfig().allowSandbox) {
      provider.cancel(pay.txnId).catch(() => {});
      throw new PaymentProviderError("Proyek Pakasir masih mode sandbox, sedangkan situs ini mode live.");
    }
    const maxExpiry = Date.now() + 24 * 3600_000;
    [order] = await db
      .update(orders)
      .set({
        providerTxnId: pay.txnId,
        gatewayFeeIdr: pay.fee,
        totalPayIdr: pay.totalPay,
        paymentData: { qrString: pay.qrString, vaNumber: pay.vaNumber, paymentLink: pay.paymentLink },
        isSandbox: pay.isSandbox,
        expiresAt: new Date(Math.min(pay.expiresAt.getTime(), maxExpiry)),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
      .returning();
    await logPaymentEvent({ provider: providerId, source: "create", orderCode: order.code, orderId: order.id, result: "created", payload: { txnId: pay.txnId, fee: pay.fee, isSandbox: pay.isSandbox, method } });
    return { kind: "order", order };
  } catch (err) {
    await db.update(orders).set({ status: "canceled", updatedAt: new Date() }).where(eq(orders.id, order.id));
    const msg = err instanceof PaymentProviderError ? err.message : "Gateway pembayaran error.";
    await logPaymentEvent({ provider: providerId, source: "create", orderCode: order.code, orderId: order.id, result: "gateway_error", payload: { message: msg } });
    throw new OrderError(`${msg} Coba lagi sebentar.`, "gateway");
  }
}

export type PaymentEventInput = {
  provider: string;
  source: "webhook" | "poll" | "simulate";
  orderCode: string;
  txnId: string | null;
  amount: number;
  isSandbox: boolean;
  payload?: Record<string, unknown>;
};

/**
 * Satu-satunya jalan pesanan menjadi LUNAS (dipakai webhook, polling status, dan simulator).
 * Aman dipanggil berkali-kali: baris pesanan dikunci (FOR UPDATE), ledger & library punya unique index.
 */
export async function applyPaymentCompleted(evt: PaymentEventInput) {
  const holdMs = PAYMENT_CONFIG.holdDays() * 86_400_000;
  const { result, order, newlyOwned } = await db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.code, evt.orderCode)).for("update").limit(1);
    if (!o) return { result: "unknown_order", order: null, newlyOwned: false };
    if (o.provider !== evt.provider) return { result: "provider_mismatch", order: o, newlyOwned: false };
    if (o.providerTxnId && evt.txnId && o.providerTxnId !== evt.txnId) return { result: "txn_mismatch", order: o, newlyOwned: false };
    if (evt.amount !== o.amountIdr) return { result: "amount_mismatch", order: o, newlyOwned: false };
    if (evt.isSandbox && !o.isSandbox) return { result: "sandbox_rejected", order: o, newlyOwned: false };
    if (evt.provider === "pakasir" && evt.isSandbox && !pakasirConfig().allowSandbox) return { result: "sandbox_rejected", order: o, newlyOwned: false };
    if (o.status === "paid" || o.status === "refunded") return { result: "duplicate", order: o, newlyOwned: false };

    const paidAt = new Date();
    const [updated] = await tx.update(orders).set({ status: "paid", paidAt, updatedAt: paidAt }).where(eq(orders.id, o.id)).returning();
    const ins = await tx
      .insert(entitlements)
      .values({ userId: o.buyerId, productId: o.productId, source: "purchase" })
      .onConflictDoNothing()
      .returning({ id: entitlements.id });
    if (ins.length) {
      await tx.update(products).set({ downloadCount: sql`${products.downloadCount} + 1` }).where(eq(products.id, o.productId));
      await autoFollowProduct(tx, o.buyerId, o.productId);
    }
    if (o.sellerEarningIdr > 0) {
      await tx
        .insert(ledgerEntries)
        .values({
          sellerId: o.sellerId,
          kind: "sale",
          amountIdr: o.sellerEarningIdr,
          orderId: o.id,
          availableAt: new Date(paidAt.getTime() + holdMs),
          memo: `Penjualan ${o.productTitle} (${o.code})`,
        })
        .onConflictDoNothing();
    }
    // Pembeli ternyata sudah punya produknya (bayar 2x lewat pesanan lama) → tetap dicatat, admin perlu refund
    const tag = o.status === "pending" ? "paid" : `paid_late_${o.status}`;
    return { result: ins.length ? tag : `${tag}_already_owned`, order: updated, newlyOwned: ins.length > 0 };
  });

  await logPaymentEvent({ provider: evt.provider, source: evt.source, orderCode: evt.orderCode, orderId: order?.id ?? null, result, payload: { txnId: evt.txnId, amount: evt.amount, isSandbox: evt.isSandbox, ...(evt.payload ?? {}) } });
  if (order && result.startsWith("paid")) {
    const [p] = await db.select({ slug: products.slug }).from(products).where(eq(products.id, order.productId)).limit(1);
    await notifyAndEmail([
      {
        userId: order.buyerId,
        type: "order_paid",
        url: `/pesanan/${order.code}`,
        data: { orderCode: order.code, productTitle: order.productTitle },
      },
      {
        userId: order.sellerId,
        type: "sale",
        actorId: order.buyerId,
        url: "/seller/penjualan",
        data: { productTitle: order.productTitle, earning: order.sellerEarningIdr, holdDays: PAYMENT_CONFIG.holdDays(), productSlug: p?.slug ?? null },
        groupKey: `sale:${order.sellerId}`,
      },
    ]).catch((err) => console.error("[notif] gagal membuat notifikasi pesanan", err));
    const send = () => sendReceipt(order).catch(() => {});
    try {
      after(send);
    } catch {
      void send();
    }
  }
  return { result, order, newlyOwned };
}

/** Cek status ke gateway (dipakai halaman pesanan saat menunggu). Dibatasi 1× per 5 detik per pesanan. */
export async function reconcileOrder(code: string) {
  const [o] = await db.select().from(orders).where(eq(orders.code, code)).limit(1);
  if (!o || o.status !== "pending") return o ?? null;
  if (o.provider === "mock" || !o.providerTxnId) {
    if (o.expiresAt.getTime() < Date.now() - 120_000) {
      await db.update(orders).set({ status: "expired", updatedAt: new Date() }).where(and(eq(orders.id, o.id), eq(orders.status, "pending")));
      return { ...o, status: "expired" as const };
    }
    return o;
  }
  // "Klaim" slot pengecekan secara atomik → beberapa tab yang polling bersamaan tidak membanjiri API gateway
  const claimed = await db
    .update(orders)
    .set({ lastCheckedAt: new Date() })
    .where(and(eq(orders.id, o.id), sql`(${orders.lastCheckedAt} is null or ${orders.lastCheckedAt} < now() - interval '5 seconds')`))
    .returning({ id: orders.id });
  if (!claimed.length) return o;
  try {
    const st = await paymentProvider(o.provider).getStatus(o.providerTxnId);
    if (st.status === "completed") {
      const r = await applyPaymentCompleted({ provider: o.provider, source: "poll", orderCode: o.code, txnId: st.txnId, amount: st.amount, isSandbox: st.isSandbox });
      return r.order ?? o;
    }
    if (st.status === "canceled") {
      await db.update(orders).set({ status: "canceled", updatedAt: new Date() }).where(and(eq(orders.id, o.id), eq(orders.status, "pending")));
      return { ...o, status: "canceled" as const };
    }
  } catch (err) {
    console.error("[payments] cek status gagal", o.code, (err as Error).message);
  }
  return o;
}

/** Webhook Pakasir: secret sudah dicek pemanggil. Status TIDAK dipercaya mentah — dikonfirmasi ulang ke API status. */
export async function handlePakasirWebhook(body: Record<string, unknown>) {
  const orderCode = typeof body.order_id === "string" ? body.order_id : "";
  const txnId = typeof body.txn_id === "string" ? body.txn_id : "";
  const amount = Math.trunc(Number(body.amount));
  if (!orderCode || !txnId || !Number.isFinite(amount)) {
    await logPaymentEvent({ provider: "pakasir", source: "webhook", orderCode: orderCode || null, result: "invalid_payload", payload: body });
    return { status: 400, result: "invalid_payload" };
  }
  if (body.status !== "completed") {
    await logPaymentEvent({ provider: "pakasir", source: "webhook", orderCode, result: `ignored_${String(body.status)}`, payload: body });
    return { status: 200, result: "ignored" };
  }
  const st = await paymentProvider("pakasir").getStatus(txnId); // lempar error → 502, gateway akan mengulang
  if (st.status !== "completed" || st.orderCode !== orderCode || st.amount !== amount) {
    await logPaymentEvent({ provider: "pakasir", source: "webhook", orderCode, result: "not_confirmed", payload: { webhook: body, status: st } });
    return { status: 409, result: "not_confirmed" };
  }
  const r = await applyPaymentCompleted({ provider: "pakasir", source: "webhook", orderCode, txnId, amount, isSandbox: st.isSandbox, payload: body });
  const bad = ["unknown_order", "provider_mismatch", "txn_mismatch", "amount_mismatch", "sandbox_rejected"].includes(r.result);
  return { status: bad ? 422 : 200, result: r.result };
}

/**
 * Refund manual oleh admin: pesanan → refunded, akses produk dicabut, pendapatan seller ditarik lewat baris ledger baru.
 * Uang ke pembeli dikembalikan manual (transfer) — gateway tidak punya API refund.
 */
export async function refundOrder(code: string, admin: Pick<CurrentUser, "id">, reason: string) {
  const r = await db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.code, code)).for("update").limit(1);
    if (!o) throw new OrderError("Pesanan tidak ditemukan.", "not_found");
    if (o.status !== "paid") throw new OrderError("Hanya pesanan lunas yang bisa direfund.");
    const now = new Date();
    await tx.update(orders).set({ status: "refunded", refundedAt: now, refundReason: reason, refundedBy: admin.id, updatedAt: now }).where(eq(orders.id, o.id));
    const revoked = await tx
      .delete(entitlements)
      .where(and(eq(entitlements.userId, o.buyerId), eq(entitlements.productId, o.productId), eq(entitlements.source, "purchase")))
      .returning({ id: entitlements.id });
    if (revoked.length) {
      await tx.update(products).set({ downloadCount: sql`greatest(${products.downloadCount} - 1, 0)` }).where(eq(products.id, o.productId));
    }
    const [sale] = await tx
      .select({ amountIdr: ledgerEntries.amountIdr, availableAt: ledgerEntries.availableAt })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.orderId, o.id), eq(ledgerEntries.kind, "sale")))
      .limit(1);
    if (sale) {
      await tx
        .insert(ledgerEntries)
        .values({ sellerId: o.sellerId, kind: "refund", amountIdr: -sale.amountIdr, orderId: o.id, availableAt: sale.availableAt, memo: `Refund ${o.code}: ${reason}`.slice(0, 300), createdBy: admin.id })
        .onConflictDoNothing();
    }
    return o;
  });
  await logSecurityEvent("order_refunded", { userId: admin.id, meta: { code, amount: r.amountIdr, reason: reason.slice(0, 200) } });
  await logPaymentEvent({ provider: r.provider, source: "admin", orderCode: code, orderId: r.id, result: "refunded", payload: { reason } });
  return r;
}

async function sendReceipt(order: Order) {
  const [buyer] = await db.select({ email: users.email, name: users.displayName }).from(users).where(eq(users.id, order.buyerId)).limit(1);
  if (!buyer) return;
  const base = process.env.APP_URL?.replace(/\/$/, "") ?? "";
  const url = `${base}/pesanan/${order.code}`;
  const rows: [string, string][] = [
    ["Kode pesanan", order.code],
    ["Produk", order.productTitle],
    ["Harga", formatRupiah(order.amountIdr)],
    ["Biaya layanan pembayaran", formatRupiah(order.gatewayFeeIdr)],
    ["Total dibayar", formatRupiah(order.totalPayIdr || order.amountIdr + order.gatewayFeeIdr)],
    ["Metode", paymentMethod(order.paymentMethod)?.label ?? order.paymentMethod],
    ["Waktu", formatDateTime(order.paidAt)],
  ];
  const text = `Halo ${buyer.name},\n\nPembayaran kamu sudah kami terima. Produk sudah ada di Library.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nDetail & bukti bayar: ${url}\n\n— ${SITE.name}`;
  const html = `<p>Halo ${escapeHtml(buyer.name)},</p><p>Pembayaran kamu sudah kami terima. Produk sudah ada di <b>Library</b>.</p><table cellpadding="6" style="border-collapse:collapse">${rows
    .map(([k, v]) => `<tr><td style="color:#64748b">${escapeHtml(k)}</td><td><b>${escapeHtml(v)}</b></td></tr>`)
    .join("")}</table><p><a href="${escapeHtml(url)}">Lihat detail & bukti bayar</a></p><p>— ${escapeHtml(SITE.name)}</p>`;
  await sendEmail({ to: buyer.email, subject: `Bukti pembayaran ${order.code} — ${order.productTitle}`, html, text });
}
