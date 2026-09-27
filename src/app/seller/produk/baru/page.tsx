import type { Metadata } from "next";
import Link from "next/link";
import { ProductForm } from "@/components/seller-forms";
import { Card } from "@/components/ui";
import { requireSeller } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Tambah karya" };

export default async function NewProductPage() {
  await requireSeller("/seller/produk/baru");
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/seller/produk" className="text-sm font-semibold text-brand-700 hover:underline">← Karya saya</Link>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-ink">Tambah karya baru</h1>
      <ol className="mb-6 mt-4 flex flex-wrap gap-2 text-xs font-semibold">
        <li className="rounded-full bg-brand-600 px-3 py-1 text-white">1. Info karya</li>
        <li className="rounded-full bg-slate-200 px-3 py-1 text-slate-600">2. Gambar &amp; file</li>
        <li className="rounded-full bg-slate-200 px-3 py-1 text-slate-600">3. Kirim ke review</li>
      </ol>
      <Card className="p-6 sm:p-8">
        <ProductForm />
      </Card>
    </div>
  );
}
