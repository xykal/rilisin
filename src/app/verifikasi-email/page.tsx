import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { resendVerificationAction } from "@/app/actions/security";
import { ConfirmVerificationButton, ResendVerificationButton } from "@/components/verification-buttons";
import { Alert, Card } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { findValidVerification, readVerifyCookie } from "@/lib/auth/email-verification";
import { confirmVerificationAction } from "./actions";

export const metadata: Metadata = { title: "Verifikasi email", robots: { index: false }, referrer: "no-referrer" };

/**
 * Halaman tujuan link verifikasi email. Token ada di cookie httpOnly (bukan di URL), dan
 * verifikasi hanya jalan kalau pengguna menekan tombol — supaya pemindai link email tidak
 * sekaligus menghanguskan token.
 */
export default async function VerifyEmailPage({ searchParams }: PageProps<"/verifikasi-email">) {
  const { kedaluwarsa } = await searchParams;
  const pending = await findValidVerification(await readVerifyCookie());
  const user = await getCurrentUser();
  const verified = Boolean(user?.emailVerifiedAt);

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="mb-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <MailCheck className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-ink">Verifikasi email</h1>
        <p className="mt-1 text-sm text-slate-500">
          {verified
            ? "Email akunmu sudah terverifikasi. Tidak ada yang perlu dilakukan lagi."
            : "Satu langkah lagi: pastikan email di akunmu benar-benar milikmu."}
        </p>
      </div>

      <Card className="space-y-4 p-6 sm:p-8">
        {verified ? (
          <Alert tone="success" title="Sudah terverifikasi">
            {user?.email} sudah terverifikasi. Semua fitur akun sudah terbuka.
          </Alert>
        ) : pending ? (
          <>
            <Alert tone="info" title="Siap diverifikasi">
              Link dari email cocok dengan akun <b className="text-ink">@{pending.username}</b> ({pending.email}). Tekan tombol
              di bawah untuk menyelesaikan verifikasi.
            </Alert>
            <ConfirmVerificationButton action={confirmVerificationAction} />
          </>
        ) : (
          <>
            <Alert tone="warning" title={kedaluwarsa ? "Link sudah tidak berlaku" : "Belum ada link aktif"}>
              {kedaluwarsa
                ? "Link verifikasi sudah dipakai atau sudah lewat 24 jam. Minta link baru di bawah."
                : "Buka halaman ini lewat link di email verifikasi, atau minta link baru."}
            </Alert>
            <ResendVerificationButton action={resendVerificationAction} />
          </>
        )}
        <p className="text-center text-sm text-slate-500">
          <Link href="/akun/keamanan" className="font-semibold text-brand-700 hover:underline">
            Keamanan akun
          </Link>
          {" · "}
          <Link href="/" className="font-semibold text-brand-700 hover:underline">
            Beranda
          </Link>
        </p>
      </Card>
    </div>
  );
}
