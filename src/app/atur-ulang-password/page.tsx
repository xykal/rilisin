import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/password-reset-forms";
import { Alert, Card } from "@/components/ui";
import { findValidReset, readResetCookie } from "@/lib/auth/password-reset";

export const metadata: Metadata = { title: "Atur ulang password", robots: { index: false }, referrer: "no-referrer" };

export default async function ResetPasswordPage() {
  const reset = await findValidReset(await readResetCookie());
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="mb-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <KeyRound className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-ink">Atur ulang password</h1>
        {reset && (
          <p className="mt-1 text-sm text-slate-500">
            Untuk akun <b className="text-ink">@{reset.username}</b>. Setelah disimpan, semua perangkat yang sedang login akan dikeluarkan.
          </p>
        )}
      </div>
      <Card className="p-6 sm:p-8">
        {reset ? (
          <ResetPasswordForm username={reset.username} />
        ) : (
          <div className="space-y-4">
            <Alert tone="warning" title="Link tidak berlaku">
              Buka halaman ini lewat link di email reset password. Link hanya berlaku 30 menit dan sekali pakai.
            </Alert>
            <Link href="/lupa-password" className="block text-center text-sm font-semibold text-brand-700 hover:underline">
              Minta link baru
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}
