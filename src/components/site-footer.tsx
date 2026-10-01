import { cookies } from "next/headers";
import Link from "next/link";
import { setUiScaleAction } from "@/app/actions/ui-scale";
import { CATEGORIES, SITE } from "@/lib/config";
import { LEGAL_DOCS } from "@/lib/legal";
import { BRAND } from "@/config/brand";
import { InstallButton } from "./install-button";
import { Logo } from "./logo";

export async function SiteFooter() {
  const saved = (await cookies()).get("ui-scale")?.value;
  const cur = saved === "kecil" || saved === "besar" ? saved : "normal";
  return (
    <footer className="mt-20 border-t border-slate-200 bg-white">
      <div className="mx-auto grid grid-cols-1 max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-1">
          <Logo footer />
          <p className="mt-3 text-sm text-slate-500">{SITE.tagline}.</p>
          <p className="mt-4 text-xs text-slate-400">Prototype · dokumen hukum masih draf (menunggu review pengacara).</p>
          <InstallButton />
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
            <li><Link href="/komunitas" className="hover:text-brand-700">Komunitas</Link></li>
            <li><Link href="/komunitas/aturan" className="hover:text-brand-700">Aturan komunitas</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold text-ink">Bantuan &amp; legal</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            {LEGAL_DOCS.map((doc) => (
              <li key={doc.slug}>
                <Link href={`/${doc.slug}`} className="hover:text-brand-700">
                  {doc.title}
                </Link>
              </li>
            ))}
            <li><Link href="/keamanan" className="hover:text-brand-700">Pusat Keamanan</Link></li>
            <li><a href="/.well-known/security.txt" className="hover:text-brand-700">Lapor celah keamanan</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-100 px-4 py-5 text-center text-xs text-slate-400">
        <form action={setUiScaleAction} data-form="ui-scale" className="mx-auto mb-3 flex w-fit items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
          <span className="px-2 font-semibold text-slate-500">Tampilan:</span>
          {(["kecil", "normal", "besar"] as const).map((s) => (
            <button
              key={s}
              type="submit"
              name="scale"
              value={s}
              aria-pressed={cur === s}
              className={
                cur === s
                  ? "min-h-[36px] rounded-full bg-white px-3 font-bold text-brand-700 shadow-sm ring-1 ring-slate-200"
                  : "min-h-[36px] rounded-full px-3 font-semibold text-slate-500 hover:text-slate-800"
              }
            >
              {s === "kecil" ? "Kecil" : s === "normal" ? "Normal" : "Besar"}
            </button>
          ))}
        </form>
        © {new Date().getFullYear()} {SITE.name} — dibuat untuk developer Indonesia.
        <br />
        Ditenagai oleh {BRAND.company}.
      </div>
    </footer>
  );
}
