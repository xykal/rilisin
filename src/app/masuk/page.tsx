import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-forms";
import { LogoMark } from "@/components/logo";
import { Card } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { safeNextPath } from "@/lib/slug";

export const metadata: Metadata = { title: "Masuk" };

const DEMO_ACCOUNTS = [
  { email: "user@rilisin.test", role: "Pengguna biasa" },
  { email: "seller@rilisin.test", role: "Seller (Nusantara Labs)" },
  { email: "admin@rilisin.test", role: "Admin / moderator" },
];

export default async function LoginPage({ searchParams }: PageProps<"/masuk">) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(next, "/");
  if (await getCurrentUser()) redirect(nextPath);

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="mb-8 text-center">
        <LogoMark className="mx-auto h-12 w-12" />
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-ink">Masuk ke akunmu</h1>
        <p className="mt-1 text-sm text-slate-500">Download karya, pantau update, dan kelola tokomu.</p>
      </div>
      <Card className="p-6 sm:p-8">
        <LoginForm next={nextPath} />
      </Card>
      <div className="mt-6 rounded-2xl border border-dashed border-brand-300 bg-brand-50/60 p-4 text-sm">
        <p className="font-semibold text-brand-800">Akun demo (password: rilisin123)</p>
        <ul className="mt-2 space-y-1 text-brand-900/80">
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.email} className="flex justify-between gap-3">
              <code className="font-mono text-xs">{a.email}</code>
              <span className="text-xs">{a.role}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-brand-900/60">Login Google ditambahkan saat deploy (butuh akun Google Cloud).</p>
      </div>
    </div>
  );
}
