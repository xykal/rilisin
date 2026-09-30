import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = { title: "Offline" };

/** Halaman fallback saat tidak ada koneksi — disajikan service worker dari cache. Tanpa fetch data. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <WifiOff className="h-8 w-8" />
      </span>
      <h1 className="mt-6 text-2xl font-extrabold text-ink">Kamu lagi offline</h1>
      <p className="mt-2 text-sm text-slate-500">
        Koneksi internet putus. Periksa Wi-Fi/datamu, lalu coba lagi — halaman yang sudah dibuka tetap bisa dibaca dari cache.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
      >
        Coba lagi
      </Link>
    </main>
  );
}
