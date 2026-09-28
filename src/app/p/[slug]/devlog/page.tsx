import { ChevronLeft, PenLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ProductIcon } from "@/components/bits";
import { Pager } from "@/components/forum/forum-parts";
import { ThreadList } from "@/components/forum/thread-list";
import { ButtonLink, Card } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCategoryBySlug, listThreads } from "@/lib/forum";
import { getProductBySlug } from "@/lib/queries";

const getProduct = cache(getProductBySlug);

export async function generateMetadata({ params }: PageProps<"/p/[slug]/devlog">): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProduct(slug);
  return p && p.status === "published" ? { title: `Devlog ${p.title}`, description: `Catatan pengembangan & rilis ${p.title}.` } : { title: "Devlog" };
}

export default async function ProductDevlogPage({ params, searchParams }: PageProps<"/p/[slug]/devlog">) {
  const { slug } = await params;
  const sp = await searchParams;
  const [product, user, cat] = await Promise.all([getProduct(slug), getCurrentUser(), getCategoryBySlug("devlog")]);
  if (!product || product.status !== "published" || !cat) notFound();
  const page = Math.max(1, Number.parseInt(typeof sp.hal === "string" ? sp.hal : "1", 10) || 1);
  const list = await listThreads({ productId: product.id, categoryId: cat.id, authorId: product.sellerId, sort: "baru", page });
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const isOwner = user?.id === product.sellerId;
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link href={`/p/${product.slug}`} className="-my-1 mb-5 inline-flex items-center gap-1 py-1 text-sm font-medium text-slate-500 hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Kembali ke {product.title}
      </Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <ProductIcon iconKey={product.iconKey} title={product.title} size={56} />
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">Devlog {product.title}</h1>
            <p className="text-sm text-slate-500">Catatan pengembangan langsung dari pembuatnya</p>
          </div>
        </div>
        {isOwner && (
          <ButtonLink href={`/forum/baru?kategori=devlog&produk=${product.slug}`}>
            <PenLine className="h-4 w-4" /> Tulis devlog
          </ButtonLink>
        )}
      </div>
      <Card className="overflow-hidden">
        <ThreadList items={list.items} showCategory={false} empty={<>Belum ada devlog untuk {product.title}.</>} />
      </Card>
      <div className="mt-4">
        <Pager page={list.page} totalPages={totalPages} hrefFor={(p) => (p > 1 ? `/p/${product.slug}/devlog?hal=${p}` : `/p/${product.slug}/devlog`)} />
      </div>
    </div>
  );
}
