import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/logo";
import { ForgotPasswordForm } from "@/components/password-reset-forms";
import { TurnstileScript } from "@/components/turnstile-script";
import { Alert, Card } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { RESET_TTL_MIN } from "@/lib/auth/password-reset";
import { issueFormToken } from "@/lib/security/form-guard";
import { turnstilePublic } from "@/lib/security/turnstile";

export const metadata: Metadata = { title: "Lupa password", robots: { index: false } };

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/lupa-password">) {
  const { kedaluwarsa } = await searchParams;
  if (await getCurrentUser()) redirect("/akun/keamanan");
  const turnstile = turnstilePublic();
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="mb-8 text-center">
        <LogoMark className="mx-auto h-12 w-12" />
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-ink">Lupa password</h1>
        <p className="mt-1 text-sm text-slate-500">Masukkan email akunmu. Kami kirim link untuk mengatur ulang password (berlaku {RESET_TTL_MIN} menit).</p>
      </div>
      {kedaluwarsa === "1" && (
        <Alert tone="warning" className="mb-4">
          Link reset sudah tidak berlaku (kedaluwarsa, sudah dipakai, atau ada link yang lebih baru). Minta link baru di bawah.
        </Alert>
      )}
      <Card className="p-6 sm:p-8">
        {turnstile && <TurnstileScript />}
        <ForgotPasswordForm formToken={issueFormToken()} turnstile={turnstile} />
      </Card>
    </div>
  );
}
