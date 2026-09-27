import { ArrowLeft, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProductIcon } from "@/components/bits";
import { CheckoutForm } from "@/components/payment-forms";
import { Alert, Card } from "@/components/ui";
import { requireUser } from "@/lib/auth/guards";
import { formatRupiah } from "@/lib/format";
import { getCheckoutProduct, ownsProduct } from "@/lib/payments/orders";
import { isSimulationMode, paymentProvider, PAYMENT_CONFIG } from "@/lib/payments/provider";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage({ params }: PageProps<"/beli/[slug]">) {
  const { slug } = await params;
  const user = await requireUser(`/beli/${slug}`);
  const p = await getCheckoutProduct(slug);
  if (!p || p.status !== "published") notFound();
  if (p.pricingModel === "free" || p.sellerId === user.id) redirect(`/p/${slug}`);
  if (await ownsProduct(user.id, p.id)) redirect(`/p/${slug}`);

  let fees: Record<string, number> | null = null;
  let unavailable = false;
  try {
    const provider = paymentProvider();
    fees = p.pricingModel === "fixed" ? await provider.feeTable(p.priceIdr) : null;
  } catch {
    unavailable = true;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <Link href={`/p/${slug}`} className="inline-flex items-center gap-1.5 py-1 text-sm font-semibold text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Kembali ke produk
      </Link>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">Checkout</h1>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-5 sm:p-7">
          {unavailable ? (
            <Alert tone="danger" title="Pembayaran sedang tidak tersedia">
              Gateway pembayaran belum dikonfigurasi atau sedang bermasalah. Coba lagi nanti.
            </Alert>
          ) : (
            <CheckoutForm
              product={{ id: p.id, slug: p.slug, pricingModel: p.pricingModel as "fixed" | "pwyw", priceIdr: p.priceIdr, minPriceIdr: p.minPriceIdr }}
              fees={fees}
              simulation={isSimulationMode()}
            />
          )}
        </Card>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <ProductIcon iconKey={p.iconKey} title={p.title} size={56} />
              <div className="min-w-0">
                <p className="font-bold text-ink">{p.title}</p>
                <p className="truncate text-sm text-slate-500">oleh {p.storeName}</p>
              </div>
            </div>
            <p className="mt-3 line-clamp-3 text-sm text-slate-600">{p.summary}</p>
            <p className="mt-3 border-t border-slate-100 pt-3 text-sm font-semibold text-ink">
              {p.pricingModel === "pwyw" ? (p.minPriceIdr > 0 ? `Bayar seikhlasnya · min. ${formatRupiah(p.minPriceIdr)}` : "Bayar seikhlasnya") : formatRupiah(p.priceIdr)}
            </p>
          </Card>
          <Card className="space-y-2.5 p-5 text-sm text-slate-600">
            <p className="flex items-center gap-2 font-semibold text-ink">
              <Lock className="h-4 w-4 text-emerald-600" /> Aman & transparan
            </p>
            <p>Pembayaran diproses gateway resmi (QRIS / Virtual Account). Rilisin tidak pernah melihat data kartu atau PIN kamu.</p>
            <p>Dana ke kreator ditahan {PAYMENT_CONFIG.holdDays()} hari dulu. Kalau file rusak atau tidak sesuai, ajukan refund lewat admin.</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
