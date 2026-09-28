import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ProductIcon } from "@/components/bits";
import { ReviewsSection } from "@/components/reviews-section";
import { getCurrentUser, isStaff } from "@/lib/auth/current-user";
import { formatRating } from "@/lib/community/shared";
import { getProductBySlug } from "@/lib/queries";
import { REVIEW_SORTS, type ReviewSort } from "@/lib/reviews";

const getProduct = cache(getProductBySlug);

export async function generateMetadata({ params }: PageProps<"/p/[slug]/ulasan">): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProduct(slug);
  if (!p || p.status !== "published") return { title: "Ulasan" };
  return {
    title: `Ulasan ${p.title}`,
    description: p.ratingCount ? `${formatRating(p.ratingSum, p.ratingCount)}/5 dari ${p.ratingCount} ulasan pemilik ${p.title}.` : `Ulasan pemilik ${p.title}.`,
  };
}

export default async function ProductReviewsPage({ params, searchParams }: PageProps<"/p/[slug]/ulasan">) {
  const { slug } = await params;
  const sp = await searchParams;
  const [product, user] = await Promise.all([getProduct(slug), getCurrentUser()]);
  if (!product) notFound();
  if (product.status !== "published" && user?.id !== product.sellerId && !isStaff(user)) notFound();

  const sortParam = typeof sp.urut === "string" ? sp.urut : "terbaru";
  const sort = (REVIEW_SORTS.some((s) => s.id === sortParam) ? sortParam : "terbaru") as ReviewSort;
  const starNum = Number(typeof sp.bintang === "string" ? sp.bintang : NaN);
  const star = Number.isInteger(starNum) && starNum >= 1 && starNum <= 5 ? starNum : null;
  const page = Math.max(1, Number.parseInt(typeof sp.hal === "string" ? sp.hal : "1", 10) || 1);
  const sellerName = product.seller.sellerProfile?.storeName ?? product.seller.displayName;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link href={`/p/${product.slug}`} className="-my-1 mb-5 inline-flex items-center gap-1 py-1 text-sm font-medium text-slate-500 hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Kembali ke {product.title}
      </Link>
      <div className="mb-6 flex items-center gap-4">
        <ProductIcon iconKey={product.iconKey} title={product.title} size={56} />
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Ulasan {product.title}</h1>
          <p className="truncate text-sm text-slate-500">oleh {sellerName} · hanya dari pemilik yang sudah mengunduh / membeli</p>
        </div>
      </div>
      <ReviewsSection
        product={{ id: product.id, slug: product.slug, title: product.title, sellerId: product.sellerId, status: product.status, ratingCount: product.ratingCount, ratingSum: product.ratingSum }}
        user={user}
        sellerName={sellerName}
        mode="full"
        sort={sort}
        star={star}
        page={page}
      />
    </div>
  );
}
