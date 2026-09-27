import { ExternalLink, Info, ShieldCheck, Smartphone, Terminal, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AndroidBadge } from "@/components/bits";
import { Alert, Card } from "@/components/ui";

export const metadata: Metadata = {
  title: "Panduan instal aplikasi Android (aturan 2026)",
  description: "Arti label verifikasi developer dan cara menginstal aplikasi Android dari luar Play Store setelah aturan baru 30 September 2026.",
};

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{n}</span>
      <div className="pt-1">
        <p className="font-semibold text-ink">{title}</p>
        <div className="mt-1 text-sm text-slate-600">{children}</div>
      </div>
    </li>
  );
}

export default function AndroidGuidePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
        <Smartphone className="h-3.5 w-3.5" /> Berlaku di Indonesia mulai 30 September 2026
      </span>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Panduan instal aplikasi Android</h1>
      <p className="mt-3 text-slate-600">
        Google mewajibkan developer aplikasi Android terverifikasi identitasnya — termasuk aplikasi yang dibagikan di luar Play Store,
        seperti di sini. Indonesia termasuk negara pertama (bersama Brasil, Singapura, dan Thailand). Berikut artinya buat kamu.
      </p>

      <Card className="mt-8 p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink"><Info className="h-5 w-5 text-brand-600" /> Apa yang berubah?</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>Di HP Android bersertifikasi Google (hampir semua HP yang dijual resmi), aplikasi hanya bisa <b>diinstal atau di-update</b> kalau developernya sudah terdaftar di Google.</li>
          <li>Aturan ini berlaku dari mana pun file APK-nya berasal: website, toko alternatif, atau kiriman teman.</li>
          <li>Aplikasi dari developer yang belum terdaftar <b>masih bisa diinstal</b>, tapi lewat &ldquo;mode lanjutan&rdquo; yang butuh setting sekali (lihat di bawah).</li>
          <li>Secara global, aturan ini menyusul bertahap mulai 2027.</li>
        </ul>
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="text-lg font-bold text-ink">Arti label di halaman aplikasi</h2>
        <dl className="mt-4 space-y-4 text-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
            <dt className="sm:w-56"><AndroidBadge registration="registered" checked /></dt>
            <dd className="text-slate-700">Developer menyatakan sudah terdaftar dan <b>moderator sudah mengecek buktinya</b>. Instal seperti biasa.</dd>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
            <dt className="sm:w-56"><AndroidBadge registration="registered" /></dt>
            <dd className="text-slate-700">Developer menyatakan sudah terdaftar, tapi buktinya <b>belum dicek</b> moderator. Biasanya bisa diinstal normal.</dd>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
            <dt className="sm:w-56"><AndroidBadge registration="not_registered" /></dt>
            <dd className="text-slate-700">Developer belum terdaftar. Kamu perlu mengaktifkan mode lanjutan sekali sebelum bisa menginstal.</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-slate-500">
          Catatan: saat ini belum ada cara resmi bagi pengguna untuk mengecek status pendaftaran sebuah APK, jadi label ini berdasarkan
          pernyataan developer + pengecekan moderator.
        </p>
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink"><ShieldCheck className="h-5 w-5 text-emerald-600" /> Instal aplikasi dari developer terdaftar</h2>
        <ol className="mt-5 space-y-5">
          <Step n={1} title="Download file APK">Klik tombol Download di halaman aplikasi (perlu login).</Step>
          <Step n={2} title="Buka file yang sudah terunduh">Dari notifikasi atau aplikasi File Manager.</Step>
          <Step n={3} title="Izinkan browser menginstal aplikasi">Kalau muncul peringatan, ketuk <i>Setelan</i> → aktifkan <i>Izinkan dari sumber ini</i> → kembali, lalu ketuk <i>Instal</i>.</Step>
        </ol>
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink"><TriangleAlert className="h-5 w-5 text-amber-600" /> Instal aplikasi dari developer yang belum terdaftar (mode lanjutan)</h2>
        <p className="mt-2 text-sm text-slate-600">Cukup dilakukan sekali. Nama menu bisa sedikit berbeda tergantung merek HP.</p>
        <ol className="mt-5 space-y-5">
          <Step n={1} title="Aktifkan Opsi Developer">Buka <i>Setelan → Tentang ponsel</i>, lalu ketuk <i>Nomor build</i> 7 kali sampai muncul pesan &ldquo;Anda sekarang developer&rdquo;.</Step>
          <Step n={2} title="Buka Opsi Developer">Biasanya di <i>Setelan → Sistem → Opsi developer</i>.</Step>
          <Step n={3} title="Aktifkan izin aplikasi dari developer tak terverifikasi">Cari opsi untuk mengizinkan aplikasi dari developer yang belum terverifikasi. Baca peringatannya, lalu konfirmasi dengan PIN / sidik jari.</Step>
          <Step n={4} title="Restart HP & tunggu 24 jam">Ada masa tunggu satu kali selama 24 jam — ini fitur keamanan supaya penipu tidak bisa memandu korban lewat telepon untuk menginstal aplikasi berbahaya secara instan.</Step>
          <Step n={5} title="Pilih durasi, lalu instal">Setelah masa tunggu, pilih izin berlaku 7 hari atau seterusnya. Saat menginstal akan muncul peringatan — ketuk <i>Tetap instal</i> kalau kamu yakin.</Step>
        </ol>
        <Alert tone="warning" className="mt-6">
          Kalau izin ini dimatikan lagi, aplikasi dari developer tak terverifikasi <b>tidak bisa di-update</b>. Jangan pernah mengaktifkan mode ini karena disuruh orang lewat telepon/chat.
        </Alert>
        <div className="mt-6 flex gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          <Terminal className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
          <p><b>Untuk yang paham teknis:</b> instal lewat ADB dari komputer (<code className="rounded bg-white px-1 font-mono text-xs">adb install nama-file.apk</code>) tetap bisa dilakukan seperti biasa.</p>
        </div>
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="text-lg font-bold text-ink">Untuk developer: daftar supaya pengguna bisa instal normal</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>Daftar dan verifikasi identitas di Android Developer Console (untuk distribusi di luar Play Store) atau Play Console, lalu daftarkan nama paket aplikasimu.</li>
          <li>Untuk pelajar / hobi, tersedia akun distribusi terbatas (maks. 20 perangkat) tanpa verifikasi identitas.</li>
          <li>Setelah terdaftar, pilih &ldquo;Sudah terdaftar&rdquo; di halaman kelola karya. Moderator bisa meminta bukti sebelum memberi label hijau.</li>
        </ul>
        <a
          href="https://developer.android.com/developer-verification"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
        >
          Info resmi Android Developers <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </Card>

      <p className="mt-8 text-center text-sm text-slate-500">
        Punya pertanyaan? Nanti bisa ditanyakan di <Link href="/komunitas" className="font-semibold text-brand-700 hover:underline">Komunitas</Link>.
      </p>
    </div>
  );
}
