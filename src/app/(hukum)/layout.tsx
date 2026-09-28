import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_DOCS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Dokumen hukum",
  description: "Syarat & ketentuan, kebijakan privasi, kuki, aturan pakai, dan refund Rilisin.",
  robots: { index: false }, // masih DRAFT (placeholder belum diisi) — jangan diindeks mesin pencari
};

/** Kerangka bersama untuk semua halaman dokumen hukum + peringatan DRAFT yang jujur. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <nav className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
        {LEGAL_DOCS.map((doc) => (
          <Link key={doc.slug} href={`/${doc.slug}`} className="hover:text-brand-700">
            {doc.title}
          </Link>
        ))}
      </nav>
      <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Masih draf</p>
        <p className="mt-1">
          Dokumen ini masih menunggu review pengacara berlisensi — bagian yang masih bertanda kurung siku (misalnya nama entitas,
          tanggal berlaku, dan persentase komisi) belum final dan akan diisi sebelum situs dibuka untuk publik.
        </p>
      </div>
      <article className="prose-rilis">{children}</article>
    </div>
  );
}
