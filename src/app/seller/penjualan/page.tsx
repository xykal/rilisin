import { BadgePercent, Receipt, TrendingUp, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, Card, EmptyState } from "@/components/ui";
import { requireSeller } from "@/lib/auth/guards";
import { formatDate, formatDateTime, formatRupiah } from "@/lib/format";
import { ORDER_STATUS_LABEL } from "@/lib/payments/methods";
import { listSellerSales, sellerSalesSummary } from "@/lib/payments/queries";

export const metadata: Metadata = { title: "Penjualan", robots: { index: false } };

export default async function SellerSalesPage() {
  const user = await requireSeller("/seller/penjualan");
  const [summary, sales] = await Promise.all([sellerSalesSummary(user.id), listSellerSales(user.id)]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Link href="/seller" className="inline-block py-1 text-sm font-semibold text-brand-700 hover:underline">
        ← Seller Center
      </Link>
      <div className="mb-6 mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">Penjualan</h1>
          <p className="text-slate-600">Semua transaksi lunas untuk karyamu. Pembeli ditampilkan sebagai username saja.</p>
        </div>
        <ButtonLink href="/seller/saldo" variant="secondary">
          <Wallet className="h-4 w-4" /> Saldo & pencairan
        </ButtonLink>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Receipt, label: "Total terjual", value: summary.count.toLocaleString("id-ID") + " transaksi" },
          { icon: TrendingUp, label: "Pendapatan bersih (total)", value: formatRupiah(summary.earning) },
          { icon: BadgePercent, label: "30 hari terakhir", value: `${formatRupiah(summary.earning30)} · ${summary.count30}×` },
          { icon: Wallet, label: "Omzet kotor", value: formatRupiah(summary.gross) },
        ].map((s) => (
          <Card key={s.label} className="p-5">
            <s.icon className="h-5 w-5 text-brand-600" />
            <p className="mt-3 text-xl font-extrabold text-ink">{s.value}</p>
            <p className="text-sm text-slate-500">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="mt-8">
        {sales.length === 0 ? (
          <EmptyState icon={<Receipt className="h-10 w-10" />} title="Belum ada penjualan">
            Set harga di karyamu (harga tetap atau bayar seikhlasnya) — begitu ada yang beli, transaksinya muncul di sini.
          </EmptyState>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Waktu</th>
                  <th className="px-4 py-3 font-semibold">Karya</th>
                  <th className="px-4 py-3 font-semibold">Pembeli</th>
                  <th className="px-4 py-3 text-right font-semibold">Harga</th>
                  <th className="px-4 py-3 text-right font-semibold">Komisi</th>
                  <th className="px-4 py-3 text-right font-semibold">Kamu terima</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales.map((s) => {
                  const st = ORDER_STATUS_LABEL[s.status];
                  const held = s.status === "paid" && s.held;
                  return (
                    <tr key={s.code} className="align-top">
                      <td className="px-4 py-3 text-slate-600">
                        {formatDateTime(s.paidAt)}
                        <span className="block font-mono text-[11px] text-slate-400">{s.code}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/p/${s.productSlug}`} className="font-semibold text-ink hover:text-brand-700">
                          {s.productTitle}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">@{s.buyerUsername}</td>
                      <td className="px-4 py-3 text-right font-semibold text-ink">{formatRupiah(s.amountIdr)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {formatRupiah(s.commissionIdr)}
                        <span className="block text-[11px] text-slate-400">{(s.commissionBps / 100).toLocaleString("id-ID")}%</span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">{formatRupiah(s.sellerEarningIdr)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={held ? "amber" : st?.tone}>{held ? `Tertahan s/d ${formatDate(s.availableAt)}` : s.status === "paid" ? "Masuk saldo" : st?.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
