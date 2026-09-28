import { Plus, Search, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CategoryChips, ForumSidebar, Pager, SortTabs } from "@/components/forum/forum-parts";
import { ThreadList } from "@/components/forum/thread-list";
import { ButtonLink, Card } from "@/components/ui";
import { parseForumSort, type ForumSort } from "@/lib/community/shared";
import { getForumCategories, getProductForThread, listThreads } from "@/lib/forum";

export const metadata: Metadata = {
  title: "Forum",
  description: "Tanya jawab, pamer karya, devlog, dan diskusi seputar aplikasi, game, dan template buatan developer Indonesia.",
};

export default async function ForumHome({ searchParams }: PageProps<"/forum">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const sort = parseForumSort(str("urut"));
  const q = str("q")?.trim().slice(0, 100) || null;
  const page = Math.max(1, Number.parseInt(str("hal") ?? "1", 10) || 1);
  const product = await getProductForThread(str("produk"));

  const [categories, list] = await Promise.all([
    getForumCategories(),
    listThreads({ sort, q, page, productId: product?.id ?? null }),
  ]);
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const href = (patch: { urut?: ForumSort; hal?: number }) => {
    const p = new URLSearchParams();
    const u = patch.urut ?? sort;
    if (u !== "aktif") p.set("urut", u);
    if (q) p.set("q", q);
    if (product) p.set("produk", product.slug);
    if (patch.hal && patch.hal > 1) p.set("hal", String(patch.hal));
    const s = p.toString();
    return s ? `/forum?${s}` : "/forum";
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">Forum</h1>
          <p className="mt-1 text-slate-500">Tanya jawab, pamer karya, devlog, dan diskusi — tersimpan rapi & bisa dicari lagi.</p>
        </div>
        <ButtonLink href={product ? `/forum/baru?produk=${product.slug}` : "/forum/baru"}>
          <Plus className="h-4 w-4" /> Buat thread
        </ButtonLink>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          <CategoryChips categories={categories} />
          <form action="/forum" className="relative" role="search">
            {product && <input type="hidden" name="produk" value={product.slug} />}
            <label htmlFor="forum-q" className="sr-only">
              Cari di forum
            </label>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="forum-q"
              name="q"
              type="search"
              defaultValue={q ?? ""}
              placeholder="Cari thread… (mis. webhook, flutter apk, printer bluetooth)"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
            />
          </form>
          {(product || q) && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {product && (
                <Link href={q ? `/forum?q=${encodeURIComponent(q)}` : "/forum"} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 font-medium text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100">
                  <span className="truncate">Diskusi {product.title}</span> <X className="h-3.5 w-3.5 shrink-0" />
                </Link>
              )}
              {q && (
                <Link href={product ? `/forum?produk=${product.slug}` : "/forum"} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700 hover:bg-slate-200">
                  <span className="truncate">“{q}”</span> <X className="h-3.5 w-3.5 shrink-0" />
                </Link>
              )}
              <span className="text-slate-500">{list.total} thread</span>
            </div>
          )}
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 p-3">
              <SortTabs sort={sort} hrefFor={(s) => href({ urut: s })} />
            </div>
            <ThreadList
              items={list.items}
              empty={q ? <>Tidak ada thread yang cocok dengan “{q}”. Coba kata lain, atau buat thread baru.</> : <>Belum ada thread di sini.</>}
            />
          </Card>
          <Pager page={list.page} totalPages={totalPages} hrefFor={(p) => href({ hal: p })} />
        </div>
        <div className="max-lg:hidden">
          <ForumSidebar categories={categories} />
        </div>
      </div>
    </div>
  );
}
