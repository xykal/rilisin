import { ChevronLeft, Lightbulb } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ThreadForm } from "@/components/forum/forum-forms";
import { Card } from "@/components/ui";
import { isStaff } from "@/lib/auth/current-user";
import { requireUser } from "@/lib/auth/guards";
import { getForumCategories, getProductForThread } from "@/lib/forum";
import { issueFormToken } from "@/lib/security/form-guard";

export const metadata: Metadata = { title: "Buat thread", robots: { index: false } };

export default async function NewThreadPage({ searchParams }: PageProps<"/forum/baru">) {
  const sp = await searchParams;
  const kategori = typeof sp.kategori === "string" ? sp.kategori : null;
  const produk = typeof sp.produk === "string" ? sp.produk : null;
  const next = `/forum/baru${kategori || produk ? `?${new URLSearchParams({ ...(kategori ? { kategori } : {}), ...(produk ? { produk } : {}) })}` : ""}`;
  const user = await requireUser(next);
  const staff = isStaff(user);
  const [categories, product] = await Promise.all([getForumCategories(), getProductForThread(produk)]);
  const preset =
    categories.find((c) => c.slug === kategori && (c.kind !== "announcement" || staff)) ??
    (product ? categories.find((c) => c.kind === "qa") : undefined);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href={product ? `/p/${product.slug}#diskusi` : preset ? `/forum/${preset.slug}` : "/forum"} className="-my-1 mb-5 inline-flex items-center gap-1 py-1 text-sm font-medium text-slate-500 hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Kembali
      </Link>
      <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Buat thread baru</h1>
      <p className="mt-1 text-slate-500">Satu topik per thread. Cari dulu di forum — siapa tahu sudah pernah dibahas.</p>

      <div className="mt-6 grid grid-cols-1 gap-6">
        <Card className="p-5 sm:p-7">
          <ThreadForm
            mode="create"
            formToken={issueFormToken()}
            categories={categories.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, description: c.description, disabled: c.kind === "announcement" && !staff }))}
            defaultCategoryId={preset?.id}
            product={product ? { id: product.id, title: product.title } : null}
          />
        </Card>
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Biar cepat dijawab</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-900/80">
              <li>Judul spesifik: sebut teknologi & masalahnya.</li>
              <li>Tempel error lengkap di blok kode (```), bukan screenshot.</li>
              <li>Sebutkan versi (Flutter 3.x, Next.js 16, Android 15, dst).</li>
              <li>Kalau sudah terpecahkan, tandai jawaban terbaik.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
