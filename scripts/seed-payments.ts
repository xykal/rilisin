/**
 * Data demo Fase 2: pesanan lunas, refund, buku besar saldo, rekening & pencairan.
 * Angka dibuat konsisten dengan aturan aplikasi (komisi dibulatkan ke bawah, masa tahan 7 hari,
 * pencairan hanya dari saldo yang sudah "cair" pada saat pengajuan).
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../src/lib/db/schema";
import { encryptString } from "../src/lib/security/crypto-core";

type Db = PostgresJsDatabase<typeof schema>;
const DAY = 86_400_000;
const HOLD_DAYS = 7;
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export async function seedPayments(db: Db, ctx: { userIds: Map<string, string>; productIds: Map<string, string>; now: number }) {
  const { userIds, productIds, now } = ctx;
  const ago = (days: number, hours = 0) => new Date(now - days * DAY - hours * 3_600_000);
  const plusDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY);
  const uid = (username: string) => {
    const id = userIds.get(username);
    if (!id) throw new Error(`seed-payments: user ${username} tidak ada`);
    return id;
  };
  const adminId = uid("tim_rilisin");
  const code = (d: Date) => {
    let r = "";
    for (const b of randomBytes(10)) r += ALPHABET[b & 31];
    return `RLS-${d.toISOString().slice(2, 10).replaceAll("-", "")}-${r}`;
  };

  const rows = await db.select({ id: schema.products.id, title: schema.products.title, sellerId: schema.products.sellerId, priceIdr: schema.products.priceIdr }).from(schema.products);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const product = (key: string) => {
    const p = byId.get(productIds.get(key) ?? "");
    if (!p) throw new Error(`seed-payments: produk ${key} tidak ada`);
    return p;
  };

  // Promo seller awal: Rintis Desain komisi 0% sampai 45 hari lagi
  await db.update(schema.sellerProfiles).set({ zeroCommissionUntil: ago(-45) }).where(eq(schema.sellerProfiles.userId, uid("rintisdesain")));

  let orders = 0;
  let txn = 0;
  async function paid(opts: { key: string; buyer: string; daysAgo: number; bps: number; amount?: number; method?: string; refund?: { daysAgo: number; reason: string } }) {
    const p = product(opts.key);
    const amount = opts.amount ?? p.priceIdr;
    const commission = Math.floor((amount * opts.bps) / 10_000);
    const earning = amount - commission;
    const method = opts.method ?? "qris";
    const fee = method === "qris" ? Math.ceil(amount * 0.007) + 310 : 3_500;
    const paidAt = ago(opts.daysAgo, 2 + (orders % 9));
    const createdAt = new Date(paidAt.getTime() - 3 * 60_000);
    const [o] = await db
      .insert(schema.orders)
      .values({
        code: code(createdAt),
        buyerId: uid(opts.buyer),
        sellerId: p.sellerId,
        productId: p.id,
        productTitle: p.title,
        amountIdr: amount,
        gatewayFeeIdr: fee,
        totalPayIdr: amount + fee,
        commissionBps: opts.bps,
        commissionIdr: commission,
        sellerEarningIdr: earning,
        status: opts.refund ? "refunded" : "paid",
        provider: "mock",
        paymentMethod: method,
        providerTxnId: `sim_seed_${++txn}`,
        isSandbox: true,
        expiresAt: new Date(createdAt.getTime() + 30 * 60_000),
        paidAt,
        refundedAt: opts.refund ? ago(opts.refund.daysAgo) : null,
        refundReason: opts.refund?.reason ?? null,
        refundedBy: opts.refund ? adminId : null,
        createdAt,
        updatedAt: opts.refund ? ago(opts.refund.daysAgo) : paidAt,
      })
      .returning({ id: schema.orders.id, code: schema.orders.code });
    const availableAt = plusDays(paidAt, HOLD_DAYS);
    await db.insert(schema.ledgerEntries).values({ sellerId: p.sellerId, kind: "sale", amountIdr: earning, orderId: o!.id, availableAt, memo: `Penjualan ${p.title} (${o!.code})`, createdAt: paidAt });
    if (opts.refund) {
      await db.insert(schema.ledgerEntries).values({ sellerId: p.sellerId, kind: "refund", amountIdr: -earning, orderId: o!.id, availableAt, memo: `Refund ${o!.code}: ${opts.refund.reason}`, createdBy: adminId, createdAt: ago(opts.refund.daysAgo) });
    } else {
      await db.insert(schema.entitlements).values({ userId: uid(opts.buyer), productId: p.id, source: "purchase", createdAt: paidAt }).onConflictDoNothing();
    }
    await db.insert(schema.paymentEvents).values([
      { provider: "mock", source: "create", orderCode: o!.code, orderId: o!.id, result: "created", payload: { method, fee }, createdAt },
      { provider: "mock", source: "simulate", orderCode: o!.code, orderId: o!.id, result: "paid", payload: { amount }, createdAt: paidAt },
      ...(opts.refund ? [{ provider: "mock", source: "admin", orderCode: o!.code, orderId: o!.id, result: "refunded", payload: { reason: opts.refund.reason }, createdAt: ago(opts.refund.daysAgo) }] : []),
    ]);
    orders++;
  }

  const accounts = new Map<string, { method: string; providerName: string; accountHolder: string; accountNumberEnc: string; accountLast4: string }>();
  async function account(username: string, a: { method: "bank" | "ewallet"; providerName: string; number: string; holder: string; verifiedDaysAgo: number | null; updatedDaysAgo: number }) {
    const row = {
      method: a.method,
      providerName: a.providerName,
      accountHolder: a.holder,
      accountNumberEnc: encryptString(a.number, "payout-account"),
      accountLast4: a.number.slice(-4),
    };
    await db.insert(schema.payoutAccounts).values({
      sellerId: uid(username),
      ...row,
      verifiedAt: a.verifiedDaysAgo === null ? null : ago(a.verifiedDaysAgo),
      verifiedBy: a.verifiedDaysAgo === null ? null : adminId,
      updatedAt: ago(a.updatedDaysAgo),
    });
    accounts.set(username, row);
  }

  async function payout(username: string, amount: number, requestedDaysAgo: number, status: "paid" | "requested", transferRef?: string) {
    const snap = accounts.get(username)!;
    const requestedAt = ago(requestedDaysAgo);
    const [p] = await db
      .insert(schema.payouts)
      .values({
        sellerId: uid(username),
        amountIdr: amount,
        status,
        ...snap,
        requestedAt,
        processedAt: status === "paid" ? plusDays(requestedAt, 1) : null,
        processedBy: status === "paid" ? adminId : null,
        transferRef: transferRef ?? null,
      })
      .returning({ id: schema.payouts.id });
    await db.insert(schema.ledgerEntries).values({ sellerId: uid(username), kind: "payout", amountIdr: -amount, payoutId: p!.id, availableAt: requestedAt, memo: `Pencairan ke ${snap.providerName} ••${snap.accountLast4}`, createdAt: requestedAt });
  }

  // ── Nusantara Labs (akun seller demo): KasirKu Pro Rp49.000, komisi 10%
  for (const [buyer, d] of [["andi10", 25], ["siti11", 18], ["budi12", 11], ["dewi13", 4], ["rizky14", 1]] as const) {
    await paid({ key: "kasirkupro", buyer, daysAgo: d, bps: 1000, method: d === 11 ? "bri_va" : "qris" });
  }
  await account("nusantaralabs", { method: "bank", providerName: "BCA", number: "1234567890", holder: "Ahmad Fauzi", verifiedDaysAgo: 30, updatedDaysAgo: 31 });
  await payout("nusantaralabs", 50_000, 10, "paid", "BCA-TRF-2609170001");

  // ── Dapur Kode: Laravel Kasir POS Rp149.000, 1 refund, 1 pencairan menunggu admin
  for (const [buyer, d] of [["nur15", 30], ["fajar16", 20], ["putri17", 9]] as const) {
    await paid({ key: "laravelpos", buyer, daysAgo: d, bps: 1000 });
  }
  await paid({ key: "laravelpos", buyer: "agus18", daysAgo: 15, bps: 1000, refund: { daysAgo: 13, reason: "File zip rusak, seller tidak merespons 3 hari" } });
  await account("dapurkode", { method: "bank", providerName: "BRI", number: "012301001234567", holder: "Rahmat Hidayat", verifiedDaysAgo: 25, updatedDaysAgo: 26 });
  await payout("dapurkode", 250_000, 1, "requested");

  // ── Rintis Desain: UI Kit Ojek Online Rp79.000, promo komisi 0%, rekening e-wallet belum diverifikasi
  for (const [buyer, d] of [["rina", 20], ["indah19", 6], ["yoga20", 2]] as const) {
    await paid({ key: "uikitojol", buyer, daysAgo: d, bps: 0 });
  }
  await account("rintisdesain", { method: "ewallet", providerName: "DANA", number: "081234567890", holder: "Nadia Putri", verifiedDaysAgo: null, updatedDaysAgo: 0.3 });

  // ── Pixel Rantau: Tebak Kata Daerah (bayar seikhlasnya)
  await paid({ key: "tebakkata", buyer: "ratna21", daysAgo: 12, bps: 1000, amount: 15_000 });
  await paid({ key: "tebakkata", buyer: "hendra22", daysAgo: 3, bps: 1000, amount: 25_000 });

  return { orders };
}
