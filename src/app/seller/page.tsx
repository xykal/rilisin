import {
  ArrowRight,
  BadgeCheck,
  Circle,
  CircleCheck,
  Clock,
  Download,
  Eye,
  Package,
  Percent,
  Plus,
  ShieldCheck,
  TrendingUp,
  Upload,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ProductIcon, ProductStatusBadge } from "@/components/bits";
import { StoreForm } from "@/components/seller-forms";
import { Alert, ButtonLink, Card, EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { sellerProfiles } from "@/lib/db/schema";
import { formatCompact, formatDate, formatRupiah, timeAgo } from "@/lib/format";
import { effectiveCommissionBps } from "@/lib/payments/orders";
import { sellerBalance } from "@/lib/payments/payouts";
import { getSellerDownloads7d, getSellerProducts } from "@/lib/queries";
import { eq } from "drizzle-orm";

export const metadata: Metadata = { title: "Seller Center" };

export default async function SellerPage({ searchParams }: PageProps<"/seller">) {
  const user = await requireUser("/seller");
  const { baru } = await searchParams;

  if (!user.seller) {
    return (
      <div className="mx-auto grid grid-cols-1 max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_440px]">
        <div>
          <p className="text-sm font-semibold text-brand-700">Seller Center</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Rilis karyamu ke ribuan pengguna Indonesia</h1>
          <p className="mt-4 text-slate-600">
            Buka toko gratis dalam 1 menit. Bagikan aplikasi, game, source code, template, aset desain, atau e-book — gratis atau berbayar.
          </p>
          <ul className="mt-8 space-y-5">
            {[
              { icon: Upload, title: "Upload gampang", text: "Isi info, upload ikon & screenshot, lalu file rilisnya. Mendukung APK, EXE, DMG, ZIP, PDF, dan lainnya." },
              { icon: ShieldCheck, title: "Direview sebelum tayang", text: "Setiap karya baru dicek tim moderator (biasanya < 1 hari). Seller terpercaya bisa tayang otomatis." },
              { icon: Percent, title: "Komisi 10% untuk produk berbayar", text: "Produk gratis tanpa potongan. Seller awal: 0% komisi selama 3 bulan pertama." },
              { icon: Wallet, title: "Pembayaran lokal", text: "QRIS & virtual account. Saldo ditahan 7 hari lalu bisa dicairkan ke rekening / e-wallet (min. Rp50.000)." },
            ].map((f) => (
              <li key={f.title} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <f.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-bold text-ink">{f.title}</p>
                  <p className="text-sm text-slate-600">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <Card className="h-fit p-6 sm:p-8">
          <h2 className="text-lg font-bold text-ink">Aktifkan toko</h2>
          <p className="mb-5 mt-1 text-sm text-slate-500">Nama toko tampil di halaman produk & profil publik kamu.</p>
          <StoreForm mode="activate" />
        </Card>
      </div>
    );
  }

  const [items, downloads7d, [profile], balance] = await Promise.all([
    getSellerProducts(user.id),
    getSellerDownloads7d(user.id),
    db.select().from(sellerProfiles).where(eq(sellerProfiles.userId, user.id)).limit(1),
    sellerBalance(user.id),
  ]);
  const commissionNow = effectiveCommissionBps(profile!.commissionBps, profile!.zeroCommissionUntil);
  const published = items.filter((p) => p.status === "published");
  const inReview = items.filter((p) => p.status === "review").length + items.flatMap((p) => p.releases).filter((r) => r.status === "review").length;
  const totalDownloads = items.reduce((s, p) => s + p.downloadCount, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      {baru && (
        <Alert tone="success" className="mb-6" title="Toko kamu sudah aktif!">
          Langkah berikutnya: tambahkan karya pertamamu.
        </Alert>
      )}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-brand-700">Seller Center</p>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight text-ink">
            <span className="min-w-0 [overflow-wrap:anywhere]">{user.seller.storeName}</span>
            {user.seller.isTrusted && <BadgeCheck className="h-6 w-6 shrink-0 text-brand-600" aria-label="Seller terpercaya" />}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/@${user.username}`} variant="secondary">
            <Eye className="h-4 w-4" /> Profil publik
          </ButtonLink>
          <ButtonLink href="/seller/produk/baru">
            <Plus className="h-4 w-4" /> Tambah karya
          </ButtonLink>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Package, label: "Karya tayang", value: published.length },
          { icon: Download, label: "Total unduhan", value: totalDownloads },
          { icon: TrendingUp, label: "Unduhan 7 hari", value: downloads7d },
          { icon: Clock, label: "Menunggu review", value: inReview },
        ].map((s) => (
          <Card key={s.label} className="p-5">
            <s.icon className="h-5 w-5 text-brand-600" />
            <p className="mt-3 text-2xl font-extrabold text-ink">{formatCompact(s.value)}</p>
            <p className="text-sm text-slate-500">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-ink">Karya kamu</h2>
            <Link href="/seller/produk" className="-my-1 py-1 text-sm font-semibold text-brand-700 hover:underline">Kelola semua →</Link>
          </div>
          {items.length === 0 ? (
            <EmptyState icon={<Package className="h-10 w-10" />} title="Belum ada karya">
              Mulai dengan menambahkan karya pertamamu — bisa disimpan sebagai draft dulu.
              <div className="mt-5">
                <ButtonLink href="/seller/produk/baru"><Plus className="h-4 w-4" /> Tambah karya</ButtonLink>
              </div>
            </EmptyState>
          ) : (
            <Card className="divide-y divide-slate-100">
              {items.slice(0, 6).map((p) => {
                const pendingRelease = p.releases.find((r) => r.status === "review" || r.status === "draft");
                return (
                  <Link key={p.id} href={`/seller/produk/${p.id}`} className="flex items-center gap-3 p-4 hover:bg-slate-50 sm:gap-4">
                    <ProductIcon iconKey={p.iconKey} title={p.title} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{p.title}</p>
                      <p className="text-xs text-slate-500">
                        Diubah {timeAgo(p.updatedAt)}
                        {pendingRelease && p.status === "published" && ` · rilis v${pendingRelease.version} ${pendingRelease.status === "review" ? "sedang direview" : "masih draft"}`}
                      </p>
                      {/* HP: status pindah ke bawah judul supaya judul tidak kepotong habis */}
                      <span className="mt-1.5 block sm:hidden">
                        <ProductStatusBadge status={p.status} />
                      </span>
                    </div>
                    <span className="hidden text-sm text-slate-500 sm:block">{formatCompact(p.downloadCount)} unduhan</span>
                    <span className="shrink-0 max-sm:hidden">
                      <ProductStatusBadge status={p.status} />
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                  </Link>
                );
              })}
            </Card>
          )}
        </section>

        <aside className="space-y-5">
          <Card className="p-6">
            <h2 className="mb-4 text-lg font-bold text-ink">Profil toko</h2>
            <StoreForm mode="edit" defaults={{ storeName: profile!.storeName, tagline: profile!.tagline, websiteUrl: profile!.websiteUrl }} />
          </Card>
          <Card className="p-6">
            <h2 className="flex items-center gap-2 font-bold text-ink"><Wallet className="h-5 w-5 text-brand-600" /> Saldo &amp; penjualan</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-emerald-50 p-3">
                <dt className="text-xs text-emerald-800">Tersedia</dt>
                <dd className="text-lg font-extrabold text-ink">{formatRupiah(balance.available)}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Tertahan</dt>
                <dd className="text-lg font-extrabold text-ink">{formatRupiah(balance.held)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-slate-600">
              Komisi kamu: <b>{commissionNow === 0 ? "0% (promo seller awal)" : `${(commissionNow / 100).toLocaleString("id-ID")}%`}</b>
              {profile!.zeroCommissionUntil && commissionNow === 0 ? ` sampai ${formatDate(profile!.zeroCommissionUntil)}` : ""}. Biaya gateway dibayar pembeli.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <ButtonLink href="/seller/saldo" className="!py-2">Cairkan dana</ButtonLink>
              <ButtonLink href="/seller/penjualan" variant="secondary" className="!py-2">Riwayat penjualan</ButtonLink>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
