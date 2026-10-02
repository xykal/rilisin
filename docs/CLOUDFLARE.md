# Migrasi Cloudflare Workers ($0) — BERJALAN (langkah 1 selesai)

Status 2026-10-02: kall memutuskan lanjut Workers (izin komersial). Langkah 1 (bukti build + ukuran)
selesai, lihat bagian "Hasil bukti CI" di bawah. Catatan lama di bawah (DITUNDA 2026-09-29) dipertahankan sebagai riset.
Produksi untuk sementara tetap di Vercel Hobby (risiko: suspend sewaktu-waktu
karena pemakaian komersial — lihat `docs/CUTOVER.md`). Dokumen ini
adalah catatan audit agar migrasi bisa digas kapan saja tanpa riset ulang.

Lanjut/resume kalau: ada peringatan/suspend dari Vercel, ada pemasukan untuk
domain, atau traffic mendekati batas gratis Vercel.

## Vonis audit (2026-09-29)

BISA, Rp0 total (subdomain `*.workers.dev` gratis, tanpa kartu, tanpa laptop —
deploy dari GitHub Actions + `CLOUDFLARE_API_TOKEN`). Jalur resmi: adapter
OpenNext `@opennextjs/cloudflare` (pengganti next-on-pages yang deprecated).

Prasyarat kode (aplikasi TIDAK bisa pindah mentah):

1. DB → Hyperdrive (GRATIS di Workers Free: 100k query/hari, ±20 koneksi).
   `postgres.js` 3.4.9 didukung (min. 3.4.5). Ubahan: lazy client +
   `getCloudflareContext().env.HYPERDRIVE.connectionString` + `max: 5`.
   Neon Free tetap sebagai database (endpoint unpooled).
2. `sharp` → CABUT dari bundle (native, mustahil di Workers).
   `src/lib/uploads.ts` + `src/app/api/chat/uploads/route.ts`: gambar disimpan
   original (lebih besar, tanpa konversi/thumbnail otomatis).
3. Storage → driver R2 BARU (`STORAGE_DRIVER=r2`, SigV4 hand-rolled + fetch ke
   S3 API; `@aws-sdk` terlalu gemuk untuk batas 3 MB). Upload + `.rlsbak`.
   `node:fs` di 2 file harus lazy-import agar bundle tidak pecah.
4. ClamAV → MUSTAHIL di Workers. Mode `SCAN_DISABLED`: upload langsung `clean`
   + copot klaim footer "SEMUA file dipindai" (keputusan keamanan kelvin).
5. Chat realtime (LISTEN di `src/lib/chat/bus.ts`, `notify.ts`) → polling.
   Hyperdrive eksplisit tidak mendukung LISTEN/NOTIFY/advisory lock.
6. Bundle ≤3 MB (gzip) di Workers Free — MUAT ATAU TIDAK BARU KETAHUAN PAS
   BUILD. Buktikan via job CI (`opennextjs-cloudflare build`) sebelum janji.
   Fallback kalau jebol: Workers Paid $5/bln (tetap << $35 Vercel) atau diet dep.

Yang aman tanpa ubahan: Resend, Turnstile, Google OAuth custom
(`node:crypto` + fetch + drizzle-orm — semua Workers-safe), Pakasir (fetch),
`node:crypto/zlib/stream/path` (via flag `nodejs_compat`). Cron: cron-job.org
gratis menembak `/api/cron/harian` (nol kode). Rate-limit in-memory jadi
per-isolate (melemah, masih fungsi).

Batas Free yang relevan: 100k req/hari, CPU 10 ms/invokasi, RAM 128 MB/isolate,
50 subrequest/invokasi. Chat polling menggerogoti kuota — interval ≥5 detik dan
hanya saat tab chat terbuka.

Eksekusi harus ADITIF (staging Vercel tidak disentuh sampai cutover):
`wrangler.jsonc` + `open-next.config.ts` + job CI build-proof → R2 driver →
scan-disabled + polling → job CI deploy → cutover subdomain → dokumen.

Sumber: OpenNext troubleshooting (batas 3 MiB)
<https://opennext.js.org/cloudflare/troubleshooting>, Hyperdrive + postgres.js
<https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/>,
batas Hyperdrive Free
<https://mecanik.dev/en/posts/cloudflare-hyperdrive-postgres-from-the-edge/>,
Vercel vs Cloudflare Next.js
<https://vercel.com/kb/guide/next-js-on-vercel-vs-cloudflare>.

## Hasil bukti CI (2026-10-02, PR #20, job `Cloudflare build proof`)

Versi: @opennextjs/cloudflare 1.20.7, wrangler 4.147.0, Next 16.3.6. `proxy.ts` (Node middleware) TERBUILD
(OpenNext menandainya experimental). Ukuran diukur `wrangler deploy --dry-run` (batas Free: 3072 KiB gzip):

| Varian | gzip | Keterangan |
|---|---|---|
| base, tanpa minify | 4229 KiB | wrangler membundel ulang kode OpenNext tanpa minify |
| base + `"minify": true` | 3707 KiB | TIDAK muat |
| lean + minify | 2647 KiB | MUAT, sisa 425 KiB (14%) |

lean = (1) buang `/api/og` (next/og: resvg.wasm 518 KiB gzip) dan (2) `proxy.ts` -> edge `middleware.ts`
(bundle middleware 601 -> 91 KiB gzip). Keduanya wajib; salah satu saja belum cukup (3162 / 3197 KiB).
Hipotesis yang SALAH: `capsize-font-metrics.json` (4 MiB) ter-inline ke worker. Terbukti tidak (grep worker.js).

Belum terbukti (langkah berikut): CPU 10 ms/request di Free untuk SSR, Hyperdrive + `postgres.js`
per-request, `sharp` (upload/avatar/cover), chat tanpa LISTEN, penyimpanan R2, nasib ClamAV.
