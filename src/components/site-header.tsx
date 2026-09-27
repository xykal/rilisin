import { and, count, eq } from "drizzle-orm";
import {
  ChevronDown,
  Library,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  Store,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { logoutAction } from "@/app/actions/auth";
import { getCurrentUser, isStaff } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { products, releases } from "@/lib/db/schema";
import { Avatar } from "./bits";
import { Dropdown } from "./dropdown";
import { Logo } from "./logo";
import { buttonStyles, cn } from "./ui";

async function pendingReviewCount() {
  const [[p], [r]] = await Promise.all([
    db.select({ n: count() }).from(products).where(eq(products.status, "review")),
    db
      .select({ n: count() })
      .from(releases)
      .innerJoin(products, eq(products.id, releases.productId))
      .where(and(eq(releases.status, "review"), eq(products.status, "published"))),
  ]);
  return (p?.n ?? 0) + (r?.n ?? 0);
}

const menuItem =
  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const staff = isStaff(user);
  const pending = staff ? await pendingReviewCount() : 0;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="shrink-0" aria-label="Beranda">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <Link href="/jelajahi" className={buttonStyles.ghost}>
            Jelajahi
          </Link>
          <Link href="/komunitas" className={buttonStyles.ghost}>
            Komunitas
          </Link>
          <Link href="/panduan/android" className={buttonStyles.ghost}>
            Panduan Android
          </Link>
        </nav>

        <form action="/jelajahi" className="ml-auto hidden flex-1 justify-end lg:flex">
          <label className="relative w-full max-w-xs">
            <span className="sr-only">Cari</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              type="search"
              placeholder="Cari aplikasi, game, template…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-100"
            />
          </label>
        </form>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <Link href="/jelajahi" className={cn(buttonStyles.ghost, "lg:hidden")} aria-label="Cari">
            <Search className="h-5 w-5" />
          </Link>

          {user ? (
            <>
              {staff && (
                <Link href="/admin/review" className={cn(buttonStyles.ghost, "relative max-sm:hidden")}>
                  <ShieldCheck className="h-4 w-4" />
                  Review
                  {pending > 0 && (
                    <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                      {pending}
                    </span>
                  )}
                </Link>
              )}
              <Link href="/library" className={cn(buttonStyles.ghost, "max-sm:hidden")}>
                <Library className="h-4 w-4" />
                Library
              </Link>
              <Suspense>
                <Dropdown
                  label="Menu akun"
                  summary={
                    <span className="flex items-center gap-1.5 rounded-xl p-1 hover:bg-slate-100">
                      <Avatar name={user.displayName} avatarKey={user.avatarKey} size={32} />
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    </span>
                  }
                >
                  <div className="border-b border-slate-100 px-3 pb-2.5 pt-2">
                    <p className="truncate text-sm font-bold text-ink">{user.displayName}</p>
                    <p className="truncate text-xs text-slate-500">@{user.username}</p>
                  </div>
                  <div className="py-1">
                    <Link href="/library" className={menuItem}>
                      <Library className="h-4 w-4" /> Library saya
                    </Link>
                    <Link href="/seller" className={menuItem}>
                      <Store className="h-4 w-4" /> {user.seller ? "Seller Center" : "Mulai jualan / berbagi"}
                    </Link>
                    {user.seller && (
                      <Link href={`/@${user.username}`} className={menuItem}>
                        <UserRound className="h-4 w-4" /> Profil publik
                      </Link>
                    )}
                    {staff && (
                      <Link href="/admin/review" className={menuItem}>
                        <ShieldCheck className="h-4 w-4" /> Antrian review
                        {pending > 0 && (
                          <span className="ml-auto rounded-full bg-amber-100 px-2 text-xs font-bold text-amber-800">{pending}</span>
                        )}
                      </Link>
                    )}
                  </div>
                  <form action={logoutAction} className="border-t border-slate-100 pt-1">
                    <button type="submit" className={cn(menuItem, "text-red-600 hover:bg-red-50")}>
                      <LogOut className="h-4 w-4" /> Keluar
                    </button>
                  </form>
                </Dropdown>
              </Suspense>
            </>
          ) : (
            <>
              <Link href="/masuk" className={cn(buttonStyles.ghost, "max-sm:hidden")}>
                Masuk
              </Link>
              <Link href="/daftar" className={buttonStyles.primary}>
                Daftar
              </Link>
            </>
          )}

          <Suspense>
            <Dropdown
              label="Menu navigasi"
              className="md:hidden"
              summary={
                <span className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-slate-100">
                  <Menu className="h-5 w-5" />
                </span>
              }
            >
              <Link href="/jelajahi" className={menuItem}>Jelajahi</Link>
              <Link href="/komunitas" className={menuItem}>Komunitas</Link>
              <Link href="/panduan/android" className={menuItem}>Panduan Android</Link>
              {!user && <Link href="/masuk" className={menuItem}>Masuk</Link>}
            </Dropdown>
          </Suspense>
        </div>
      </div>
    </header>
  );
}
