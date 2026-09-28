import { BellOff, CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { unsubscribeAction } from "@/app/actions/notifications";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card } from "@/components/ui";
import { readUnsubscribeToken } from "@/lib/notifications/server";
import { NOTIFICATION_CATEGORIES } from "@/lib/notifications/shared";

export const metadata: Metadata = { title: "Berhenti berlangganan email", robots: { index: false } };

/**
 * Halaman konfirmasi dari link "Berhenti berlangganan" di email. Pakai tombol (POST), bukan langsung
 * saat dibuka — pemindai link email (antivirus, pratinjau) tidak ikut mematikan notifikasi user.
 */
export default async function UnsubscribePage({ searchParams }: PageProps<"/notifikasi/berhenti">) {
  const sp = await searchParams;
  const done = typeof sp.selesai === "string" ? NOTIFICATION_CATEGORIES.find((c) => c.id === sp.selesai) : undefined;
  const token = typeof sp.t === "string" ? sp.t : null;
  const t = token ? readUnsubscribeToken(token) : null;
  const cat = t ? NOTIFICATION_CATEGORIES.find((c) => c.id === t.category) : undefined;

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <Card className="p-6 text-center sm:p-8">
        {done ? (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <h1 className="mt-3 text-xl font-extrabold text-ink">Berhasil berhenti berlangganan</h1>
            <p className="mt-2 text-sm text-slate-600">
              Email &ldquo;{done.label}&rdquo; tidak akan dikirim lagi. Notifikasi di lonceng tetap ada. Bisa diaktifkan kembali kapan saja di{" "}
              <Link href="/akun/notifikasi" className="font-semibold text-brand-700 hover:underline">
                Pengaturan notifikasi
              </Link>
              .
            </p>
          </>
        ) : cat && token ? (
          <>
            <BellOff className="mx-auto h-10 w-10 text-slate-400" />
            <h1 className="mt-3 text-xl font-extrabold text-ink">Berhenti menerima email ini?</h1>
            <p className="mt-2 text-sm text-slate-600">
              Kategori: <b>{cat.label}</b>. {cat.description}
            </p>
            <form action={unsubscribeAction} className="mt-5">
              <input type="hidden" name="t" value={token} />
              <SubmitButton className="w-full" pendingText="Memproses…">
                Ya, berhenti berlangganan
              </SubmitButton>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-xl font-extrabold text-ink">Link tidak valid</h1>
            <Alert tone="warning" className="mt-4 text-left">
              Link berhenti berlangganan rusak atau kedaluwarsa. Atur email notifikasi langsung di{" "}
              <Link href="/akun/notifikasi" className="font-semibold underline">
                Pengaturan notifikasi
              </Link>{" "}
              (perlu masuk).
            </Alert>
          </>
        )}
      </Card>
    </div>
  );
}
