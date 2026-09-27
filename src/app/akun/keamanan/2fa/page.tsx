import { eq } from "drizzle-orm";
import { ShieldCheck, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { startTotpSetupAction } from "@/app/actions/security";
import { ConfirmTotpForm } from "@/components/security-forms";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth/guards";
import { TOTP_PURPOSE } from "@/lib/auth/mfa";
import { SITE } from "@/lib/config";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isWithin } from "@/lib/format";
import { decryptString } from "@/lib/security/crypto";
import { formatSecret, otpauthUri } from "@/lib/security/totp";

export const metadata: Metadata = { title: "Aktifkan 2FA", robots: { index: false } };

export default async function TotpSetupPage() {
  const user = await requireUser("/akun/keamanan/2fa");
  const [row] = await db
    .select({ pending: users.totpPendingEnc, enabledAt: users.totpEnabledAt })
    .from(users)
    .where(eq(users.id, user.id));
  // Baru saja diaktifkan → tetap render halaman yang sama supaya kode cadangan (hasil aksi) bisa tampil.
  const justEnabled = !!row?.enabledAt && isWithin(row.enabledAt, 10 * 60_000);
  if (user.mfaEnabled && !justEnabled) redirect("/akun/keamanan");
  const secret = user.mfaEnabled ? null : decryptString(row?.pending, TOTP_PURPOSE);

  if (!secret && !user.mfaEnabled) {
    return (
      <div className="mx-auto max-w-lg px-4 py-14 text-center">
        <h1 className="text-2xl font-extrabold text-ink">Aktifkan 2FA</h1>
        <p className="mt-2 text-slate-600">Sesi aktivasi belum dimulai atau sudah habis.</p>
        <form action={startTotpSetupAction} className="mt-6">
          <SubmitButton>Mulai aktivasi</SubmitButton>
        </form>
      </div>
    );
  }

  let qrSrc: string | null = null;
  if (secret) {
    const uri = otpauthUri({ secret, account: user.email, issuer: SITE.name });
    const svg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0f1222", light: "#ffffff" } });
    qrSrc = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold text-brand-700">
        <Link href="/akun/keamanan" className="hover:underline">Keamanan akun</Link> / Aktifkan 2FA
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">Aktifkan verifikasi 2 langkah</h1>
      <div className="mt-8 grid gap-6 md:grid-cols-[1fr_1.1fr]">
        <Card className="p-6 text-center">
          {secret && qrSrc ? (
            <>
              <p className="text-sm font-bold text-ink">1. Scan QR ini</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrSrc} alt="Kode QR untuk aplikasi authenticator" width={220} height={220} className="mx-auto mt-4 rounded-xl ring-1 ring-slate-200" />
              <p className="mt-4 text-xs text-slate-500">Tidak bisa scan? Ketik kode ini secara manual (jenis: berbasis waktu):</p>
              <p className="mt-1 select-all break-all rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm font-semibold tracking-wider text-ink">{formatSecret(secret)}</p>
            </>
          ) : (
            <div className="py-10">
              <ShieldCheck className="mx-auto h-14 w-14 text-emerald-600" />
              <p className="mt-3 font-bold text-ink">2FA sudah aktif</p>
              <p className="mt-1 text-sm text-slate-500">Kunci rahasia tidak ditampilkan lagi demi keamanan.</p>
            </div>
          )}
        </Card>
        <Card className="p-6">
          <ol className="space-y-3 text-sm text-slate-700">
            <li className="flex gap-3">
              <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
              <span>
                Pasang aplikasi authenticator di HP: <b>Google Authenticator</b>, <b>Microsoft Authenticator</b>, <b>Authy</b>, atau
                password manager seperti 1Password/Bitwarden.
              </span>
            </li>
            <li>
              <b>1.</b> Di aplikasi, pilih <i>Tambah akun → Scan kode QR</i>, lalu arahkan kamera ke QR di samping.
            </li>
            <li>
              <b>2.</b> Masukkan kode 6 digit yang muncul untuk &ldquo;{SITE.name}&rdquo;. Kode berganti setiap 30 detik.
            </li>
          </ol>
          <div className="mt-6">
            <ConfirmTotpForm enabled={user.mfaEnabled} />
          </div>
        </Card>
      </div>
    </div>
  );
}
