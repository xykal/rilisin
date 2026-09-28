import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth-forms";
import { TurnstileScript } from "@/components/turnstile-script";
import { LogoMark } from "@/components/logo";
import { Card } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SITE } from "@/lib/config";
import { issueFormToken } from "@/lib/security/form-guard";
import { turnstilePublic } from "@/lib/security/turnstile";
import { safeNextPath } from "@/lib/slug";

export const metadata: Metadata = { title: "Daftar" };

export default async function RegisterPage({ searchParams }: PageProps<"/daftar">) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(next, "/");
  if (await getCurrentUser()) redirect(nextPath);
  const turnstile = turnstilePublic();

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="mb-8 text-center">
        <LogoMark className="mx-auto h-12 w-12" />
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-ink">Gabung {SITE.name}</h1>
        <p className="mt-1 text-sm text-slate-500">Gratis. Download karya developer lokal atau mulai rilis karyamu sendiri.</p>
      </div>
      <Card className="p-6 sm:p-8">
        {turnstile && <TurnstileScript />}
        <RegisterForm next={nextPath} formToken={issueFormToken()} turnstile={turnstile} />
      </Card>
    </div>
  );
}
