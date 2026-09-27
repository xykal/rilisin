import {
  CalendarDays,
  ChevronRight,
  CodeXml,
  Download,
  ExternalLink,
  Eye,
  FileArchive,
  Lock,
  Scale,
  ShoppingCart,
  Smartphone,
  Star,
  Tag,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AndroidBadge, Avatar, PriceTag, ProductIcon, ProductStatusBadge } from "@/components/bits";
import { PlatformIcon } from "@/components/icons";
import { Markdown } from "@/components/markdown";
import { ProductCard } from "@/components/product-card";
import { Alert, Badge, ButtonLink, Card, buttonStyles, cn } from "@/components/ui";
import { getCurrentUser, isStaff } from "@/lib/auth/current-user";
import { categoryLabel, platformLabel } from "@/lib/config";
import { formatBytes, formatCompact, formatDate, formatRupiah, timeAgo } from "@/lib/format";
import { getMoreFromSeller, getProductBySlug, getSellerStats, hasEntitlement } from "@/lib/queries";
import { mediaUrl } from "@/lib/storage";

const getProduct = cache(getProductBySlug);

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product || product.status !== "published") return { title: "Produk" };
  return { title: product.title, description: product.summary };
}

export default async function ProductPage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const [product, user] = await Promise.all([getProduct(slug), getCurrentUser()]);
  if (!product) notFound();

  const isOwner = user?.id === product.sellerId;
  const staff = isStaff(user);
  if (product.status !== "published" && !isOwner && !staff) notFound();

  const [sellerStats, moreFromSeller, owned] = await Promise.all([
    getSellerStats(product.sellerId),
    getMoreFromSeller(product.sellerId, product.id),
    user ? hasEntitlement(user.id, product.id) : Promise.resolve(false),
  ]);

  const latest = product.releases[0];
  const isFree = product.pricingModel === "free";
  const canDownload = Boolean(user) && (isFree || owned || isOwner || staff);
  const cover = mediaUrl(product.coverKey);
  const sellerName = product.seller.sellerProfile?.storeName ?? product.seller.displayName;
  const hasAndroid = product.platforms.includes("android");
  const totalSize = latest?.files.reduce((s, f) => s + f.sizeBytes, 0) ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Breadcrumb */}
      <nav className="mb-5 flex items-center gap-1.5 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/jelajahi" className="hover:text-ink">Jelajahi</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href={`/jelajahi?kategori=${product.category}`} className="hover:text-ink">
          {categoryLabel(product.category)}
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="truncate font-medium text-ink">{product.title}</span>
      </nav>

      {product.status !== "published" && (
        <Alert tone="warning" className="mb-6" title={<span className="flex items-center gap-2"><Eye className="h-4 w-4" /> Pratinjau — produk belum tayang</span>}>
          Status: <ProductStatusBadge status={product.status} />. Hanya kamu {staff && !isOwner ? "(moderator)" : ""} yang bisa melihat halaman ini.
          {isOwner && (
            <> <Link href={`/seller/produk/${product.id}`} className="font-semibold underline">Kembali ke editor</Link></>
          )}
        </Alert>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* ─── Kolom utama ─────────────────────────────── */}
        <div className="min-w-0 space-y-8">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="aspect-[16/9] bg-gradient-to-br from-brand-100 to-violet-100 sm:aspect-[21/9]">
              {cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start">
              <ProductIcon iconKey={product.iconKey} title={product.title} size={96} className="-mt-16 border-4 border-white shadow-lg" />
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{product.title}</h1>
                <p className="mt-1 text-slate-600">{product.summary}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link href={`/@${product.seller.username}`} className="flex items-center gap-2 text-sm font-semibold text-brand-700 hover:underline">
                    <Avatar name={sellerName} avatarKey={product.seller.avatarKey} size={22} />
                    {sellerName}
                  </Link>
                  <span className="text-slate-300">•</span>
                  <Badge>{categoryLabel(product.category)}</Badge>
                  {product.platforms.map((p) => (
                    <Badge key={p} tone="brand">
                      <PlatformIcon platform={p} className="h-3.5 w-3.5" /> {platformLabel(p)}
                    </Badge>
                  ))}
                  {hasAndroid && (
                    <AndroidBadge registration={product.androidRegistration} checked={Boolean(product.androidCheckedAt)} />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Screenshot */}
          {product.media.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-bold text-ink">Screenshot</h2>
              <div className="scroll-thin flex snap-x gap-3 overflow-x-auto pb-3">
                {product.media.map((m) => (
                  <a
                    key={m.id}
                    href={mediaUrl(m.storageKey)!}
                    target="_blank"
                    rel="noopener"
                    className="shrink-0 snap-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={mediaUrl(m.storageKey)!}
                      alt={`Screenshot ${product.title}`}
                      loading="lazy"
                      className="h-72 w-auto object-cover"
                      style={m.width && m.height ? { aspectRatio: `${m.width} / ${m.height}` } : undefined}
                    />
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Deskripsi */}
          <Card className="p-6 sm:p-8">
            <h2 className="mb-4 text-lg font-bold text-ink">Deskripsi</h2>
            {product.descriptionMd.trim() ? (
              <Markdown>{product.descriptionMd}</Markdown>
            ) : (
              <p className="text-sm text-slate-500">Belum ada deskripsi.</p>
            )}
            {product.tags.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
                {product.tags.map((t) => (
                  <Link key={t} href={`/jelajahi?q=${encodeURIComponent(t)}`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200">
                    <Tag className="h-3 w-3" /> {t}
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Info Android */}
          {hasAndroid && (
            <Card className="p-6 sm:p-8">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-ink">
                <Smartphone className="h-5 w-5 text-brand-600" /> Info instalasi Android
              </h2>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">Nama paket</dt>
                  <dd className="mt-0.5 font-mono text-ink">{product.androidPackage ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Status developer</dt>
                  <dd className="mt-1">
                    <AndroidBadge registration={product.androidRegistration} checked={Boolean(product.androidCheckedAt)} />
                  </dd>
                </div>
              </dl>
              {product.androidRegistration === "not_registered" ? (
                <Alert tone="warning" className="mt-5" title="Butuh langkah tambahan saat instal">
                  Developer aplikasi ini belum terverifikasi Google. Sejak 30 Sep 2026, HP Android bersertifikasi di
                  Indonesia hanya bisa menginstalnya lewat &ldquo;mode lanjutan&rdquo; (sekali setting, ada jeda 24 jam).{" "}
                  <Link href="/panduan/android" className="font-semibold underline">Lihat panduan langkah demi langkah</Link>.
                </Alert>
              ) : (
                <p className="mt-5 text-sm text-slate-600">
                  Developer menyatakan sudah terdaftar di program verifikasi Google, jadi aplikasi bisa diinstal seperti
                  biasa (izinkan &ldquo;instal dari sumber ini&rdquo; di browser).{" "}
                  {product.androidCheckedAt ? "Bukti pendaftaran sudah dicek moderator." : "Bukti pendaftaran belum dicek moderator."}{" "}
                  <Link href="/panduan/android" className="font-semibold text-brand-700 hover:underline">Pelajari lebih lanjut</Link>.
                </p>
              )}
            </Card>
          )}

          {/* Changelog */}
          <Card className="p-6 sm:p-8">
            <h2 className="mb-4 text-lg font-bold text-ink">Riwayat versi</h2>
            {product.releases.length ? (
              <ol className="space-y-6">
                {product.releases.map((r, i) => (
                  <li key={r.id} className="relative border-l-2 border-slate-200 pl-5">
                    <span className={cn("absolute -left-[7px] top-1.5 h-3 w-3 rounded-full", i === 0 ? "bg-brand-600" : "bg-slate-300")} />
                    <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
                      v{r.version}
                      {i === 0 && <Badge tone="brand">Terbaru</Badge>}
                      <span className="text-xs font-medium text-slate-500">{formatDate(r.publishedAt)}</span>
                    </p>
                    {r.changelogMd.trim() && (
                      <div className="mt-2">
                        <Markdown>{r.changelogMd}</Markdown>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-slate-500">Belum ada rilis yang tayang.</p>
            )}
          </Card>

          {/* Ulasan */}
          <Card className="p-6 sm:p-8">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-ink">
              <Star className="h-5 w-5 text-amber-500" /> Ulasan
            </h2>
            <p className="text-sm text-slate-500">
              Rating &amp; ulasan hadir di fase berikutnya. Hanya pengguna yang benar-benar mengunduh / membeli yang bisa memberi ulasan, supaya tidak ada ulasan palsu.
            </p>
          </Card>
        </div>

        {/* ─── Sidebar ─────────────────────────────────── */}
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <div className="flex items-baseline justify-between">
              <PriceTag
                pricingModel={product.pricingModel}
                priceIdr={product.priceIdr}
                minPriceIdr={product.minPriceIdr}
                className="text-2xl"
              />
              {latest && <span className="text-sm text-slate-500">v{latest.version}</span>}
            </div>

            {!latest ? (
              <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Belum ada file yang bisa diunduh.</p>
            ) : !user ? (
              <div className="mt-4">
                <ButtonLink href={`/masuk?next=${encodeURIComponent(`/p/${product.slug}`)}`} className="w-full !py-3">
                  <Download className="h-4 w-4" /> Masuk untuk download
                </ButtonLink>
                <p className="mt-2 text-center text-xs text-slate-500">
                  {isFree ? "Gratis — cukup punya akun. Update versi baru otomatis muncul di Library." : "Butuh akun untuk membeli."}
                </p>
              </div>
            ) : canDownload ? (
              <div className="mt-4 space-y-2.5">
                {!isFree && (owned || isOwner || staff) && (
                  <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                    {owned ? "Kamu sudah memiliki produk ini." : "Akses pemilik / moderator."}
                  </p>
                )}
                {latest.files.map((f) => (
                  <form key={f.id} action={`/api/download/${f.id}`} method="post" className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        <PlatformIcon platform={f.platform} className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink" title={f.filename}>{f.filename}</p>
                        <p className="text-xs text-slate-500">
                          {platformLabel(f.platform)} · {formatBytes(f.sizeBytes)}
                        </p>
                      </div>
                    </div>
                    <button type="submit" className={cn(buttonStyles.primary, "mt-3 w-full")}>
                      <Download className="h-4 w-4" /> Download
                    </button>
                    <details className="mt-2 text-[11px] text-slate-400">
                      <summary className="cursor-pointer hover:text-slate-600">SHA-256 (cek keaslian file)</summary>
                      <code className="mt-1 block break-all font-mono">{f.sha256}</code>
                    </details>
                  </form>
                ))}
                {hasAndroid && product.androidRegistration === "not_registered" && (
                  <p className="text-xs text-amber-700">
                    File APK ini butuh mode lanjutan untuk diinstal.{" "}
                    <Link href="/panduan/android" className="font-semibold underline">Panduan</Link>
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-4">
                <button type="button" disabled className={cn(buttonStyles.primary, "w-full !py-3")}>
                  <ShoppingCart className="h-4 w-4" /> Beli {formatRupiah(product.priceIdr)}
                </button>
                <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Checkout (QRIS, e-wallet, VA) aktif di Fase 2. Setelah bayar, file langsung muncul di Library.
                </p>
              </div>
            )}

            <dl className="mt-5 space-y-2.5 border-t border-slate-100 pt-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="flex items-center gap-2 text-slate-500"><Download className="h-4 w-4" /> Unduhan</dt>
                <dd className="font-semibold text-ink">{formatCompact(product.downloadCount)}</dd>
              </div>
              {latest && (
                <div className="flex justify-between gap-3">
                  <dt className="flex items-center gap-2 text-slate-500"><CalendarDays className="h-4 w-4" /> Diperbarui</dt>
                  <dd className="font-semibold text-ink" title={formatDate(latest.publishedAt)}>{timeAgo(latest.publishedAt)}</dd>
                </div>
              )}
              {totalSize > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="flex items-center gap-2 text-slate-500"><FileArchive className="h-4 w-4" /> Ukuran</dt>
                  <dd className="font-semibold text-ink">{formatBytes(totalSize)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="flex items-center gap-2 text-slate-500"><Scale className="h-4 w-4" /> Lisensi</dt>
                <dd className="text-right font-semibold text-ink">{product.license}</dd>
              </div>
            </dl>
            {(product.websiteUrl || product.sourceUrl) && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                {product.websiteUrl && (
                  <a href={product.websiteUrl} target="_blank" rel="noopener noreferrer nofollow" className={cn(buttonStyles.secondary, buttonStyles.small)}>
                    <ExternalLink className="h-3.5 w-3.5" /> Website
                  </a>
                )}
                {product.sourceUrl && (
                  <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className={cn(buttonStyles.secondary, buttonStyles.small)}>
                    <CodeXml className="h-3.5 w-3.5" /> Source code
                  </a>
                )}
              </div>
            )}
          </Card>

          {/* Seller */}
          <Card className="p-5">
            <Link href={`/@${product.seller.username}`} className="flex items-center gap-3">
              <Avatar name={sellerName} avatarKey={product.seller.avatarKey} size={48} />
              <div className="min-w-0">
                <p className="truncate font-bold text-ink hover:text-brand-700">{sellerName}</p>
                <p className="truncate text-xs text-slate-500">@{product.seller.username}</p>
              </div>
            </Link>
            {product.seller.sellerProfile?.tagline && (
              <p className="mt-3 text-sm text-slate-600">{product.seller.sellerProfile.tagline}</p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-slate-50 p-2.5">
                <p className="text-lg font-extrabold text-ink">{sellerStats.products}</p>
                <p className="text-xs text-slate-500">karya</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5">
                <p className="text-lg font-extrabold text-ink">{formatCompact(sellerStats.downloads)}</p>
                <p className="text-xs text-slate-500">unduhan</p>
              </div>
            </div>
          </Card>
        </aside>
      </div>

      {moreFromSeller.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-5 text-xl font-bold text-ink">Karya lain dari {sellerName}</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {moreFromSeller.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
