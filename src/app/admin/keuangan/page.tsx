import { BadgeCheck, Banknote, Coins, Hourglass, Landmark, Receipt, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { verifyPayoutAccountAction } from "@/app/actions/payments";
import { CopyButton, PayoutProcessForms } from "@/components/payment-forms";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Card, EmptyState } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/guards";
import { formatDateTime, formatRupiah, timeAgo } from "@/lib/format";
import { ORDER_STATUS_LABEL, paymentMethod, PAYOUT_STATUS_LABEL } from "@/lib/payments/methods";
import { expireOverdueOrders } from "@/lib/payments/orders";
import { revealAccountNumber } from "@/lib/payments/payouts";
import { isSimulationMode, paymentProviderId } from "@/lib/payments/provider";
import { adminFinanceSummary, adminOrders, adminPayoutQueue, adminRecentPayouts, adminUnverifiedAccounts } from "@/lib/payments/queries";

export const metadata: Metadata = { title: "Keuangan" };

const FILTERS = [
  { v: "", label: "Semua" },
  { v: "paid", label: "Lunas" },
  { v: "pending", label: "Menunggu" },
  { v: "refunded", label: "Refund" },
  { v: "expired", label: "Kedaluwarsa" },
];

export default async function FinancePage({ searchParams }: PageProps<"/admin/keuangan">) {
  await requireAdmin("/admin/keuangan");
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";
  await expireOverdueOrders();
  const [sum, queue, accounts, recentOrders, recentPayouts] = await Promise.all([
    adminFinanceSummary(),
    adminPayoutQueue(),
    adminUnverifiedAccounts(),
    adminOrders({ status, limit: 40 }),
    adminRecentPayouts(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">Keuangan</h1>
          <p className="text-slate-600">Pesanan, komisi, saldo seller, dan antrian pencairan. Hanya admin.</p>
        </div>
        <Badge tone={isSimulationMode() ? "amber" : "green"} className="!text-sm">
          Gateway: {paymentProviderId() === "pakasir" ? "Pakasir" : "Simulasi"}
        </Badge>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Receipt, label: "Omzet 30 hari (GMV)", value: formatRupiah(sum.gmv30 ?? 0), sub: `Total ${formatRupiah(sum.gmv ?? 0)} · ${sum.paidCount ?? 0} transaksi` },
          { icon: Coins, label: "Komisi 30 hari", value: formatRupiah(sum.commission30 ?? 0), sub: `Total ${formatRupiah(sum.commission ?? 0)}` },
          { icon: Hourglass, label: "Saldo seller tertahan", value: formatRupiah(sum.sellerHeld ?? 0), sub: `Tersedia ${formatRupiah(sum.sellerAvailable ?? 0)}` },
          { icon: Banknote, label: "Pencairan diproses", value: formatRupiah(sum.payoutRequested), sub: `Sudah dikirim ${formatRupiah(sum.payoutPaid)}` },
        ].map((s) => (
          <Card key={s.label} className="p-5">
            <s.icon className="h-5 w-5 text-brand-600" />
            <p className="mt-3 text-xl font-extrabold text-ink">{s.value}</p>
            <p className="text-sm font-medium text-slate-600">{s.label}</p>
            <p className="text-xs text-slate-400">{s.sub}</p>
          </Card>
        ))}
      </div>

      <section className="mt-10" id="pencairan">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <Wallet className="h-5 w-5 text-brand-600" /> Pencairan menunggu <Badge tone="amber">{queue.length}</Badge>
        </h2>
        <p className="text-sm text-slate-500">Transfer manual dari rekening platform, lalu isi nomor referensinya. Tolak = dana kembali ke saldo seller.</p>
        {queue.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="Tidak ada pencairan yang menunggu" />
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {queue.map((p) => {
              const number = revealAccountNumber(p.accountNumberEnc);
              return (
                <Card key={p.id} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xl font-extrabold text-ink">{formatRupiah(p.amountIdr)}</p>
                      <p className="text-sm text-slate-600">
                        {p.storeName} (@{p.username}) · diajukan {timeAgo(p.requestedAt)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 text-sm">
                      <p className="font-semibold text-ink">
                        {p.providerName} · {p.method === "bank" ? "rekening" : "e-wallet"}
                      </p>
                      <p className="flex flex-wrap items-center gap-2 font-mono text-base font-bold text-ink">
                        {number} <CopyButton text={number} />
                      </p>
                      <p className="text-slate-600">a.n. {p.accountHolder}</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <PayoutProcessForms payoutId={p.id} />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-10" id="rekening">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <Landmark className="h-5 w-5 text-brand-600" /> Rekening perlu verifikasi <Badge tone="amber">{accounts.length}</Badge>
        </h2>
        <p className="text-sm text-slate-500">Cocokkan nama pemilik rekening dengan identitas seller sebelum pencairan pertama. Rekening yang diganti wajib dicek ulang.</p>
        {accounts.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Semua rekening sudah terverifikasi.</p>
        ) : (
          <Card className="mt-3 divide-y divide-slate-100">
            {accounts.map((a) => (
              <div key={a.sellerId} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">
                    {a.storeName} <span className="font-normal text-slate-500">(@{a.username} · {a.displayName})</span>
                  </p>
                  <p className="text-slate-600">
                    {a.providerName} ••{a.accountLast4} · a.n. <b>{a.accountHolder}</b> · diubah {timeAgo(a.updatedAt)}
                  </p>
                </div>
                <form action={verifyPayoutAccountAction}>
                  <input type="hidden" name="sellerId" value={a.sellerId} />
                  <SubmitButton variant="success" className="!py-2" pendingText="Menyimpan…">
                    <BadgeCheck className="h-4 w-4" /> Nama cocok, verifikasi
                  </SubmitButton>
                </form>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className="mt-10" id="pesanan">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
            <Receipt className="h-5 w-5 text-brand-600" /> Pesanan
          </h2>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <Link
                key={f.v}
                href={f.v ? `/admin/keuangan?status=${f.v}#pesanan` : "/admin/keuangan#pesanan"}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status === f.v ? "bg-ink text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>
        {sum.pending ? <Alert className="mt-3">{sum.pending} pesanan masih menunggu pembayaran.</Alert> : null}
        <Card className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Kode</th>
                <th className="px-4 py-3 font-semibold">Karya · seller</th>
                <th className="px-4 py-3 font-semibold">Pembeli</th>
                <th className="px-4 py-3 text-right font-semibold">Harga</th>
                <th className="px-4 py-3 text-right font-semibold">Komisi</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentOrders.map((o) => {
                const st = ORDER_STATUS_LABEL[o.status];
                return (
                  <tr key={o.code}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/keuangan/pesanan/${o.code}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">
                        {o.code}
                      </Link>
                      <span className="block text-[11px] text-slate-400">
                        {formatDateTime(o.paidAt ?? o.createdAt)} · {paymentMethod(o.paymentMethod)?.label ?? o.paymentMethod}
                        {o.isSandbox ? " · sandbox" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-ink">{o.productTitle}</span>
                      <span className="block text-xs text-slate-500">{o.storeName}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">@{o.buyerUsername}</td>
                    <td className="px-4 py-3 text-right font-semibold text-ink">{formatRupiah(o.amountIdr)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{formatRupiah(o.commissionIdr)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={st?.tone}>{st?.label ?? o.status}</Badge>
                    </td>
                  </tr>
                );
              })}
              {recentOrders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Belum ada pesanan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold text-ink">Riwayat pencairan (90 hari)</h2>
        <Card className="mt-3 divide-y divide-slate-100">
          {recentPayouts.map((p) => {
            const st = PAYOUT_STATUS_LABEL[p.status];
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">
                    {formatRupiah(p.amountIdr)} · {p.storeName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {p.providerName} ••{p.accountLast4}
                    {p.processedAt ? ` · ${formatDateTime(p.processedAt)}` : ""}
                    {p.transferRef ? ` · ref ${p.transferRef}` : ""}
                    {p.rejectReason ? ` · ${p.rejectReason}` : ""}
                  </p>
                </div>
                <Badge tone={st?.tone}>{st?.label ?? p.status}</Badge>
              </div>
            );
          })}
          {recentPayouts.length === 0 && <p className="p-4 text-sm text-slate-500">Belum ada.</p>}
        </Card>
      </section>
    </div>
  );
}
