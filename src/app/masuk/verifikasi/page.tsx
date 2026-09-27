import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cancelMfaAction } from "@/app/actions/auth";
import { MfaVerifyForm } from "@/components/security-forms";
import { Card } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { readMfaChallenge } from "@/lib/auth/mfa";

export const metadata: Metadata = { title: "Verifikasi 2 langkah", robots: { index: false } };

export default async function MfaPage() {
  if (await getCurrentUser()) redirect("/");
  const challenge = await readMfaChallenge();
  if (!challenge) redirect("/masuk");

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="mb-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
          <ShieldCheck className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-ink">Verifikasi 2 langkah</h1>
        <p className="mt-1 text-sm text-slate-500">Password benar. Satu langkah lagi untuk memastikan ini benar-benar kamu.</p>
      </div>
      <Card className="p-6 sm:p-8">
        <MfaVerifyForm />
      </Card>
      <form action={cancelMfaAction} className="mt-4 text-center">
        <button type="submit" className="text-sm text-slate-500 hover:text-ink hover:underline">
          Batal &amp; kembali
        </button>
      </form>
    </div>
  );
}
