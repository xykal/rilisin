"use client";

import { ArrowRight, Bell, BellRing, BookOpenCheck, ChevronDown, Flame, Gift, KeyRound, Library, LogIn, Menu, MessageCircleQuestion, MessagesSquare, ReceiptText, Rocket, ScrollText, Search, ShieldCheck, Smartphone, Sparkles, Store, Tag, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CategoryIcon, PlatformIcon } from "./icons";
import { cn } from "./ui";

export type NavData = {
  categories: { slug: string; label: string; description: string; count: number }[];
  platforms: { slug: string; label: string }[];
  featured: { slug: string; title: string; summary: string; iconUrl: string | null; price: string }[];
  rooms: { slug: string; name: string; emoji: string; description: string }[];
  forum: { slug: string; name: string; emoji: string; description: string }[];
};

type MenuId = "jelajahi" | "komunitas" | "panduan";

const GUIDES: { href: string; label: string; text: string; icon: LucideIcon }[] = [
  {
    href: "/panduan/android",
    label: "Instal aplikasi Android",
    text: "Aturan verifikasi developer 2026 & cara instal aman",
    icon: Smartphone,
  },
  { href: "/panduan/api", label: "API untuk AI agent", text: "Key, scope & endpoint v1 buat integrasi", icon: KeyRound },
  { href: "/keamanan", label: "Pusat Keamanan", text: "Cara kami melindungi akun, file, dan komunitas", icon: ShieldCheck },
  { href: "/komunitas/aturan", label: "Aturan Komunitas", text: "Etika ngobrol, moderasi, dan cara melapor", icon: ScrollText },
  { href: "/seller", label: "Mulai rilis karya", text: "Upload gratis — bagikan atau jual karyamu", icon: Rocket },
];

const QUICK = [
  { href: "/jelajahi?harga=gratis", label: "Gratis", icon: Gift },
  { href: "/jelajahi?harga=berbayar", label: "Berbayar", icon: Tag },
  { href: "/jelajahi?sort=baru", label: "Baru rilis", icon: Sparkles },
  { href: "/jelajahi?sort=populer", label: "Terpopuler", icon: Flame },
];

function Heading({ children }: { children: ReactNode }) {
  return <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{children}</p>;
}

function Thumb({ url, title, size = 44 }: { url: string | null; title: string; size?: number }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-xl object-cover ring-1 ring-slate-200/70"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl bg-brand-100 font-bold text-brand-700"
      style={{ width: size, height: size }}
    >
      {title[0]}
    </span>
  );
}

// ─── Desktop: menu turun (mega menu) saat hover / klik / keyboard ──────────
export function DesktopNav({ data }: { data: NavData }) {
  const [open, setOpen] = useState<MenuId | null>(null);
  const [overlayTop, setOverlayTop] = useState(64);
  const timer = useRef(0);
  const navRef = useRef<HTMLElement>(null);

  const show = useCallback((id: MenuId) => {
    window.clearTimeout(timer.current);
    const header = navRef.current?.closest("header");
    if (header) setOverlayTop(header.getBoundingClientRect().bottom);
    setOpen(id);
  }, []);
  const hideSoon = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(null), 180);
  }, []);
  const close = useCallback(() => {
    window.clearTimeout(timer.current);
    setOpen(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onScroll = () => {
      const header = navRef.current?.closest("header");
      if (header) setOverlayTop(header.getBoundingClientRect().bottom);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open, close]);

  const menus: { id: MenuId; label: string }[] = [
    { id: "jelajahi", label: "Jelajahi" },
    { id: "komunitas", label: "Komunitas" },
    { id: "panduan", label: "Panduan" },
  ];

  return (
    <>
      <nav
        ref={navRef}
        aria-label="Menu utama"
        className="hidden items-center gap-0.5 md:flex"
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") window.clearTimeout(timer.current);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") hideSoon();
        }}
      >
        {menus.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-expanded={open === m.id}
            aria-controls={`menu-${m.id}`}
            onPointerEnter={(e) => {
              if (e.pointerType !== "mouse") return;
              window.clearTimeout(timer.current);
              const id = m.id;
              timer.current = window.setTimeout(() => show(id), open ? 0 : 90);
            }}
            onClick={() => (open === m.id ? close() : show(m.id))}
            className={cn(
              "inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
              open === m.id ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-100",
            )}
          >
            {m.label}
            <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open === m.id && "rotate-180")} />
          </button>
        ))}

        {open && (
          <div
            id={`menu-${open}`}
            className="anim-slide-down absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain border-b border-slate-200/80 bg-white shadow-2xl shadow-slate-900/10"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a")) close();
            }}
          >
            {open === "jelajahi" && (
              <>
                <div className="mx-auto grid grid-cols-1 max-w-7xl gap-8 px-6 py-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,1.2fr)]">
                  <div className="min-w-0">
                    <Heading>Kategori</Heading>
                    <div className="grid grid-cols-2 gap-1">
                      {data.categories.map((c) => (
                        <Link
                          key={c.slug}
                          href={`/jelajahi?kategori=${c.slug}`}
                          className="group flex items-start gap-3 rounded-2xl p-3 transition-colors hover:bg-brand-50/70"
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                            <CategoryIcon category={c.slug} />
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-2 font-semibold text-ink">
                              {c.label}
                              <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-bold text-slate-500">{c.count}</span>
                            </span>
                            <span className="block text-[13px] leading-snug text-slate-500">{c.description}</span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div className="min-w-0 max-lg:hidden">
                    <Heading>Platform</Heading>
                    <ul className="grid gap-0.5">
                      {data.platforms.map((p) => (
                        <li key={p.slug}>
                          <Link
                            href={`/jelajahi?platform=${p.slug}`}
                            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <PlatformIcon platform={p.slug} className="h-4 w-4 text-slate-500" /> {p.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <Heading>
                      <span className="mt-4 block">Pintasan</span>
                    </Heading>
                    <div className="flex flex-wrap gap-1.5 px-3">
                      {QUICK.map((q) => (
                        <Link
                          key={q.href}
                          href={q.href}
                          className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-brand-100 hover:text-brand-800"
                        >
                          <q.icon className="h-3.5 w-3.5" /> {q.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div className="min-w-0 max-lg:hidden">
                    <Heading>Pilihan editor</Heading>
                    <div className="flex flex-col gap-1">
                      {data.featured.map((f) => (
                        <Link key={f.slug} href={`/p/${f.slug}`} className="flex items-center gap-3 rounded-2xl p-2.5 hover:bg-slate-50">
                          <Thumb url={f.iconUrl} title={f.title} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-ink">{f.title}</span>
                            <span className="block truncate text-[13px] text-slate-500">{f.summary}</span>
                          </span>
                          <span className="shrink-0 text-xs font-bold text-brand-700">{f.price}</span>
                        </Link>
                      ))}
                    </div>
                    <Link
                      href="/jelajahi"
                      className="mt-2 inline-flex items-center gap-1 px-3 text-sm font-semibold text-brand-700 hover:underline"
                    >
                      Lihat semua karya <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
                <div className="border-t border-slate-100 bg-slate-50/80">
                  <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-6 py-3 text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" /> Setiap file dicek tipe &amp; hash-nya, lalu direview tim sebelum
                      tayang.
                    </span>
                    <Link href="/seller" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
                      Punya karya? Rilis gratis <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </>
            )}

            {open === "komunitas" && (
              <div className="mx-auto grid grid-cols-1 max-w-7xl gap-8 px-6 py-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
                <div className="min-w-0">
                  <Heading>Ruang obrolan (chat)</Heading>
                  <div className="grid grid-cols-2 gap-1">
                    {data.rooms.map((r) => (
                      <Link
                        key={r.slug}
                        href={`/komunitas/${r.slug}`}
                        className="flex items-start gap-3 rounded-2xl p-3 hover:bg-brand-50/70"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl">
                          {r.emoji}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold text-ink">{r.name}</span>
                          <span className="line-clamp-2 text-[13px] leading-snug text-slate-500">{r.description}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="min-w-0">
                  <Heading>Forum</Heading>
                  <div className="space-y-0.5">
                    {data.forum.map((c) => (
                      <Link key={c.slug} href={`/forum/${c.slug}`} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-brand-50/70">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-base">{c.emoji}</span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-ink">{c.name}</span>
                          <span className="block truncate text-xs text-slate-500">{c.description}</span>
                        </span>
                      </Link>
                    ))}
                    <Link href="/forum" className="mt-1 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50/70">
                      Semua thread <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
                <div className="min-w-0 rounded-3xl bg-gradient-to-br from-brand-600 to-violet-600 p-6 text-white max-xl:hidden">
                  <MessagesSquare className="h-8 w-8 text-white/90" />
                  <p className="mt-3 text-lg font-extrabold">Chat untuk ngobrol, forum untuk arsip</p>
                  <p className="mt-1 text-sm text-white/80">
                    Tanya jawab di forum tersimpan & bisa dicari lagi — tandai jawaban terbaik. Obrolan cepat di chat, dengan filter anti spam &amp; judol.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link href="/forum/baru" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
                      Buat thread
                    </Link>
                    <Link href="/komunitas/aturan" className="rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/25">
                      Aturan
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {open === "panduan" && (
              <div className="mx-auto grid grid-cols-1 max-w-7xl gap-1 px-6 py-6 sm:grid-cols-2 lg:grid-cols-4">
                {GUIDES.map((g) => (
                  <Link key={g.href} href={g.href} className="group rounded-2xl p-4 hover:bg-brand-50/70">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                      <g.icon className="h-5 w-5" />
                    </span>
                    <span className="mt-3 block font-semibold text-ink">{g.label}</span>
                    <span className="block text-[13px] leading-snug text-slate-500">{g.text}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>
      {/* Portal di LUAR <nav> (di pohon React juga) supaya kursor keluar ke latar = menu tertutup */}
      {open &&
        createPortal(
          <div
            className="anim-fade-in fixed inset-x-0 bottom-0 z-30 bg-slate-900/15 backdrop-blur-[2px]"
            style={{ top: overlayTop }}
            onClick={close}
            aria-hidden="true"
          />,
          document.body,
        )}
    </>
  );
}

// ─── HP: laci menu dari kanan ───────────────────────────────────────────────
export function MobileNav({
  data,
  user,
}: {
  data: NavData;
  user: { displayName: string; username: string; isSeller: boolean; isStaff: boolean; pending: number; unread: number } | null;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 200);
  }, []);

  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const item = "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-slate-700 active:bg-slate-100";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buka menu"
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <div
              className={cn("absolute inset-0 bg-slate-900/40 backdrop-blur-sm", closing ? "anim-fade-out" : "anim-fade-in")}
              onClick={close}
            />
            <div
              ref={panelRef}
              tabIndex={-1}
              className={cn(
                "absolute inset-y-0 right-0 flex w-[88%] max-w-sm flex-col bg-white shadow-2xl outline-none",
                closing ? "anim-drawer-out" : "anim-drawer-in",
              )}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a")) close();
              }}
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
                <p className="min-w-0 truncate font-extrabold text-ink">{user ? `Hai, ${user.displayName.split(" ")[0]} 👋` : "Menu"}</p>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Tutup menu"
                  className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-6 pt-3">
                <form action="/jelajahi" className="relative mb-4" onSubmit={() => close()}>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    name="q"
                    type="search"
                    placeholder="Cari aplikasi, game, template…"
                    className="w-full rounded-xl bg-slate-100 py-2.5 pl-9 pr-3 text-[15px] placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200"
                  />
                </form>

                <Heading>Kategori</Heading>
                <div className="grid grid-cols-2 gap-1.5">
                  {data.categories.map((c) => (
                    <Link
                      key={c.slug}
                      href={`/jelajahi?kategori=${c.slug}`}
                      className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 active:bg-brand-50"
                    >
                      <CategoryIcon category={c.slug} className="h-4 w-4 shrink-0 text-brand-600" />
                      {/* boleh 2 baris (bukan dipotong "Templ…") — laci di HP kecil cuma ±250px */}
                      <span className="min-w-0 leading-tight">{c.label}</span>
                    </Link>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {QUICK.map((q) => (
                    <Link
                      key={q.href}
                      href={q.href}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
                    >
                      <q.icon className="h-3.5 w-3.5" /> {q.label}
                    </Link>
                  ))}
                </div>

                <div className="mt-5">
                  <Heading>Komunitas</Heading>
                  {data.rooms.slice(0, 5).map((r) => (
                    <Link key={r.slug} href={`/komunitas/${r.slug}`} className={item}>
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-base">{r.emoji}</span>{" "}
                      {r.name}
                    </Link>
                  ))}
                  <Link href="/komunitas" className={cn(item, "text-brand-700")}>
                    <MessagesSquare className="h-5 w-5" /> Semua ruang obrolan
                  </Link>
                  <Link href="/forum" className={item}>
                    <MessageCircleQuestion className="h-5 w-5 text-slate-500" /> Forum — tanya jawab &amp; diskusi
                  </Link>
                </div>

                <div className="mt-5">
                  <Heading>Panduan</Heading>
                  {GUIDES.slice(0, 3).map((g) => (
                    <Link key={g.href} href={g.href} className={item}>
                      <g.icon className="h-5 w-5 text-slate-500" /> {g.label}
                    </Link>
                  ))}
                </div>

                <div className="mt-5 border-t border-slate-100 pt-4">
                  {user ? (
                    <>
                      <Heading>Akun @{user.username}</Heading>
                      <Link href="/notifikasi" className={item}>
                        <Bell className="h-5 w-5 text-slate-500" /> Notifikasi
                        {user.unread > 0 && <span className="ml-auto rounded-full bg-red-500 px-2 text-xs font-bold text-white">{user.unread}</span>}
                      </Link>
                      <Link href="/library" className={item}>
                        <Library className="h-5 w-5 text-slate-500" /> Library saya
                      </Link>
                      <Link href="/akun/pesanan" className={item}>
                        <ReceiptText className="h-5 w-5 text-slate-500" /> Pesanan saya
                      </Link>
                      <Link href="/akun/diikuti" className={item}>
                        <BellRing className="h-5 w-5 text-slate-500" /> Diikuti
                      </Link>
                      <Link href="/seller" className={item}>
                        <Store className="h-5 w-5 text-slate-500" /> {user.isSeller ? "Seller Center" : "Mulai jualan / berbagi"}
                      </Link>
                      <Link href="/akun/keamanan" className={item}>
                        <KeyRound className="h-5 w-5 text-slate-500" /> Keamanan akun
                      </Link>
                      {user.isStaff && (
                        <Link href="/admin/review" className={item}>
                          <BookOpenCheck className="h-5 w-5 text-slate-500" /> Moderasi
                          {user.pending > 0 && (
                            <span className="ml-auto rounded-full bg-amber-500 px-2 text-xs font-bold text-white">{user.pending}</span>
                          )}
                        </Link>
                      )}
                    </>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        href="/masuk"
                        className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-800"
                      >
                        <LogIn className="h-4 w-4" /> Masuk
                      </Link>
                      <Link
                        href="/daftar"
                        className="flex items-center justify-center rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white"
                      >
                        Daftar gratis
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
