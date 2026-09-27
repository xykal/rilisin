import Link from "next/link";
import { CATEGORIES, SITE } from "@/lib/config";
import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-1">
          <Logo />
          <p className="mt-3 text-sm text-slate-500">{SITE.tagline}.</p>
          <p className="mt-4 text-xs text-slate-400">
            Prototype Fase 1 · nama &amp; domain masih sementara.
          </p>
        </div>
        <div>
          <p className="text-sm font-bold text-ink">Jelajahi</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            {CATEGORIES.map((c) => (
              <li key={c.slug}>
                <Link href={`/jelajahi?kategori=${c.slug}`} className="hover:text-brand-700">
                  {c.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold text-ink">Untuk kreator</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li><Link href="/seller" className="hover:text-brand-700">Mulai berbagi / jualan</Link></li>
            <li><Link href="/panduan/android" className="hover:text-brand-700">Verifikasi developer Android</Link></li>
            <li><Link href="/komunitas" className="hover:text-brand-700">Komunitas (segera)</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold text-ink">Bantuan &amp; legal</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li><span className="text-slate-400">Syarat &amp; Ketentuan (disusun sebelum launch)</span></li>
            <li><span className="text-slate-400">Kebijakan Privasi (disusun sebelum launch)</span></li>
            <li><span className="text-slate-400">Laporkan konten: tombol &quot;Laporkan&quot; di tiap produk (Fase 3)</span></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-100 py-5 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} {SITE.name} — dibuat untuk developer Indonesia.
      </div>
    </footer>
  );
}
