import { Download } from "lucide-react";
import Link from "next/link";
import { categoryLabel } from "@/lib/config";
import { formatCompact } from "@/lib/format";
import type { ProductCardData } from "@/lib/queries";
import { mediaUrl } from "@/lib/storage";
import { PriceTag, ProductIcon } from "./bits";
import { PlatformIcon } from "./icons";
import { RatingPill } from "./stars";

export function ProductCard({ product }: { product: ProductCardData }) {
  const cover = mediaUrl(product.coverKey);
  return (
    <Link
      href={`/p/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-900/5"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        )}
        <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur">
          {categoryLabel(product.category)}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-3">
          <ProductIcon iconKey={product.iconKey} title={product.title} size={44} className="relative z-10 -mt-9 border-2 border-white shadow-md" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-bold text-ink group-hover:text-brand-700">{product.title}</h3>
            <p className="truncate text-xs text-slate-500">oleh {product.sellerName}</p>
          </div>
        </div>
        <p className="mt-2 line-clamp-2 text-sm text-slate-600">{product.summary}</p>
        <div className="mt-auto flex items-center justify-between pt-4 text-sm">
          <PriceTag
            pricingModel={product.pricingModel}
            priceIdr={product.priceIdr}
            minPriceIdr={product.minPriceIdr}
          />
          <div className="flex items-center gap-3 text-slate-400">
            <span className="flex items-center gap-1.5">
              {product.platforms.slice(0, 3).map((p) => (
                <PlatformIcon key={p} platform={p} className="h-3.5 w-3.5" />
              ))}
            </span>
            {product.ratingCount > 0 ? (
              <RatingPill sum={product.ratingSum} count={product.ratingCount} />
            ) : (
              <span className="flex items-center gap-1 text-xs font-medium text-slate-500">
                <Download className="h-3.5 w-3.5" />
                {formatCompact(product.downloadCount)}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export function ProductGrid({ items, cols = 4 }: { items: ProductCardData[]; cols?: 3 | 4 }) {
  return (
    <div className={`grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 ${cols === 4 ? "xl:grid-cols-4" : ""}`}>
      {items.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
