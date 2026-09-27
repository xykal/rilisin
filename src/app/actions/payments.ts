"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireSeller, requireUser } from "@/lib/auth/guards";
import { isStaff } from "@/lib/auth/current-user";
import { applyPaymentCompleted, createOrder, OrderError, refundOrder } from "@/lib/payments/orders";
import { cancelOwnPayout, markPayoutPaid, PayoutError, rejectPayout, requestPayout, savePayoutAccount, verifyPayoutAccount } from "@/lib/payments/payouts";
import { isSimulationMode, paymentProvider } from "@/lib/payments/provider";
import { getOrderByCode } from "@/lib/payments/queries";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import type { FormState } from "./form-state";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const rupiah = (fd: FormData, k: string) => Number(str(fd, k).replace(/[^\d]/g, "") || "0");

function fail(err: unknown, values?: Record<string, string>): FormState {
  if (err instanceof OrderError) return { error: err.message, values };
  if (err instanceof PayoutError) return err.field ? { fieldErrors: { [err.field]: err.message }, values } : { error: err.message, values };
  console.error("[payments] aksi gagal", err);
  return { error: "Terjadi kesalahan. Coba lagi.", values };
}

// ─── Pembeli ────────────────────────────────────────────────────────────────
export async function checkoutAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const productId = str(formData, "productId");
  const slug = str(formData, "slug");
  const user = await requireUser(`/beli/${slug}`);
  const values = { method: str(formData, "method"), amount: str(formData, "amount") };
  let target: string;
  try {
    const r = await createOrder(user, { productId, method: values.method, amount: values.amount ? rupiah(formData, "amount") : null });
    target = r.kind === "claimed" ? `/p/${slug}?diambil=1` : `/pesanan/${r.order.code}`;
  } catch (err) {
    return fail(err, values);
  }
  redirect(target);
}

export async function simulatePaymentAction(formData: FormData) {
  const code = str(formData, "code");
  const user = await requireUser(`/pesanan/${code}`);
  if (!isSimulationMode()) redirect(`/pesanan/${code}`);
  const row = await getOrderByCode(code);
  if (!row || (row.order.buyerId !== user.id && !isStaff(user))) redirect("/akun/pesanan");
  const o = row.order;
  if (o.provider === "mock" && o.status === "pending") {
    await applyPaymentCompleted({ provider: "mock", source: "simulate", orderCode: o.code, txnId: o.providerTxnId, amount: o.amountIdr, isSandbox: true });
  }
  revalidatePath(`/pesanan/${code}`);
  redirect(`/pesanan/${code}`);
}

export async function cancelOrderAction(formData: FormData) {
  const code = str(formData, "code");
  const user = await requireUser(`/pesanan/${code}`);
  const row = await getOrderByCode(code);
  if (row && row.order.buyerId === user.id && row.order.status === "pending") {
    await db.update(orders).set({ status: "canceled", updatedAt: new Date() }).where(and(eq(orders.id, row.order.id), eq(orders.status, "pending")));
    if (row.order.providerTxnId) paymentProvider(row.order.provider).cancel(row.order.providerTxnId).catch(() => {});
  }
  redirect(`/pesanan/${code}`);
}

// ─── Seller ─────────────────────────────────────────────────────────────────
export async function savePayoutAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSeller("/seller/saldo");
  const values = { method: str(formData, "method"), providerName: str(formData, "providerName"), accountHolder: str(formData, "accountHolder") };
  try {
    await savePayoutAccount(user, {
      ...values,
      accountNumber: str(formData, "accountNumber"),
      password: String(formData.get("password") ?? ""),
      code: str(formData, "code") || undefined,
    });
  } catch (err) {
    return fail(err, values);
  }
  revalidatePath("/seller/saldo");
  return { success: "Rekening disimpan. Admin akan memverifikasi nama pemilik rekening sebelum pencairan pertama." };
}

export async function requestPayoutAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSeller("/seller/saldo");
  const values = { amount: str(formData, "amount") };
  try {
    await requestPayout(user, { amount: rupiah(formData, "amount"), password: String(formData.get("password") ?? ""), code: str(formData, "code") || undefined });
  } catch (err) {
    return fail(err, values);
  }
  revalidatePath("/seller/saldo");
  return { success: "Pencairan diajukan. Dana dikirim admin maksimal 2 hari kerja." };
}

export async function cancelPayoutAction(formData: FormData) {
  const user = await requireSeller("/seller/saldo");
  try {
    await cancelOwnPayout(str(formData, "payoutId"), user);
  } catch {
    /* sudah diproses admin → abaikan */
  }
  revalidatePath("/seller/saldo");
  redirect("/seller/saldo");
}

// ─── Admin keuangan ─────────────────────────────────────────────────────────
export async function refundOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin("/admin/keuangan");
  const code = str(formData, "code");
  const reason = str(formData, "reason");
  if (reason.length < 5) return { fieldErrors: { reason: "Tulis alasan refund (min. 5 karakter)." } };
  try {
    await refundOrder(code, admin, reason.slice(0, 300));
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/admin/keuangan`);
  return { success: "Pesanan di-refund: akses produk dicabut & pendapatan seller ditarik. Kembalikan dana ke pembeli lewat transfer." };
}

export async function markPayoutPaidAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin("/admin/keuangan");
  try {
    await markPayoutPaid(str(formData, "payoutId"), admin, str(formData, "transferRef"));
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/admin/keuangan");
  return { success: "Pencairan ditandai terkirim." };
}

export async function rejectPayoutAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin("/admin/keuangan");
  try {
    await rejectPayout(str(formData, "payoutId"), admin, str(formData, "reason"));
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/admin/keuangan");
  return { success: "Pencairan ditolak, dana kembali ke saldo seller." };
}

export async function verifyPayoutAccountAction(formData: FormData) {
  const admin = await requireAdmin("/admin/keuangan");
  await verifyPayoutAccount(str(formData, "sellerId"), admin);
  revalidatePath("/admin/keuangan");
  redirect("/admin/keuangan#rekening");
}
