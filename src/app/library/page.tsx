import { ArrowUpCircle, Library, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PriceTag, ProductIcon } from "@/components/bits";
import { PlatformIcon } from "@/components/icons";
import { Badge, ButtonLink, Card, EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth/guards";
import { categoryLabel } from "@/lib/config";
import { formatDate, timeAgo } from "@/lib/format";
import { getLibrary } from "@/lib/queries";

export const metadata: Metadata = { title: "Library saya" };

export default async function LibraryPage() {
  const user = await requireUser("/library");
  const items = await getLibrary(user.id);
  const withUpdate = items.filter(
    (i) => i.latestReleasedAt && i.lastDownloadAt && i.latestReleasedAt > i.lastDownloadAt,
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight text-ink">
            <Library className="h-7 w-7 text-brand-600" /> Library saya
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Semua karya yang pernah kamu download atau beli. Versi baru otomatis ditandai di sini.
          </p>
        </div>
        {withUpdate.length > 0 && (
          <Badge tone="brand" className="!px-3 !py-1 !text-sm">
            <ArrowUpCircle className="h-4 w-4" /> {withUpdate.length} update tersedia
          </Badge>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<Library className="h-10 w-10" />} title="Library masih kosong">
          Karya yang kamu download akan tersimpan di sini, lengkap dengan notifikasi versi baru.
          <div className="mt-5">
            <ButtonLink href="/jelajahi">
              <Search className="h-4 w-4" /> Mulai jelajahi
            </ButtonLink>
          </div>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const hasUpdate = item.latestReleasedAt && item.lastDownloadAt && item.latestReleasedAt > item.lastDownloadAt;
            const unavailable = item.productStatus !== "published";
            return (
              <Card key={item.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                <Link href={`/p/${item.slug}`} className="flex min-w-0 flex-1 items-center gap-4">
                  <ProductIcon iconKey={item.iconKey} title={item.title} size={56} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
                      <span className="truncate">{item.title}</span>
                      {hasUpdate && <Badge tone="brand">Update v{item.latestVersion}</Badge>}
                      {unavailable && <Badge tone="red">Tidak tersedia</Badge>}
                    </p>
                    <p className="truncate text-sm text-slate-500">
                      {item.sellerName} · {categoryLabel(item.category)}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        {item.platforms.map((p) => (
                          <PlatformIcon key={p} platform={p} className="h-3.5 w-3.5" />
                        ))}
                      </span>
                      <span>Didapat {formatDate(item.acquiredAt)}</span>
                      {item.lastDownloadAt && <span>Terakhir diunduh {timeAgo(item.lastDownloadAt)}</span>}
                      {item.latestVersion && <span>Versi terbaru v{item.latestVersion}</span>}
                    </p>
                  </div>
                </Link>
                <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                  <PriceTag pricingModel={item.pricingModel} priceIdr={item.priceIdr} minPriceIdr={item.minPriceIdr} className="text-sm" />
                  {!unavailable && (
                    <ButtonLink href={`/p/${item.slug}`} variant={hasUpdate ? "primary" : "secondary"} className="!py-2">
                      {hasUpdate ? "Download update" : "Buka"}
                    </ButtonLink>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
