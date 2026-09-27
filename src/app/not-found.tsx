import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <Compass className="h-8 w-8" />
      </span>
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-ink">Halaman tidak ditemukan</h1>
      <p className="mt-2 text-slate-600">Mungkin karyanya sudah dihapus, belum tayang, atau link-nya salah ketik.</p>
      <div className="mt-8 flex gap-3">
        <ButtonLink href="/">Ke beranda</ButtonLink>
        <ButtonLink href="/jelajahi" variant="secondary">Jelajahi karya</ButtonLink>
      </div>
    </div>
  );
}
