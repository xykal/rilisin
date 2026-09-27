import {
  Bot,
  Eye,
  FileCheck2,
  Fingerprint,
  KeyRound,
  Lock,
  MessageSquareWarning,
  MonitorSmartphone,
  ScanSearch,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Card } from "@/components/ui";
import { SITE } from "@/lib/config";

export const metadata: Metadata = {
  title: "Pusat Keamanan",
  description: `Cara ${SITE.name} melindungi akun, file, pembayaran, dan komunitas — plus tips aman untuk pengguna.`,
};

const SECTIONS = [
  {
    title: "Akun kamu",
    items: [
      { icon: KeyRound, title: "Verifikasi 2 langkah (2FA)", text: "Kode 6 digit dari aplikasi authenticator + 10 kode cadangan sekali pakai. Wajib untuk admin & moderator." },
      { icon: Fingerprint, title: "Password disimpan dengan scrypt", text: "Password tidak pernah disimpan mentah. Password umum/mudah ditebak ditolak saat daftar & ganti password." },
      { icon: Lock, title: "Anti brute force", text: "Batas percobaan per IP & per akun, akun dikunci sementara setelah 8 kali salah, verifikasi 2FA maksimal 5 percobaan." },
      { icon: MonitorSmartphone, title: "Kontrol perangkat", text: "Lihat semua perangkat yang login, keluarkan yang tidak dikenal. Ganti password = semua perangkat lain otomatis keluar." },
    ],
  },
  {
    title: "File & karya",
    items: [
      { icon: FileCheck2, title: "Cek isi file, bukan cuma nama", text: "Tipe file dicek dari isinya (magic bytes), APK harus berisi AndroidManifest, dan hash SHA-256 dicatat." },
      { icon: ScanSearch, title: "Review manusia + daftar hitam hash", text: "Karya baru direview tim sebelum tayang. File berbahaya diblokir permanen lewat hash-nya. Pemindai antivirus otomatis menyusul (Fase 4)." },
      { icon: ShieldCheck, title: "Download lewat link sementara", text: "File diunduh lewat signed URL yang berlaku 10 menit & terikat ke akunmu — tidak bisa disebar ulang." },
    ],
  },
  {
    title: "Komunitas",
    items: [
      { icon: Bot, title: "Filter spam & judol otomatis", text: "Promosi judi online diblokir (termasuk trik 5l0t g4c0r), batas kecepatan kirim, deteksi pesan berulang, mode lambat." },
      { icon: MessageSquareWarning, title: "Laporkan & sembunyikan otomatis", text: "Tahan pesan → Laporkan. Dilaporkan 3 anggota = disembunyikan sampai dicek moderator. Pelapor tetap anonim." },
      { icon: Eye, title: "Peringatan link luar", text: "Link di chat membuka peringatan dulu, dan akun baru belum bisa mengirim link selama 24 jam pertama." },
    ],
  },
  {
    title: "Teknis",
    items: [
      { icon: ServerCog, title: "Header keamanan ketat", text: "Content-Security-Policy dengan nonce, HSTS, anti-clickjacking, nosniff, Referrer-Policy, Permissions-Policy." },
      { icon: Lock, title: "Cookie & CSRF", text: "Session di cookie httpOnly + Secure (__Host-). Setiap aksi mengecek asal request (Origin) supaya situs lain tidak bisa memalsukan aksi." },
      { icon: ShieldAlert, title: "Log keamanan & privasi", text: "Login, 2FA, dan aksi moderator dicatat. IP hanya disimpan sebagai hash (sesuai semangat UU PDP)." },
    ],
  },
];

export default function SecurityCenterPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="max-w-2xl">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Pusat Keamanan</h1>
        <p className="mt-3 text-slate-600">
          Transparan soal cara kami melindungi akun, karya, dan komunitas {SITE.name}. Beberapa perlindungan (pemindai antivirus,
          captcha, pembayaran) sedang disiapkan dan ditandai sebagai fase berikutnya.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/akun/keamanan">Cek keamanan akunku</ButtonLink>
          <ButtonLink href="/komunitas/aturan" variant="secondary">
            Aturan komunitas
          </ButtonLink>
        </div>
      </div>

      {SECTIONS.map((s) => (
        <section key={s.title} className="mt-12">
          <h2 className="text-xl font-bold text-ink">{s.title}</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {s.items.map((it) => (
              <Card key={it.title} className="p-5">
                <it.icon className="h-6 w-6 text-brand-600" />
                <p className="mt-3 font-bold text-ink">{it.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{it.text}</p>
              </Card>
            ))}
          </div>
        </section>
      ))}

      <section className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-amber-200 bg-amber-50/60 p-6">
          <p className="font-bold text-amber-900">Tips aman untuk kamu</p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-amber-900/90">
            <li>Tim {SITE.name} <b>tidak pernah</b> meminta password, OTP, atau kode 2FA — lewat chat, email, maupun WhatsApp.</li>
            <li>Selalu cek alamat situs sebelum login. Jangan login dari link yang dikirim orang lain.</li>
            <li>Jangan pernah membayar di luar platform (transfer langsung ke seller) — tidak ada perlindungan pembeli.</li>
            <li>Instal APK hanya dari halaman karya resmi, cek label verifikasi developer Android-nya.</li>
          </ul>
        </Card>
        <Card className="p-6">
          <p className="font-bold text-ink">Menemukan celah keamanan?</p>
          <p className="mt-2 text-sm text-slate-600">
            Laporkan secara bertanggung jawab — jangan dipublikasikan sebelum kami perbaiki. Kontak & kebijakan ada di{" "}
            <a href="/.well-known/security.txt" className="font-semibold text-brand-700 hover:underline">
              security.txt
            </a>
            . Kami berterima kasih atas setiap laporan yang valid.
          </p>
          <p className="mt-3 text-xs text-slate-400">
            Status prototype: belum diaudit pihak ketiga. Audit keamanan independen dijadwalkan sebelum pembayaran asli diaktifkan.{" "}
            <Link href="/panduan/android" className="underline">
              Panduan Android
            </Link>
          </p>
        </Card>
      </section>
    </div>
  );
}
