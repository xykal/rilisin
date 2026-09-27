import { BadgeCheck, Clock, Hourglass, Landmark, Send, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { cancelPayoutAction } from "@/app/actions/payments";
import { PayoutAccountForm, PayoutRequestForm } from "@/components/payment-forms";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Card } from "@/components/ui";
import { requireSeller } from "@/lib/auth/guards";
import { formatDate, formatDateTime, formatRupiah } from "@/lib/format";
import { PAYOUT_STATUS_LABEL } from "@/lib/payments/methods";
import { getPayoutAccount, listSellerPayouts, sellerBalance } from "@/lib/payments/payouts";
import { PAYMENT_CONFIG } from "@/lib/payments/provider";

export const metadata: Metadata = { title: "Saldo & pencairan", robots: { index: false } };

export default async function SellerBalancePage() {
  const user = await requireSeller("/seller/saldo");
  const [bal, account, history] = await Promise.all([sellerBalance(user.id), getPayoutAccount(user.id), listSellerPayouts(user.id)]);
  const min = PAYMENT_CONFIG.payoutMin();
  const open = history.find((p) => p.status === "requested");
  const blocker = !account
    ? "Isi rekening pencairan dulu (di bawah)."
    : !account.verifiedAt
      ? "Rekening sedang diverifikasi admin (biasanya < 1 hari kerja)."
      : open
        ? "Masih ada pencairan yang sedang diproses."
        : bal.available < min
          ? `Saldo tersedia belum mencapai minimal ${formatRupiah(min)}.`
          : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link href="/seller" className="inline-block py-1 text-sm font-semibold text-brand-700 hover:underline">
        ← Seller Center
      </Link>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-ink">Saldo & pencairan</h1>
      <p className="text-slate-600">
        Pendapatan tiap penjualan ditahan {PAYMENT_CONFIG.holdDays()} hari (jaga-jaga refund), lalu bisa dicairkan ke rekening / e-wallet.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-emerald-200 bg-emerald-50/50 p-5">
          <Wallet className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-2xl font-extrabold text-ink">{formatRupiah(bal.available)}</p>
          <p className="text-sm text-slate-600">Tersedia dicairkan</p>
        </Card>
        <Card className="p-5">
          <Hourglass className="h-5 w-5 text-amber-600" />
          <p className="mt-3 text-2xl font-extrabold text-ink">{formatRupiah(bal.held)}</p>
          <p className="text-sm text-slate-500">Tertahan{bal.nextRelease ? ` · cair berikutnya ${formatDate(bal.nextRelease)}` : ""}</p>
        </Card>
        <Card className="p-5">
          <Clock className="h-5 w-5 text-sky-600" />
          <p className="mt-3 text-2xl font-extrabold text-ink">{formatRupiah(bal.inProcess)}</p>
          <p className="text-sm text-slate-500">Sedang diproses</p>
        </Card>
        <Card className="p-5">
          <Send className="h-5 w-5 text-brand-600" />
          <p className="mt-3 text-2xl font-extrabold text-ink">{formatRupiah(bal.paidOut)}</p>
          <p className="text-sm text-slate-500">Sudah dicairkan</p>
        </Card>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
            <Send className="h-5 w-5 text-brand-600" /> Cairkan dana
          </h2>
          {blocker ? (
            <Alert tone="info" className="mt-4">
              {blocker}
            </Alert>
          ) : (
            <div className="mt-4">
              <PayoutRequestForm available={bal.available} min={min} mfaEnabled={user.mfaEnabled} />
            </div>
          )}
          {!user.mfaEnabled && (
            <p className="mt-4 text-xs text-amber-700">
              Saran keras: aktifkan <Link href="/akun/keamanan" className="font-semibold underline">2FA</Link> — kalau password bocor, pencairan tetap butuh kode dari HP kamu.
            </p>
          )}
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
            <Landmark className="h-5 w-5 text-brand-600" /> Rekening pencairan
          </h2>
          {account && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm">
              <span>
                <b className="text-ink">{account.providerName}</b> ••{account.accountLast4} · a.n. {account.accountHolder}
              </span>
              {account.verifiedAt ? (
                <Badge tone="green">
                  <BadgeCheck className="h-3.5 w-3.5" /> Terverifikasi
                </Badge>
              ) : (
                <Badge tone="amber">Menunggu verifikasi</Badge>
              )}
            </div>
          )}
          <div className="mt-4">
            <PayoutAccountForm current={account} mfaEnabled={user.mfaEnabled} />
          </div>
        </Card>
      </div>

      <h2 className="mt-10 text-lg font-bold text-ink">Riwayat pencairan</h2>
      {history.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Belum ada pencairan.</p>
      ) : (
        <Card className="mt-3 divide-y divide-slate-100">
          {history.map((p) => {
            const st = PAYOUT_STATUS_LABEL[p.status];
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-ink">{formatRupiah(p.amountIdr)}</p>
                  <p className="text-xs text-slate-500">
                    ke {p.providerName} ••{p.accountLast4} · diajukan {formatDateTime(p.requestedAt)}
                    {p.processedAt ? ` · diproses ${formatDateTime(p.processedAt)}` : ""}
                  </p>
                  {p.transferRef && <p className="text-xs text-emerald-700">Ref. transfer: {p.transferRef}</p>}
                  {p.rejectReason && <p className="text-xs text-red-700">Alasan: {p.rejectReason}</p>}
                </div>
                <Badge tone={st?.tone}>{st?.label ?? p.status}</Badge>
                {p.status === "requested" && (
                  <form action={cancelPayoutAction}>
                    <input type="hidden" name="payoutId" value={p.id} />
                    <SubmitButton variant="ghost" className="!px-2 !py-1 text-xs text-slate-500" confirm="Batalkan pengajuan pencairan ini?">
                      Batalkan
                    </SubmitButton>
                  </form>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
