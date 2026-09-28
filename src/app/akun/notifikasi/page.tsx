import { Bell, Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NotificationPrefsForm, TestEmailForm } from "@/components/notification-forms";
import { Alert, Card } from "@/components/ui";
import { requireUser } from "@/lib/auth/guards";
import { emailConfigured, isUndeliverableAddress } from "@/lib/email";
import { getEmailPrefs } from "@/lib/notifications/server";

export const metadata: Metadata = { title: "Pengaturan notifikasi", robots: { index: false } };

export default async function NotificationSettingsPage() {
  const user = await requireUser("/akun/notifikasi");
  const prefs = await getEmailPrefs(user.id);
  const configured = emailConfigured();
  const demoAddress = isUndeliverableAddress(user.email);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Pengaturan notifikasi</h1>
      <p className="mt-1 text-slate-500">
        Semua notifikasi selalu muncul di{" "}
        <Link href="/notifikasi" className="font-semibold text-brand-700 hover:underline">
          lonceng
        </Link>
        . Di sini kamu atur mana yang juga dikirim ke email <b className="break-all text-ink">{user.email}</b>.
      </p>

      <Card className="mt-6 p-5 sm:p-7">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-ink">
          <Mail className="h-5 w-5 text-brand-600" /> Email
        </h2>
        {!configured && (
          <Alert tone="info" className="mb-4">
            Pengiriman email belum diaktifkan di server ini — pengaturan tetap disimpan dan berlaku begitu email aktif.
          </Alert>
        )}
        {configured && demoAddress && (
          <Alert tone="warning" className="mb-4">
            Akun ini memakai alamat demo/uji, jadi email tidak benar-benar dikirim. Daftar pakai email asli untuk mencoba.
          </Alert>
        )}
        <NotificationPrefsForm prefs={prefs} />
        <p className="mt-4 text-xs text-slate-500">
          Email penting soal keamanan akun (reset password, password diganti) dan bukti pembayaran selalu dikirim — tidak bisa dimatikan.
        </p>
      </Card>

      <Card className="mt-6 p-5 sm:p-7">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-ink">
          <Bell className="h-5 w-5 text-brand-600" /> Cek pengiriman
        </h2>
        <p className="mb-4 text-sm text-slate-500">Kirim email uji ke alamatmu untuk memastikan email kami tidak masuk folder spam.</p>
        <TestEmailForm enabled={configured && !demoAddress} />
      </Card>
    </div>
  );
}
