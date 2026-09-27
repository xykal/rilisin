import { Ban, EyeOff, Flag, HeartHandshake, Lock, MessageCircleWarning, ShieldCheck, Timer, UserX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { CHAT_LIMITS } from "@/lib/chat/shared";

export const metadata: Metadata = { title: "Aturan Komunitas" };

const RULES = [
  { icon: HeartHandshake, title: "Saling menghargai", text: "Kritik karya boleh, menyerang orangnya jangan. Tidak ada bullying, body shaming, atau doxxing (menyebar data pribadi orang)." },
  { icon: Ban, title: "Tanpa SARA & ujaran kebencian", text: "Konten yang menyerang suku, agama, ras, antargolongan, gender, atau disabilitas akan dihapus dan pelakunya bisa diblokir." },
  { icon: MessageCircleWarning, title: "No spam, judol, pinjol ilegal, penipuan", text: "Promosi judi online diblokir otomatis. Promosi berulang, link mencurigakan, dan modus \"investasi\" akan dihapus tanpa peringatan." },
  { icon: Lock, title: "Tanpa bajakan", text: "Dilarang membagikan APK mod/crack, akun premium ilegal, atau link download bajakan — termasuk karya sesama kreator." },
  { icon: EyeOff, title: "Tanpa konten dewasa & kekerasan", text: "Komunitas ini terbuka untuk pelajar juga. Jaga konten tetap aman untuk semua umur." },
  { icon: ShieldCheck, title: "Jaga keamanan akun", text: "Jangan pernah membagikan password, kode OTP, atau kode 2FA ke siapa pun — termasuk yang mengaku tim Rilisin." },
];

export default function RulesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-sm font-semibold text-brand-700">
        <Link href="/komunitas" className="hover:underline">Komunitas</Link> / Aturan
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Aturan Komunitas Rilisin</h1>
      <p className="mt-3 text-slate-600">
        Ruang obrolan Rilisin bersifat publik: semua anggota yang login bisa membaca pesan, dan tamu bisa melihat cuplikan terbarunya.
        Aturan ini berlaku untuk semua ruang.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {RULES.map((r) => (
          <Card key={r.title} className="p-5">
            <r.icon className="h-6 w-6 text-brand-600" />
            <p className="mt-3 font-bold text-ink">{r.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{r.text}</p>
          </Card>
        ))}
      </div>

      <h2 className="mt-12 text-xl font-bold text-ink">Cara kerja moderasi</h2>
      <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700">
        <li className="flex gap-3">
          <Flag className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <span>
            <b>Laporkan:</b> tahan pesan (atau klik kanan di komputer) → <i>Laporkan</i>. Laporan anonim. Kalau{" "}
            {CHAT_LIMITS.reportHideThreshold} anggota berbeda melaporkan pesan yang sama, pesan otomatis disembunyikan sampai dicek
            moderator.
          </span>
        </li>
        <li className="flex gap-3">
          <Timer className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <span>
            <b>Anti-spam otomatis:</b> batas kecepatan kirim, deteksi pesan berulang, mode lambat di ruang ramai, dan akun baru belum
            bisa mengirim link selama {CHAT_LIMITS.newAccountLinkHours} jam pertama.
          </span>
        </li>
        <li className="flex gap-3">
          <UserX className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" />
          <span>
            <b>Sanksi bertahap:</b> pesan dihapus → dibisukan (1 jam / 24 jam / 7 hari) → akun diblokir. Pelanggaran berat (judol,
            penipuan, bajakan, konten ilegal) bisa langsung diblokir.
          </span>
        </li>
      </ul>

      <h2 className="mt-12 text-xl font-bold text-ink">Edit &amp; hapus pesan</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
        <li>Pesan bisa <b>diedit</b> sampai 15 menit setelah dikirim (ada label &ldquo;diedit&rdquo;).</li>
        <li>
          <b>Hapus untuk saya</b> menyembunyikan pesan hanya dari tampilanmu. <b>Hapus untuk semua orang</b> bisa dilakukan sampai 48
          jam setelah dikirim.
        </li>
        <li>
          Demi penanganan laporan penyalahgunaan, salinan pesan yang diedit/dihapus disimpan maksimal 30 hari dan hanya bisa dilihat
          moderator, lalu dihapus permanen.
        </li>
      </ul>
    </div>
  );
}
