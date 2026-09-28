import { ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ProductIcon } from "@/components/bits";
import { Badge, ButtonLink, Card, EmptyState } from "@/components/ui";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { requireUser } from "@/lib/auth/guards";
import { formatDateTime, formatRupiah } from "@/lib/format";
import { ORDER_STATUS_LABEL, paymentMethod } from "@/lib/payments/methods";
import { expireOverdueOrders } from "@/lib/payments/orders";
import { listBuyerOrders } from "@/lib/payments/queries";

export const metadata: Metadata = { title: "Pesanan saya", robots: { index: false } };

export default async function MyOrdersPage() {
  const user = await requireUser("/akun/pesanan");
  await expireOverdueOrders();
  const items = await listBuyerOrders(user.id);
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold text-brand-700">Akun</p>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Pesanan saya</h1>
      <p className="mt-1 text-slate-600">Riwayat pembelian & bukti bayar. Produk yang sudah lunas ada di Library.</p>
      <VerifyEmailBanner />
      <div className="mt-6">
        {items.length === 0 ? (
          <EmptyState icon={<ReceiptText className="h-10 w-10" />} title="Belum ada pesanan">
            Karya berbayar yang kamu beli akan muncul di sini.
            <div className="mt-4">
              <ButtonLink href="/jelajahi?harga=berbayar">Lihat karya berbayar</ButtonLink>
            </div>
          </EmptyState>
        ) : (
          <Card className="divide-y divide-slate-100">
            {items.map((o) => {
              const st = ORDER_STATUS_LABEL[o.status];
              return (
                <Link key={o.code} href={`/pesanan/${o.code}`} className="flex items-center gap-3 p-4 hover:bg-slate-50 sm:gap-4">
                  <ProductIcon iconKey={o.iconKey} title={o.productTitle} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{o.productTitle}</p>
                    <p className="truncate text-xs text-slate-500">
                      <span className="font-mono">{o.code}</span> · {formatDateTime(o.paidAt ?? o.createdAt)} · {paymentMethod(o.paymentMethod)?.label ?? o.paymentMethod}
                    </p>
                    <span className="mt-1.5 block sm:hidden">
                      <Badge tone={st?.tone}>{st?.label ?? o.status}</Badge>
                    </span>
                  </div>
                  <span className="shrink-0 text-right text-sm font-bold text-ink">{formatRupiah(o.totalPayIdr || o.amountIdr)}</span>
                  <span className="shrink-0 max-sm:hidden">
                    <Badge tone={st?.tone}>{st?.label ?? o.status}</Badge>
                  </span>
                </Link>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
