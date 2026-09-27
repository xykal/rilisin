import { ExternalLink, Package, Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PriceTag, ProductIcon, ProductStatusBadge } from "@/components/bits";
import { Alert, ButtonLink, Card, EmptyState, buttonStyles, cn } from "@/components/ui";
import { requireSeller } from "@/lib/auth/guards";
import { categoryLabel } from "@/lib/config";
import { formatCompact, formatDate } from "@/lib/format";
import { getSellerProducts } from "@/lib/queries";

export const metadata: Metadata = { title: "Karya saya" };

export default async function SellerProductsPage({ searchParams }: PageProps<"/seller/produk">) {
  const user = await requireSeller("/seller/produk");
  const { dihapus } = await searchParams;
  const items = await getSellerProducts(user.id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/seller" className="inline-block py-1 text-sm font-semibold text-brand-700 hover:underline">← Seller Center</Link>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-ink">Karya saya</h1>
        </div>
        <ButtonLink href="/seller/produk/baru"><Plus className="h-4 w-4" /> Tambah karya</ButtonLink>
      </div>
      {dihapus && <Alert tone="success" className="mb-5">Draft produk sudah dihapus.</Alert>}

      {items.length === 0 ? (
        <EmptyState icon={<Package className="h-10 w-10" />} title="Belum ada karya">
          Klik &ldquo;Tambah karya&rdquo; untuk mulai.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3 font-semibold">Karya</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Versi</th>
                <th className="px-3 py-3 font-semibold">Harga</th>
                <th className="px-3 py-3 text-right font-semibold">Unduhan</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((p) => {
                const live = p.releases.find((r) => r.status === "published");
                const pending = p.releases.find((r) => r.status === "draft" || r.status === "review" || r.status === "rejected");
                return (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <ProductIcon iconKey={p.iconKey} title={p.title} size={40} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{p.title}</p>
                          <p className="text-xs text-slate-500">{categoryLabel(p.category)} · dibuat {formatDate(p.createdAt)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3"><ProductStatusBadge status={p.status} /></td>
                    <td className="px-3 py-3 text-slate-600">
                      {live ? `v${live.version}` : "-"}
                      {pending && p.status === "published" && (
                        <span className="block text-xs text-amber-700">
                          v{pending.version} {pending.status === "review" ? "direview" : pending.status === "rejected" ? "ditolak" : "draft"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3"><PriceTag pricingModel={p.pricingModel} priceIdr={p.priceIdr} minPriceIdr={p.minPriceIdr} className="text-sm" /></td>
                    <td className="px-3 py-3 text-right font-semibold text-ink">{formatCompact(p.downloadCount)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <Link href={`/p/${p.slug}`} className={cn(buttonStyles.ghost, buttonStyles.small)} title="Lihat halaman">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                        <Link href={`/seller/produk/${p.id}`} className={cn(buttonStyles.secondary, buttonStyles.small)}>
                          <Pencil className="h-3.5 w-3.5" /> Kelola
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
