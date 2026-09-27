import {
  ArrowRight,
  BadgeCheck,
  ChartNoAxesColumn,
  Flame,
  MessagesSquare,
  Percent,
  Rocket,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { PriceTag, ProductIcon } from "@/components/bits";
import { CategoryIcon } from "@/components/icons";
import { ProductGrid } from "@/components/product-card";
import { ButtonLink, SectionHeading } from "@/components/ui";
import { CATEGORIES } from "@/lib/config";
import { formatCompact } from "@/lib/format";
import { getRoomsForViewer } from "@/lib/chat/server";
import { getHomeData } from "@/lib/queries";

export default async function HomePage() {
  const [{ trending, newest, featured, stats }, rooms] = await Promise.all([getHomeData(), getRoomsForViewer(null)]);
  const activeRooms = rooms
    .filter((r) => r.lastMessage && r.kind === "public")
    .sort((a, b) => (b.lastMessage!.at > a.lastMessage!.at ? 1 : -1))
    .slice(0, 4);

  return (
    <>
      {/* ─── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-slate-200/70 bg-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_85%_-10%,rgba(110,91,255,0.18),transparent),radial-gradient(40rem_20rem_at_0%_110%,rgba(255,209,102,0.18),transparent)]"
        />
        <div className="relative mx-auto grid grid-cols-1 max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:py-20">
          <div className="min-w-0">
            <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-ink sm:text-5xl">
              Rilis karyamu.
              <br />
              <span className="bg-gradient-to-r from-brand-600 to-violet-500 bg-clip-text text-transparent">
                Temukan karya developer lokal.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Aplikasi, game, source code, template, dan e-book — gratis maupun berbayar. Satu tempat untuk
              berbagi, jualan, dan saling dukung sesama kreator.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <ButtonLink href="/jelajahi" className="!px-5 !py-3">
                Jelajahi karya <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="/seller" variant="secondary" className="!px-5 !py-3">
                <Rocket className="h-4 w-4" /> Mulai rilis — gratis
              </ButtonLink>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 sm:gap-6">
              {[
                { label: "Karya", value: stats.products },
                { label: "Kreator", value: stats.sellers },
                { label: "Unduhan", value: stats.downloads },
              ].map((s) => (
                <div key={s.label}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{s.label}</dt>
                  <dd className="mt-1 whitespace-nowrap text-xl font-extrabold tabular-nums text-ink max-[339px]:text-lg sm:text-2xl">{formatCompact(s.value)}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Pilihan editor */}
          <div className="relative min-w-0">
            <div className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-2xl shadow-brand-900/10 backdrop-blur">
              <p className="mb-4 flex items-center gap-2 text-sm font-bold text-ink">
                <BadgeCheck className="h-4 w-4 text-brand-600" /> Pilihan editor
              </p>
              <div className="space-y-3">
                {featured.map((p) => (
                  <Link
                    key={p.id}
                    href={`/p/${p.slug}`}
                    className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-3 transition hover:border-brand-200 hover:shadow-md"
                  >
                    <ProductIcon iconKey={p.iconKey} title={p.title} size={56} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-ink">{p.title}</p>
                      <p className="truncate text-sm text-slate-500">{p.summary}</p>
                    </div>
                    <PriceTag
                      pricingModel={p.pricingModel}
                      priceIdr={p.priceIdr}
                      minPriceIdr={p.minPriceIdr}
                      className="shrink-0 text-sm"
                    />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-16 px-4 py-14 sm:px-6">
        {/* ─── Kategori ──────────────────────────────────────── */}
        <section>
          <SectionHeading title="Kategori" subtitle="Mau cari apa hari ini?" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {CATEGORIES.map((c) => (
              <Link
                key={c.slug}
                href={`/jelajahi?kategori=${c.slug}`}
                className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
                  <CategoryIcon category={c.slug} />
                </span>
                <p className="mt-3 font-bold text-ink">{c.label}</p>
                <p className="mt-0.5 text-xs text-slate-500">{c.description}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* ─── Trending ──────────────────────────────────────── */}
        <section>
          <SectionHeading
            title={
              <span className="flex items-center gap-2">
                <Flame className="h-6 w-6 text-orange-500" /> Trending minggu ini
              </span>
            }
            subtitle="Diurutkan dari jumlah pengunduh unik 7 hari terakhir"
            action={
              <Link href="/jelajahi" className="hidden text-sm font-semibold text-brand-700 hover:underline sm:block">
                Lihat semua →
              </Link>
            }
          />
          <ProductGrid items={trending} />
        </section>

        {/* ─── Info Android ──────────────────────────────────── */}
        <section className="flex flex-col gap-5 rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 sm:flex-row sm:items-center sm:p-8">
          <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm">
            <Smartphone className="h-7 w-7" />
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-ink">Aturan baru Android mulai 30 September 2026</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">
              Di Indonesia, aplikasi dari developer yang belum terverifikasi Google butuh langkah instal tambahan.
              Setiap aplikasi Android di sini diberi label status verifikasinya — plus panduan instal yang jelas.
            </p>
          </div>
          <ButtonLink href="/panduan/android" variant="secondary" className="shrink-0">
            Baca panduan
          </ButtonLink>
        </section>

        {/* ─── Baru rilis ────────────────────────────────────── */}
        <section>
          <SectionHeading
            title="Baru rilis"
            subtitle="Karya terbaru dari para kreator"
            action={
              <Link href="/jelajahi?sort=baru" className="hidden text-sm font-semibold text-brand-700 hover:underline sm:block">
                Lihat semua →
              </Link>
            }
          />
          <ProductGrid items={newest} />
        </section>

        {/* ─── CTA seller ────────────────────────────────────── */}
        <section className="overflow-hidden rounded-3xl bg-ink text-white">
          <div className="grid grid-cols-1 gap-10 p-8 sm:p-12 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-brand-300">Untuk developer &amp; kreator</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight">Punya aplikasi, game, atau template? Rilis di sini.</h2>
              <p className="mt-4 text-white/70">
                Upload gratis. Bagikan karya gratis tanpa potongan apa pun, atau jual dengan komisi rendah.
                Pembeli bayar pakai QRIS, e-wallet, atau transfer bank.
              </p>
              <ButtonLink href="/seller" className="mt-7 !bg-white !px-5 !py-3 !text-ink hover:!bg-brand-50">
                Buka toko sekarang <ArrowRight className="h-4 w-4" />
              </ButtonLink>
            </div>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                { icon: Percent, title: "Komisi 10%", text: "Hanya untuk produk berbayar. 0% selama 3 bulan pertama untuk seller awal." },
                { icon: Wallet, title: "Cair ke rekening", text: "Saldo penjualan bisa ditarik ke bank / e-wallet (aktif di Fase 2)." },
                { icon: ShieldCheck, title: "File aman", text: "Setiap file dicek tipe & hash-nya, lalu direview tim sebelum tayang." },
                { icon: ChartNoAxesColumn, title: "Statistik unduhan", text: "Pantau karya mana yang paling diminati." },
              ].map((f) => (
                <li key={f.title} className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
                  <f.icon className="h-5 w-5 text-brand-300" />
                  <p className="mt-3 font-bold">{f.title}</p>
                  <p className="mt-1 text-sm text-white/65">{f.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ─── Komunitas ─────────────────────────────────────── */}
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-1 gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center">
            <div>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
                <MessagesSquare className="h-6 w-6" />
              </span>
              <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Ngobrol bareng kreator, realtime</h2>
              <p className="mt-2 max-w-md text-slate-600">
                Ruang obrolan untuk tanya-jawab coding, pamer karya, sampai cerita jualan. Balas, kasih reaksi emoji, edit &amp; hapus
                pesan — dengan filter anti spam &amp; judol.
              </p>
              <ButtonLink href="/komunitas" className="mt-6">
                Gabung obrolan <ArrowRight className="h-4 w-4" />
              </ButtonLink>
            </div>
            <ul className="grid gap-2.5">
              {activeRooms.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/komunitas/${r.slug}`}
                    className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 transition hover:border-brand-200 hover:bg-white hover:shadow-md"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-xl shadow-sm">{r.emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-ink">{r.name}</span>
                      <span className="block truncate text-sm text-slate-500">
                        <b className="font-semibold text-slate-600">{r.lastMessage!.authorName.split(" ")[0]}:</b> {r.lastMessage!.preview}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}
