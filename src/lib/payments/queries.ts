import "server-only";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { ledgerEntries, orders, payoutAccounts, payouts, products, sellerProfiles, users } from "@/lib/db/schema";

const num = (v: unknown) => Number(v ?? 0);

export async function getOrderByCode(code: string) {
  if (!/^RLS-\d{6}-[2-9A-HJ-NP-Z]{10}$/.test(code)) return null;
  const [o] = await db
    .select({
      order: orders,
      productSlug: products.slug,
      productIconKey: products.iconKey,
      storeName: sellerProfiles.storeName,
      buyerName: users.displayName,
      buyerUsername: users.username,
    })
    .from(orders)
    .innerJoin(products, eq(products.id, orders.productId))
    .innerJoin(sellerProfiles, eq(sellerProfiles.userId, orders.sellerId))
    .innerJoin(users, eq(users.id, orders.buyerId))
    .where(eq(orders.code, code))
    .limit(1);
  return o ?? null;
}

export async function listBuyerOrders(buyerId: string, limit = 50) {
  return db
    .select({
      code: orders.code,
      productTitle: orders.productTitle,
      productSlug: products.slug,
      iconKey: products.iconKey,
      amountIdr: orders.amountIdr,
      totalPayIdr: orders.totalPayIdr,
      status: orders.status,
      paymentMethod: orders.paymentMethod,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      expiresAt: orders.expiresAt,
    })
    .from(orders)
    .innerJoin(products, eq(products.id, orders.productId))
    .where(eq(orders.buyerId, buyerId))
    .orderBy(desc(orders.createdAt))
    .limit(limit);
}

export async function listSellerSales(sellerId: string, limit = 100) {
  return db
    .select({
      code: orders.code,
      productTitle: orders.productTitle,
      productSlug: products.slug,
      buyerUsername: users.username,
      amountIdr: orders.amountIdr,
      commissionBps: orders.commissionBps,
      commissionIdr: orders.commissionIdr,
      sellerEarningIdr: orders.sellerEarningIdr,
      status: orders.status,
      paidAt: orders.paidAt,
      availableAt: ledgerEntries.availableAt,
      held: sql<boolean>`coalesce(${ledgerEntries.availableAt} > now(), false)`,
    })
    .from(orders)
    .innerJoin(products, eq(products.id, orders.productId))
    .innerJoin(users, eq(users.id, orders.buyerId))
    .leftJoin(ledgerEntries, and(eq(ledgerEntries.orderId, orders.id), eq(ledgerEntries.kind, "sale")))
    .where(and(eq(orders.sellerId, sellerId), inArray(orders.status, ["paid", "refunded"])))
    .orderBy(desc(orders.paidAt))
    .limit(limit);
}

export async function sellerSalesSummary(sellerId: string) {
  const [r] = await db
    .select({
      count: sql`count(*) filter (where ${orders.status} = 'paid')`.mapWith(num),
      gross: sql`coalesce(sum(${orders.amountIdr}) filter (where ${orders.status} = 'paid'), 0)`.mapWith(num),
      earning: sql`coalesce(sum(${orders.sellerEarningIdr}) filter (where ${orders.status} = 'paid'), 0)`.mapWith(num),
      count30: sql`count(*) filter (where ${orders.status} = 'paid' and ${orders.paidAt} >= now() - interval '30 days')`.mapWith(num),
      earning30: sql`coalesce(sum(${orders.sellerEarningIdr}) filter (where ${orders.status} = 'paid' and ${orders.paidAt} >= now() - interval '30 days'), 0)`.mapWith(num),
      refunded: sql`count(*) filter (where ${orders.status} = 'refunded')`.mapWith(num),
    })
    .from(orders)
    .where(eq(orders.sellerId, sellerId));
  return r ?? { count: 0, gross: 0, earning: 0, count30: 0, earning30: 0, refunded: 0 };
}

export async function financeCounts() {
  const [r] = await db
    .select({
      payouts: sql`(select count(*) from payouts where status = 'requested')`.mapWith(num),
      accounts: sql`(select count(*) from payout_accounts where verified_at is null)`.mapWith(num),
    })
    .from(sql`(select 1) as x`);
  return { payouts: r?.payouts ?? 0, accounts: r?.accounts ?? 0, total: (r?.payouts ?? 0) + (r?.accounts ?? 0) };
}

export async function adminFinanceSummary() {
  const [o] = await db
    .select({
      gmv: sql`coalesce(sum(${orders.amountIdr}) filter (where ${orders.status} = 'paid'), 0)`.mapWith(num),
      commission: sql`coalesce(sum(${orders.commissionIdr}) filter (where ${orders.status} = 'paid'), 0)`.mapWith(num),
      paidCount: sql`count(*) filter (where ${orders.status} = 'paid')`.mapWith(num),
      gmv30: sql`coalesce(sum(${orders.amountIdr}) filter (where ${orders.status} = 'paid' and ${orders.paidAt} >= now() - interval '30 days'), 0)`.mapWith(num),
      commission30: sql`coalesce(sum(${orders.commissionIdr}) filter (where ${orders.status} = 'paid' and ${orders.paidAt} >= now() - interval '30 days'), 0)`.mapWith(num),
      pending: sql`count(*) filter (where ${orders.status} = 'pending')`.mapWith(num),
      refunded: sql`coalesce(sum(${orders.amountIdr}) filter (where ${orders.status} = 'refunded'), 0)`.mapWith(num),
    })
    .from(orders);
  const [l] = await db
    .select({
      sellerAvailable: sql`coalesce(sum(${ledgerEntries.amountIdr}) filter (where ${ledgerEntries.availableAt} <= now()), 0)`.mapWith(num),
      sellerHeld: sql`coalesce(sum(${ledgerEntries.amountIdr}) filter (where ${ledgerEntries.availableAt} > now()), 0)`.mapWith(num),
    })
    .from(ledgerEntries);
  const [p] = await db
    .select({
      requested: sql`coalesce(sum(${payouts.amountIdr}) filter (where ${payouts.status} = 'requested'), 0)`.mapWith(num),
      paid: sql`coalesce(sum(${payouts.amountIdr}) filter (where ${payouts.status} = 'paid'), 0)`.mapWith(num),
    })
    .from(payouts);
  return { ...o, ...l, payoutRequested: p?.requested ?? 0, payoutPaid: p?.paid ?? 0 };
}

export async function adminOrders(opts: { status?: string; limit?: number } = {}) {
  const buyer = alias(users, "buyer");
  const where = opts.status && ["pending", "paid", "expired", "canceled", "refunded"].includes(opts.status)
    ? eq(orders.status, opts.status as "pending")
    : undefined;
  return db
    .select({
      code: orders.code,
      productTitle: orders.productTitle,
      storeName: sellerProfiles.storeName,
      buyerUsername: buyer.username,
      amountIdr: orders.amountIdr,
      commissionIdr: orders.commissionIdr,
      status: orders.status,
      provider: orders.provider,
      paymentMethod: orders.paymentMethod,
      isSandbox: orders.isSandbox,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
    })
    .from(orders)
    .innerJoin(sellerProfiles, eq(sellerProfiles.userId, orders.sellerId))
    .innerJoin(buyer, eq(buyer.id, orders.buyerId))
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(opts.limit ?? 50);
}

export async function adminPayoutQueue() {
  return db
    .select({
      id: payouts.id,
      sellerId: payouts.sellerId,
      storeName: sellerProfiles.storeName,
      username: users.username,
      amountIdr: payouts.amountIdr,
      method: payouts.method,
      providerName: payouts.providerName,
      accountHolder: payouts.accountHolder,
      accountNumberEnc: payouts.accountNumberEnc,
      requestedAt: payouts.requestedAt,
    })
    .from(payouts)
    .innerJoin(sellerProfiles, eq(sellerProfiles.userId, payouts.sellerId))
    .innerJoin(users, eq(users.id, payouts.sellerId))
    .where(eq(payouts.status, "requested"))
    .orderBy(payouts.requestedAt);
}

export async function adminRecentPayouts(limit = 15) {
  return db
    .select({
      id: payouts.id,
      storeName: sellerProfiles.storeName,
      amountIdr: payouts.amountIdr,
      status: payouts.status,
      providerName: payouts.providerName,
      accountLast4: payouts.accountLast4,
      processedAt: payouts.processedAt,
      transferRef: payouts.transferRef,
      rejectReason: payouts.rejectReason,
    })
    .from(payouts)
    .innerJoin(sellerProfiles, eq(sellerProfiles.userId, payouts.sellerId))
    .where(gte(payouts.requestedAt, new Date(Date.now() - 90 * 86_400_000)))
    .orderBy(desc(payouts.requestedAt))
    .limit(limit);
}

export async function adminUnverifiedAccounts() {
  return db
    .select({
      sellerId: payoutAccounts.sellerId,
      storeName: sellerProfiles.storeName,
      username: users.username,
      displayName: users.displayName,
      method: payoutAccounts.method,
      providerName: payoutAccounts.providerName,
      accountHolder: payoutAccounts.accountHolder,
      accountLast4: payoutAccounts.accountLast4,
      updatedAt: payoutAccounts.updatedAt,
    })
    .from(payoutAccounts)
    .innerJoin(sellerProfiles, eq(sellerProfiles.userId, payoutAccounts.sellerId))
    .innerJoin(users, eq(users.id, payoutAccounts.sellerId))
    .where(isNull(payoutAccounts.verifiedAt))
    .orderBy(payoutAccounts.updatedAt);
}
