"use client";

import { Flag, Inbox, MessagesSquare, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./ui";

export function AdminTabs({ reviews, reports, contentReports, finance }: { reviews: number; reports: number; contentReports: number; finance: number | null }) {
  const pathname = usePathname();
  const tabs = [
    { href: "/admin/review", label: "Review karya", icon: Inbox, count: reviews },
    { href: "/admin/laporan", label: "Laporan chat", icon: Flag, count: reports },
    { href: "/admin/laporan/konten", label: "Laporan konten", icon: MessagesSquare, count: contentReports },
    ...(finance !== null ? [{ href: "/admin/keuangan", label: "Keuangan", icon: Wallet, count: finance }] : []),
    { href: "/admin/keamanan", label: "Keamanan", icon: ShieldCheck, count: 0 },
  ];
  return (
    <div className="sticky top-16 z-30 border-b border-slate-200/70 bg-white/90 backdrop-blur">
      <nav className="scroll-thin mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6" aria-label="Menu moderasi">
        {tabs.map((t) => {
          // Tab paling spesifik yang cocok (mis. /admin/laporan/konten bukan /admin/laporan)
          const best = tabs.filter((x) => pathname === x.href || pathname.startsWith(`${x.href}/`)).sort((a, b) => b.href.length - a.href.length)[0];
          const active = best?.href === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition-colors",
                active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-ink",
              )}
            >
              <t.icon className="h-4 w-4" /> {t.label}
              {t.count > 0 && <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{t.count}</span>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
