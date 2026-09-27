import { Search, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CategoryIcon, PlatformIcon } from "@/components/icons";
import { ProductGrid } from "@/components/product-card";
import { EmptyState, buttonStyles, cn } from "@/components/ui";
import { CATEGORIES, PLATFORMS, categoryLabel } from "@/lib/config";
import { listCatalog } from "@/lib/queries";

export const metadata: Metadata = { title: "Jelajahi" };

type Params = { q?: string; kategori?: string; platform?: string; harga?: string; sort?: string; hal?: string };

function hrefWith(current: Params, patch: Partial<Params>) {
  const merged: Params = { ...current, hal: undefined, ...patch };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `/jelajahi?${s}` : "/jelajahi";
}

const SORTS = [
  { value: undefined, label: "Trending" },
  { value: "baru", label: "Terbaru" },
  { value: "populer", label: "Terpopuler" },
];

const PRICES = [
  { value: undefined, label: "Semua" },
  { value: "gratis", label: "Gratis" },
  { value: "berbayar", label: "Berbayar" },
];

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition",
        active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100",
      )}
      aria-current={active ? "true" : undefined}
    >
      {children}
    </Link>
  );
}

export default async function ExplorePage({ searchParams }: PageProps<"/jelajahi">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const current: Params = {
    q: str("q")?.slice(0, 100),
    kategori: CATEGORIES.some((c) => c.slug === str("kategori")) ? str("kategori") : undefined,
    platform: PLATFORMS.some((p) => p.slug === str("platform")) ? str("platform") : undefined,
    harga: ["gratis", "berbayar"].includes(str("harga") ?? "") ? str("harga") : undefined,
    sort: ["baru", "populer"].includes(str("sort") ?? "") ? str("sort") : undefined,
  };
  const pageNum = Math.max(1, Number.parseInt(str("hal") ?? "1", 10) || 1);

  const { items, total, page, pageSize } = await listCatalog({
    q: current.q,
    category: current.kategori,
    platform: current.platform,
    price: current.harga,
    sort: current.sort,
    page: pageNum,
  });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activeCategory = CATEGORIES.find((c) => c.slug === current.kategori);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">
            {current.q ? <>Hasil untuk &ldquo;{current.q}&rdquo;</> : activeCategory ? activeCategory.label : "Jelajahi karya"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {activeCategory && !current.q ? `${activeCategory.description} · ` : ""}
            {total.toLocaleString("id-ID")} karya ditemukan
          </p>
        </div>
        <form action="/jelajahi" className="flex w-full gap-2 md:w-auto">
          {current.kategori && <input type="hidden" name="kategori" value={current.kategori} />}
          {current.platform && <input type="hidden" name="platform" value={current.platform} />}
          {current.harga && <input type="hidden" name="harga" value={current.harga} />}
          {current.sort && <input type="hidden" name="sort" value={current.sort} />}
          <label className="relative flex-1 md:w-80">
            <span className="sr-only">Kata kunci</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              type="search"
              defaultValue={current.q}
              placeholder="Cari judul, fitur, atau tag…"
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
            />
          </label>
          <button type="submit" className={buttonStyles.primary}>
            Cari
          </button>
        </form>
      </div>

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        {/* Filter */}
        <aside className="min-w-0 space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div>
            <p className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-400">Kategori</p>
            <div className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
              <FilterLink href={hrefWith(current, { kategori: undefined })} active={!current.kategori}>
                Semua kategori
              </FilterLink>
              {CATEGORIES.map((c) => (
                <FilterLink key={c.slug} href={hrefWith(current, { kategori: c.slug })} active={current.kategori === c.slug}>
                  <CategoryIcon category={c.slug} className="h-4 w-4 shrink-0" />
                  <span className="whitespace-nowrap">{c.label}</span>
                </FilterLink>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-400">Platform</p>
            <div className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
              <FilterLink href={hrefWith(current, { platform: undefined })} active={!current.platform}>
                Semua platform
              </FilterLink>
              {PLATFORMS.map((p) => (
                <FilterLink key={p.slug} href={hrefWith(current, { platform: p.slug })} active={current.platform === p.slug}>
                  <PlatformIcon platform={p.slug} className="h-4 w-4 shrink-0" />
                  <span className="whitespace-nowrap">{p.label}</span>
                </FilterLink>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-400">Harga</p>
            <div className="flex gap-1 lg:flex-col">
              {PRICES.map((p) => (
                <FilterLink key={p.label} href={hrefWith(current, { harga: p.value })} active={current.harga === p.value}>
                  {p.label}
                </FilterLink>
              ))}
            </div>
          </div>
        </aside>

        {/* Hasil */}
        <div className="min-w-0">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              {SORTS.map((s) => (
                <Link
                  key={s.label}
                  href={hrefWith(current, { sort: s.value })}
                  className={cn(
                    "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition",
                    current.sort === s.value ? "bg-ink text-white" : "text-slate-600 hover:text-ink",
                  )}
                >
                  {s.label}
                </Link>
              ))}
            </div>
            {(current.q || current.kategori || current.platform || current.harga) && (
              <Link href="/jelajahi" className="text-sm font-medium text-slate-500 hover:text-ink">
                Reset filter ×
              </Link>
            )}
          </div>

          {items.length ? (
            <ProductGrid items={items} cols={3} />
          ) : (
            <EmptyState icon={<SearchX className="h-10 w-10" />} title="Belum ada karya yang cocok">
              Coba kata kunci lain atau hapus beberapa filter.
              {current.kategori && ` Kategori ${categoryLabel(current.kategori)} masih menunggu karya pertamanya — mungkin kamu?`}
            </EmptyState>
          )}

          {totalPages > 1 && (
            <nav className="mt-10 flex items-center justify-center gap-3" aria-label="Halaman">
              {page > 1 ? (
                <Link href={hrefWith(current, { hal: String(page - 1) })} className={buttonStyles.secondary}>
                  ← Sebelumnya
                </Link>
              ) : (
                <span className={cn(buttonStyles.secondary, "pointer-events-none opacity-40")}>← Sebelumnya</span>
              )}
              <span className="text-sm text-slate-500">
                Halaman {page} dari {totalPages}
              </span>
              {page < totalPages ? (
                <Link href={hrefWith(current, { hal: String(page + 1) })} className={buttonStyles.secondary}>
                  Berikutnya →
                </Link>
              ) : (
                <span className={cn(buttonStyles.secondary, "pointer-events-none opacity-40")}>Berikutnya →</span>
              )}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
