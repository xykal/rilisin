import type { Metadata } from "next";
import Link from "next/link";
import { GroupForm } from "@/components/chat/group-form";
import { getCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Buat grup baru",
  description: "Bikin grup chat publik atau privat dengan link undangan.",
};

export default async function NewGroupPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-5xl">💬</p>
        <h1 className="mt-4 text-2xl font-extrabold text-ink">Masuk dulu untuk bikin grup</h1>
        <p className="mt-2 text-sm text-slate-600">Grup cuma bisa dibuat akun yang sudah masuk.</p>
        <Link
          href="/masuk?next=/komunitas/baru"
          className="mt-6 inline-block rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-700"
        >
          Masuk / Daftar
        </Link>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <Link href="/komunitas" className="text-sm font-semibold text-violet-700 hover:underline">
        ← Kembali ke komunitas
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold text-ink">Buat grup baru</h1>
      <p className="mt-1 text-sm text-slate-600">Publik = semua orang bisa lihat & gabung. Privat = hanya via link undangan.</p>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <GroupForm />
      </div>
    </div>
  );
}
