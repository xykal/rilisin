import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RefundForm } from "@/components/payment-forms";
import { Badge, Card } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { ledgerEntries, paymentEvents } from "@/lib/db/schema";
import { formatDateTime, formatRupiah } from "@/lib/format";
import { ORDER_STATUS_LABEL, paymentMethod } from "@/lib/payments/methods";
import { getOrderByCode } from "@/lib/payments/queries";

export const metadata: Metadata = { title: "Detail pesanan" };

export default async function AdminOrderPage({ params }: PageProps<"/admin/keuangan/pesanan/[code]">) {
  await requireAdmin("/admin/keuangan");
  const { code } = await params;
  const row = await getOrderByCode(code);
  if (!row) notFound();
  const o = row.order;
  const [events, ledger] = await Promise.all([
    db.select().from(paymentEvents).where(eq(paymentEvents.orderId, o.id)).orderBy(desc(paymentEvents.createdAt)).limit(30),
    db.select().from(ledgerEntries).where(eq(ledgerEntries.orderId, o.id)).orderBy(ledgerEntries.id),
  ]);
  const st = ORDER_STATUS_LABEL[o.status];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/admin/keuangan#pesanan" className="inline-block py-1 text-sm font-semibold text-brand-700 hover:underline">
        ← Keuangan
      </Link>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-mono text-2xl font-extrabold text-ink">{o.code}</h1>
        <Badge tone={st?.tone} className="!text-sm">
          {st?.label ?? o.status}
        </Badge>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-bold text-ink">Rincian</h2>
          <dl className="mt-3 divide-y divide-slate-100 text-sm">
            {[
              ["Karya", o.productTitle],
              ["Seller", row.storeName],
              ["Pembeli", `${row.buyerName} (@${row.buyerUsername})`],
              ["Harga", formatRupiah(o.amountIdr)],
              ["Komisi", `${formatRupiah(o.commissionIdr)} (${(o.commissionBps / 100).toLocaleString("id-ID")}%)`],
              ["Hak seller", formatRupiah(o.sellerEarningIdr)],
              ["Biaya gateway (dibayar pembeli)", formatRupiah(o.gatewayFeeIdr)],
              ["Gateway · metode", `${o.provider} · ${paymentMethod(o.paymentMethod)?.label ?? o.paymentMethod}${o.isSandbox ? " · sandbox" : ""}`],
              ["ID transaksi gateway", o.providerTxnId ?? "-"],
              ["Dibuat", formatDateTime(o.createdAt)],
              ["Dibayar", formatDateTime(o.paidAt)],
              ...(o.refundedAt ? [["Refund", `${formatDateTime(o.refundedAt)} — ${o.refundReason ?? ""}`]] : []),
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2">
                <dt className="text-slate-500">{k}</dt>
                <dd className="break-all text-right font-semibold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-bold text-ink">Buku besar seller</h2>
            {ledger.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Belum ada mutasi.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-sm">
                {ledger.map((l) => (
                  <li key={l.id} className="flex justify-between gap-3">
                    <span className="text-slate-600">
                      {l.kind} · cair {formatDateTime(l.availableAt)}
                    </span>
                    <b className={l.amountIdr < 0 ? "text-red-600" : "text-emerald-700"}>{formatRupiah(l.amountIdr)}</b>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {o.status === "paid" && (
            <Card className="p-5">
              <h2 className="font-bold text-ink">Refund</h2>
              <p className="mb-3 mt-1 text-sm text-slate-500">Untuk file rusak, tidak sesuai deskripsi, atau penipuan. Uang ke pembeli dikembalikan manual.</p>
              <RefundForm code={o.code} />
            </Card>
          )}
        </div>
      </div>

      <Card className="mt-6 p-5">
        <h2 className="font-bold text-ink">Log event pembayaran</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {events.map((e) => (
            <li key={e.id} className="rounded-lg bg-slate-50 p-2.5">
              <span className="font-semibold text-ink">
                {e.source} → {e.result}
              </span>{" "}
              <span className="text-slate-500">· {formatDateTime(e.createdAt)}</span>
              {e.payload && <code className="mt-1 block break-all font-mono text-[11px] text-slate-500">{JSON.stringify(e.payload).slice(0, 400)}</code>}
            </li>
          ))}
          {events.length === 0 && <li className="text-slate-500">Belum ada event.</li>}
        </ul>
      </Card>
    </div>
  );
}
