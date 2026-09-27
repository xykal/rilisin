import { CalendarDays, Hand, Lightbulb, MessagesSquare, Newspaper, Presentation, Trophy } from "lucide-react";
import type { Metadata } from "next";
import { ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Komunitas" };

const PLANNED = [
  { icon: MessagesSquare, title: "Forum tanya-jawab", text: "Tanya soal coding, desain, rilis aplikasi, sampai urusan pajak & legal. Jawaban terbaik bisa ditandai." },
  { icon: Presentation, title: "Showcase", text: "Pamerkan karya yang sedang dikerjakan dan dapat masukan dari sesama kreator." },
  { icon: Newspaper, title: "Devlog", text: "Tulis catatan perjalanan membangun aplikasi/game — otomatis tertaut ke halaman karyamu." },
  { icon: Lightbulb, title: "Request aplikasi", text: "Pengguna mengusulkan ide aplikasi yang dibutuhkan; developer bisa mengambilnya." },
  { icon: Trophy, title: "Reputasi & badge", text: "Poin dari jawaban yang membantu dan karya yang disukai. Membuka fitur tambahan secara bertahap." },
  { icon: CalendarDays, title: "Event & game jam", text: "Tantangan bertema berkala dengan hadiah dan sorotan di beranda." },
];

export default function CommunityPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
          <Hand className="h-3.5 w-3.5" /> Segera hadir · Fase 3
        </span>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-ink">Komunitas kreator Indonesia</h1>
        <p className="mx-auto mt-3 max-w-2xl text-slate-600">
          Tempat developer, desainer, dan pengguna saling bantu. Kami bangun setelah fitur toko stabil, supaya komunitasnya langsung
          terhubung dengan karya-karya nyata.
        </p>
      </div>
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {PLANNED.map((f) => (
          <Card key={f.title} className="p-6">
            <f.icon className="h-6 w-6 text-brand-600" />
            <p className="mt-4 font-bold text-ink">{f.title}</p>
            <p className="mt-1 text-sm text-slate-600">{f.text}</p>
          </Card>
        ))}
      </div>
      <Card className="mt-10 p-8 text-center">
        <p className="font-bold text-ink">Aturan main sejak hari pertama</p>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">
          Tanpa SARA, tanpa spam, tanpa link bajakan. Ada tombol laporkan di setiap postingan, moderator relawan + admin, dan batasan
          untuk akun baru supaya bebas bot.
        </p>
        <ButtonLink href="/daftar" className="mt-6">Daftar sekarang, jadi yang pertama</ButtonLink>
      </Card>
    </div>
  );
}
