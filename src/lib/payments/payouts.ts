import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import type { CurrentUser } from "@/lib/auth/current-user";
import { verifySecondFactor } from "@/lib/auth/mfa";
import { verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { ledgerEntries, payoutAccounts, payouts, users } from "@/lib/db/schema";
import { formatRupiah } from "@/lib/format";
import { sharedLimit } from "@/lib/rate-limit";
import { decryptString, encryptString } from "@/lib/security/crypto";
import { notifyAndEmail } from "@/lib/notifications/server";
import { logSecurityEvent } from "@/lib/security/events";
import { PAYOUT_PROVIDERS } from "./methods";
import { PAYMENT_CONFIG } from "./provider";

export class PayoutError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "PayoutError";
  }
}

const ACCOUNT_PURPOSE = "payout-account";
const num = (v: unknown) => Number(v ?? 0);

/** Saldo dihitung langsung dari buku besar (tidak ada kolom saldo yang bisa "melenceng"). */
export async function sellerBalance(sellerId: string) {
  const [l] = await db
    .select({
      available: sql`coalesce(sum(${ledgerEntries.amountIdr}) filter (where ${ledgerEntries.availableAt} <= now()), 0)`.mapWith(num),
      held: sql`coalesce(sum(${ledgerEntries.amountIdr}) filter (where ${ledgerEntries.availableAt} > now()), 0)`.mapWith(num),
      earned: sql`coalesce(sum(${ledgerEntries.amountIdr}) filter (where ${ledgerEntries.kind} in ('sale', 'refund')), 0)`.mapWith(num),
      nextRelease: sql<Date | null>`min(${ledgerEntries.availableAt}) filter (where ${ledgerEntries.availableAt} > now() and ${ledgerEntries.kind} = 'sale')`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.sellerId, sellerId));
  const [p] = await db
    .select({
      paidOut: sql`coalesce(sum(${payouts.amountIdr}) filter (where ${payouts.status} = 'paid'), 0)`.mapWith(num),
      inProcess: sql`coalesce(sum(${payouts.amountIdr}) filter (where ${payouts.status} = 'requested'), 0)`.mapWith(num),
    })
    .from(payouts)
    .where(eq(payouts.sellerId, sellerId));
  return {
    available: l?.available ?? 0,
    held: l?.held ?? 0,
    earned: l?.earned ?? 0,
    nextRelease: l?.nextRelease ? new Date(l.nextRelease) : null,
    paidOut: p?.paidOut ?? 0,
    inProcess: p?.inProcess ?? 0,
  };
}

export async function getPayoutAccount(sellerId: string) {
  const [a] = await db
    .select({
      method: payoutAccounts.method,
      providerName: payoutAccounts.providerName,
      accountHolder: payoutAccounts.accountHolder,
      accountLast4: payoutAccounts.accountLast4,
      verifiedAt: payoutAccounts.verifiedAt,
      updatedAt: payoutAccounts.updatedAt,
    })
    .from(payoutAccounts)
    .where(eq(payoutAccounts.sellerId, sellerId))
    .limit(1);
  return a ?? null;
}

export async function listSellerPayouts(sellerId: string, limit = 20) {
  return db
    .select({
      id: payouts.id,
      amountIdr: payouts.amountIdr,
      status: payouts.status,
      providerName: payouts.providerName,
      accountLast4: payouts.accountLast4,
      requestedAt: payouts.requestedAt,
      processedAt: payouts.processedAt,
      transferRef: payouts.transferRef,
      rejectReason: payouts.rejectReason,
    })
    .from(payouts)
    .where(eq(payouts.sellerId, sellerId))
    .orderBy(desc(payouts.requestedAt))
    .limit(limit);
}

/** Konfirmasi ulang identitas untuk aksi uang: password (+ kode 2FA kalau aktif). */
async function stepUp(user: Pick<CurrentUser, "id">, password: string, code: string | undefined, action: string) {
  if (!(await sharedLimit(`stepup:${user.id}`, 8, 15 * 60_000)).ok) throw new PayoutError("Terlalu banyak percobaan. Coba lagi 15 menit lagi.", "password");
  const [u] = await db.select({ passwordHash: users.passwordHash, totpEnabledAt: users.totpEnabledAt }).from(users).where(eq(users.id, user.id)).limit(1);
  // passwordHash null = akun daftar-via-Google: harus buat password dulu di /akun/keamanan.
  if (!u || !u.passwordHash || !(await verifyPassword(password, u.passwordHash))) {
    await logSecurityEvent("payout_step_up_failed", { userId: user.id, meta: { action, reason: "password" } });
    throw new PayoutError("Password salah.", "password");
  }
  if (u.totpEnabledAt) {
    const ok = code ? await verifySecondFactor(user.id, code) : null;
    if (!ok) {
      await logSecurityEvent("payout_step_up_failed", { userId: user.id, meta: { action, reason: "2fa" } });
      throw new PayoutError("Kode 2FA salah atau kosong.", "code");
    }
  }
}

export async function savePayoutAccount(
  user: Pick<CurrentUser, "id">,
  input: { method: string; providerName: string; accountNumber: string; accountHolder: string; password: string; code?: string },
) {
  const method = input.method === "ewallet" ? "ewallet" : input.method === "bank" ? "bank" : null;
  if (!method) throw new PayoutError("Pilih jenis rekening.", "method");
  const providers = PAYOUT_PROVIDERS[method] as readonly string[];
  if (!providers.includes(input.providerName)) throw new PayoutError("Pilih bank / e-wallet dari daftar.", "providerName");
  const number = input.accountNumber.replace(/[\s.-]/g, "");
  if (method === "bank" && !/^\d{6,20}$/.test(number)) throw new PayoutError("Nomor rekening 6–20 digit angka.", "accountNumber");
  if (method === "ewallet" && !/^(08|628)\d{8,12}$/.test(number)) throw new PayoutError("Nomor e-wallet = nomor HP (08… atau 628…).", "accountNumber");
  const holder = input.accountHolder.trim().replace(/\s+/g, " ");
  if (!/^[\p{L}][\p{L} .,'-]{2,59}$/u.test(holder)) throw new PayoutError("Nama pemilik rekening 3–60 huruf, sesuai buku tabungan / aplikasi.", "accountHolder");
  await stepUp(user, input.password, input.code, "payout_account");

  const values = {
    method,
    providerName: input.providerName,
    accountHolder: holder,
    accountNumberEnc: encryptString(number, ACCOUNT_PURPOSE),
    accountLast4: number.slice(-4),
    verifiedAt: null,
    verifiedBy: null,
    updatedAt: new Date(),
  };
  await db
    .insert(payoutAccounts)
    .values({ sellerId: user.id, ...values })
    .onConflictDoUpdate({ target: payoutAccounts.sellerId, set: values });
  await logSecurityEvent("payout_account_changed", { userId: user.id, meta: { method, provider: input.providerName, last4: values.accountLast4 } });
}

export async function requestPayout(user: Pick<CurrentUser, "id">, input: { amount: number; password: string; code?: string }) {
  const min = PAYMENT_CONFIG.payoutMin();
  const amount = Math.trunc(input.amount);
  if (!Number.isFinite(amount) || amount < min) throw new PayoutError(`Minimal pencairan ${formatRupiah(min)}.`, "amount");
  await stepUp(user, input.password, input.code, "payout_request");

  const payout = await db.transaction(async (tx) => {
    // Kunci per seller → dua pengajuan bersamaan tidak bisa sama-sama lolos cek saldo
    await tx.execute(sql`select 1 from seller_profiles where user_id = ${user.id} for update`);
    const [acct] = await tx.select().from(payoutAccounts).where(eq(payoutAccounts.sellerId, user.id)).limit(1);
    if (!acct) throw new PayoutError("Isi rekening pencairan dulu.", "amount");
    if (!acct.verifiedAt) throw new PayoutError("Rekening belum diverifikasi admin (biasanya < 1 hari kerja).", "amount");
    const [open] = await tx.select({ id: payouts.id }).from(payouts).where(and(eq(payouts.sellerId, user.id), eq(payouts.status, "requested"))).limit(1);
    if (open) throw new PayoutError("Masih ada pencairan yang sedang diproses.", "amount");
    const [bal] = await tx
      .select({ available: sql`coalesce(sum(${ledgerEntries.amountIdr}) filter (where ${ledgerEntries.availableAt} <= now()), 0)`.mapWith(num) })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.sellerId, user.id));
    const available = bal?.available ?? 0;
    if (amount > available) throw new PayoutError(`Saldo tersedia hanya ${formatRupiah(Math.max(0, available))}.`, "amount");
    const [p] = await tx
      .insert(payouts)
      .values({
        sellerId: user.id,
        amountIdr: amount,
        method: acct.method,
        providerName: acct.providerName,
        accountHolder: acct.accountHolder,
        accountNumberEnc: acct.accountNumberEnc,
        accountLast4: acct.accountLast4,
      })
      .returning();
    await tx.insert(ledgerEntries).values({
      sellerId: user.id,
      kind: "payout",
      amountIdr: -amount,
      payoutId: p.id,
      availableAt: new Date(),
      memo: `Pencairan ke ${acct.providerName} ••${acct.accountLast4}`,
    });
    return p;
  });
  await logSecurityEvent("payout_requested", { userId: user.id, meta: { payoutId: payout.id, amount } });
  return payout;
}

async function closePayout(payoutId: string, by: Pick<CurrentUser, "id">, next: "paid" | "rejected" | "canceled", opts: { transferRef?: string; reason?: string; ownerId?: string }) {
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(payouts).where(eq(payouts.id, payoutId)).for("update").limit(1);
    if (!p) throw new PayoutError("Pencairan tidak ditemukan.");
    if (opts.ownerId && p.sellerId !== opts.ownerId) throw new PayoutError("Pencairan tidak ditemukan.");
    if (p.status !== "requested") throw new PayoutError("Pencairan ini sudah diproses.");
    const now = new Date();
    await tx
      .update(payouts)
      .set({
        status: next,
        processedAt: now,
        processedBy: by.id,
        transferRef: next === "paid" ? opts.transferRef ?? null : null,
        rejectReason: next !== "paid" ? opts.reason ?? null : null,
      })
      .where(eq(payouts.id, p.id));
    if (next !== "paid") {
      await tx
        .insert(ledgerEntries)
        .values({
          sellerId: p.sellerId,
          kind: "payout_reversal",
          amountIdr: p.amountIdr,
          payoutId: p.id,
          availableAt: now,
          memo: next === "rejected" ? `Pencairan ditolak: ${opts.reason ?? "-"}`.slice(0, 300) : "Pencairan dibatalkan",
          createdBy: by.id,
        })
        .onConflictDoNothing();
    }
    return p;
  });
}

export async function markPayoutPaid(payoutId: string, admin: Pick<CurrentUser, "id">, transferRef: string) {
  const ref = transferRef.trim();
  if (ref.length < 4 || ref.length > 80) throw new PayoutError("Isi nomor referensi transfer (4–80 karakter).", "transferRef");
  const p = await closePayout(payoutId, admin, "paid", { transferRef: ref });
  await logSecurityEvent("payout_paid", { userId: admin.id, meta: { payoutId, sellerId: p.sellerId, amount: p.amountIdr } });
  await notifyAndEmail({ userId: p.sellerId, type: "payout_paid", url: "/seller/saldo", data: { amount: p.amountIdr, transferRef: ref } });
}

export async function rejectPayout(payoutId: string, admin: Pick<CurrentUser, "id">, reason: string) {
  const r = reason.trim();
  if (r.length < 5) throw new PayoutError("Tulis alasan penolakan (min. 5 karakter).", "reason");
  const p = await closePayout(payoutId, admin, "rejected", { reason: r.slice(0, 300) });
  await logSecurityEvent("payout_rejected", { userId: admin.id, meta: { payoutId, sellerId: p.sellerId, amount: p.amountIdr } });
  await notifyAndEmail({ userId: p.sellerId, type: "payout_rejected", url: "/seller/saldo", data: { amount: p.amountIdr, reason: r.slice(0, 300) } });
}

export async function cancelOwnPayout(payoutId: string, seller: Pick<CurrentUser, "id">) {
  await closePayout(payoutId, seller, "canceled", { ownerId: seller.id });
  await logSecurityEvent("payout_canceled", { userId: seller.id, meta: { payoutId } });
}

export async function verifyPayoutAccount(sellerId: string, admin: Pick<CurrentUser, "id">) {
  const r = await db
    .update(payoutAccounts)
    .set({ verifiedAt: new Date(), verifiedBy: admin.id })
    .where(eq(payoutAccounts.sellerId, sellerId))
    .returning({ sellerId: payoutAccounts.sellerId });
  if (!r.length) throw new PayoutError("Rekening tidak ditemukan.");
  await logSecurityEvent("payout_account_verified", { userId: admin.id, meta: { sellerId } });
}

/** Nomor rekening lengkap hanya didekripsi untuk admin di halaman proses pencairan. */
export function revealAccountNumber(enc: string) {
  return decryptString(enc, ACCOUNT_PURPOSE) ?? "(gagal dekripsi — cek APP_SECRET)";
}
