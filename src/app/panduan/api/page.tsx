import { KeyRound, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card } from "@/components/ui";
import { pageOg } from "@/lib/og";

const DESC = "Dokumentasi API v1 Rilisin: API key, scope, dan endpoint untuk AI agent & integrasi.";

export const metadata: Metadata = {
  title: "API untuk AI agent",
  description: DESC,
  ...pageOg("API untuk AI agent", DESC, "/panduan/api"),
};

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl bg-ink p-4 font-mono text-[13px] leading-relaxed text-slate-100">
      <code>{children}</code>
    </pre>
  );
}

function Endpoint({ method, path, scope, children }: { method: "GET" | "POST"; path: string; scope: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <p className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-2 py-0.5 font-mono text-xs font-bold text-white ${method === "GET" ? "bg-emerald-600" : "bg-blue-600"}`}>{method}</span>
        <code className="break-all font-mono text-sm font-bold text-ink">{path}</code>
      </p>
      <p className="mt-1 font-mono text-xs text-slate-500">scope: {scope}</p>
      <div className="mt-3 grid gap-3 text-sm text-slate-600">{children}</div>
    </Card>
  );
}

export default function ApiGuidePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
        <KeyRound className="h-3.5 w-3.5" /> API v1
      </span>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">API untuk AI agent</h1>
      <p className="mt-3 text-slate-600">
        AI agent (Claude, GPT, n8n, skrip sendiri) bisa bantu kerja sebagai seller — bikin draft produk, bikin rilis, upload file — atau bantu admin baca
        statistik. Semua lewat API key ber-scope yang kamu buat di{" "}
        <Link href="/akun/api-key" className="font-semibold text-violet-700 hover:underline">
          halaman API key
        </Link>
        .
      </p>

      <Alert tone="info" className="mt-6">
        <span className="font-bold">Keamanan by design:</span> key diawali <code className="font-mono text-xs">rsk_</code>, yang disimpan cuma hash-nya, secret tampil
        sekali. Scope dikunci ke peranmu. Batas 300 request/menit per key. Key bocor? Cabut 1 klik — key lain tetap jalan.
      </Alert>

      <h2 className="mb-3 mt-10 text-xl font-extrabold text-ink">1. Bikin key</h2>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
        <li>
          Buka <Link href="/akun/api-key" className="font-semibold text-violet-700 hover:underline">/akun/api-key</Link> → beri nama (mis. “Agen Claude”).
        </li>
        <li>Pilih scope sesuai kebutuhan (lihat tabel di bawah).</li>
        <li>Salin secret-nya ke agent. Hilang = bikin baru, tidak bisa diintip ulang.</li>
      </ol>

      <h2 className="mb-3 mt-10 text-xl font-extrabold text-ink">2. Scope</h2>
      <div className="overflow-hidden rounded-xl border border-slate-200 text-sm">
        <table className="w-full bg-white">
          <thead>
            <tr className="bg-slate-50 text-left">
              <th className="px-4 py-2.5 font-mono text-xs">scope</th>
              <th className="px-4 py-2.5">bisa apa</th>
              <th className="px-4 py-2.5">syarat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="px-4 py-2.5 font-mono text-xs font-bold">seller:read</td>
              <td className="px-4 py-2.5">daftar produk sendiri</td>
              <td className="px-4 py-2.5">toko approved</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-mono text-xs font-bold">seller:write</td>
              <td className="px-4 py-2.5">bikin draft produk, bikin rilis, upload file</td>
              <td className="px-4 py-2.5">toko approved</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-mono text-xs font-bold">admin:read</td>
              <td className="px-4 py-2.5">statistik admin (read-only)</td>
              <td className="px-4 py-2.5">moderator/admin</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 mt-10 text-xl font-extrabold text-ink">3. Endpoint</h2>
      <p className="mb-4 text-sm text-slate-600">
        Base URL: <code className="rounded bg-slate-100 px-1 font-mono text-xs">https://rilisin.xyverse.my.id</code> (staging, nanti domain produksi). Semua
        request wajib header <code className="rounded bg-slate-100 px-1 font-mono text-xs">Authorization: Bearer rsk_…</code>. Respons selalu JSON.
      </p>
      <div className="grid gap-4">
        <Endpoint method="GET" path="/api/v1/me" scope="key apa pun">
          <p>Cek key valid + lihat scope yang menempel.</p>
          <Code>{`curl -H "Authorization: Bearer rsk_xxx" \\\n  https://rilisin.xyverse.my.id/api/v1/me`}</Code>
        </Endpoint>
        <Endpoint method="GET" path="/api/v1/products" scope="seller:read">
          <p>Daftar produk milik sendiri (maks 50, terbaru dulu).</p>
        </Endpoint>
        <Endpoint method="POST" path="/api/v1/products" scope="seller:write">
          <p>Bikin draft produk. Field wajib: title (3–80), summary (10–160), category, platforms (array), license. Maks 20/hari (kuota gabung dashboard).</p>
          <Code>{`curl -X POST -H "Authorization: Bearer rsk_xxx" -H "Content-Type: application/json" \\\n  -d '{"title":"Kasir Mini","summary":"Aplikasi kasir offline buat warung.","category":"aplikasi","platforms":["android"],"license":"MIT"}' \\\n  https://rilisin.xyverse.my.id/api/v1/products`}</Code>
        </Endpoint>
        <Endpoint method="POST" path="/api/v1/products/:id/releases" scope="seller:write">
          <p>Bikin draft rilis: version (mis. 1.0.0) + changelogMd. Satu produk cuma boleh 1 draft dalam antrean.</p>
        </Endpoint>
        <Endpoint method="GET" path="/api/v1/admin/stats" scope="admin:read">
          <p>Statistik ringkas: total user/produk, produk tayang/review, antrean toko, laporan terbuka.</p>
        </Endpoint>
      </div>

      <h2 className="mb-3 mt-10 text-xl font-extrabold text-ink">4. Upload file rilis via API</h2>
      <p className="mb-3 text-sm text-slate-600">
        Endpoint upload dashboard (<code className="rounded bg-slate-100 px-1 font-mono text-xs">/api/uploads/*</code>) menerima Bearer key scope{" "}
        <code className="rounded bg-slate-100 px-1 font-mono text-xs">seller:write</code> (tanpa cek origin). Alur 3 langkah:
      </p>
      <Code>{`# 1. init → dapat uploadUrl + token (targetId = id rilis draft)
curl -X POST -H "Authorization: Bearer rsk_xxx" -H "Content-Type: application/json" \\
  -d '{"purpose":"release-file","targetId":"<id-rilis>","filename":"app.apk","size":12345678,"platform":"android"}' \\
  https://rilisin.xyverse.my.id/api/uploads/init

# 2. PUT file mentah ke uploadUrl
curl -X PUT -H "Content-Type: application/octet-stream" --data-binary @app.apk "<uploadUrl>"

# 3. complete → file ditempel ke rilis + masuk antrean scan antivirus
curl -X POST -H "Authorization: Bearer rsk_xxx" -H "Content-Type: application/json" \\
  -d '{"token":"<token>"}' \\
  https://rilisin.xyverse.my.id/api/uploads/complete`}</Code>

      <Alert tone="info" className="mt-6">
        <span className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-bold">Kirim ke review tetap aksi manusia.</span> API sengaja tidak menyediakan tombol “kirim/tayang” — AI menyiapkan draft +
            file, manusia yang memeriksa & menekan kirim di dashboard. Batas yang sehat buat agen otonom.
          </span>
        </span>
      </Alert>
    </div>
  );
}
