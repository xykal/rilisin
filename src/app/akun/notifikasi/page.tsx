import { Bell, Mail, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NotificationPrefsForm, PushPrefsForm, TestEmailForm, TestPushForm } from "@/components/notification-forms";
import { PushDevicePanel } from "@/components/push-settings";
import { Alert, Card } from "@/components/ui";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { requireUser } from "@/lib/auth/guards";
import { emailConfigured, isUndeliverableAddress } from "@/lib/email";
import { getEmailPrefs } from "@/lib/notifications/server";
import { getPushPrefs, pushConfigured } from "@/lib/notifications/push";

export const metadata: Metadata = { title: "Pengaturan notifikasi", robots: { index: false } };

export default async function NotificationSettingsPage() {
  const user = await requireUser("/akun/notifikasi");
  const prefs = await getEmailPrefs(user.id);
  const pushPrefs = await getPushPrefs(user.id);
  const pushOn = pushConfigured();
  const configured = emailConfigured();
  const demoAddress = isUndeliverableAddress(user.email);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Pengaturan notifikasi</h1>
      <VerifyEmailBanner />
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
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-ink">
          <Smartphone className="h-5 w-5 text-brand-600" /> Push HP
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          Notifikasi penting langsung masuk ke HP — walau browser ditutup. Aktifkan dulu per perangkat, lalu atur kategorinya.
        </p>
        {!pushOn && (
          <Alert tone="info" className="mb-4">
            Push belum diaktifkan di server ini (butuh kunci OneSignal) — pengaturan tetap disimpan dan berlaku begitu push aktif.
          </Alert>
        )}
        {pushOn && (
          <div className="mb-6">
            <PushDevicePanel />
          </div>
        )}
        <PushPrefsForm prefs={pushPrefs} />
      </Card>

      <Card className="mt-6 p-5 sm:p-7">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-ink">
          <Bell className="h-5 w-5 text-brand-600" /> Cek pengiriman
        </h2>
        <p className="mb-4 text-sm text-slate-500">Kirim email uji ke alamatmu untuk memastikan email kami tidak masuk folder spam.</p>
        <TestEmailForm enabled={configured && !demoAddress} />
        <div className="mt-6 border-t border-slate-100 pt-6">
          <h3 className="mb-2 font-bold text-ink">Push HP</h3>
          <p className="mb-4 text-sm text-slate-500">Kirim push uji ke perangkatmu sendiri. Kalau tidak masuk, cek status “Push aktif” di kartu atas.</p>
          <TestPushForm enabled={pushOn} />
        </div>
      </Card>
    </div>
  );
}
