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

## Langkah 2a + 3 (2026-10-02, PR #20): keputusan dan bukti runtime lokal

Keputusan (kall delegasikan, XyDeveloper yang putuskan):
- OG: kartu statis `public/og.png` lewat `OG_STATIC=1`; `src/app/api/og` dibuang hanya di build Workers
  (`scripts/cloudflare/prepare.mjs`). Worker OG terpisah ditunda.
- `src/proxy.ts` jadi `src/middleware.ts` (edge-safe, Web Crypto). Next 16 mencetak peringatan deprecated.
  CI utama (smoke + security + ZAP) hijau dengan middleware ini (run 37033147303).
- ClamAV tetap lewat worker scan GitHub Actions dengan `REQUIRE_CLEAN_SCAN=1`.

Perubahan runtime (semuanya otomatis memilih jalur Workers hanya bila `navigator.userAgent === "Cloudflare-Workers"`
atau env tertentu; jalur Node/Vercel/Docker tidak berubah):
- `src/lib/db/index.ts`: `db` dan `pg` jadi proxy lazy. Di Workers klien postgres dibuat per request
  (WeakMap atas `ctx`), sumber: binding `HYPERDRIVE` bila ada, jika tidak `DATABASE_URL` (TCP langsung).
- `src/lib/image.ts`: `toWebp()` memakai sharp di Node dan binding Cloudflare Images (`IMAGES`) di Workers.
- `src/lib/storage/r2.ts` + `proxied.ts`: driver `STORAGE_DRIVER=r2` (binding `BUCKET`). Upload/unduh/media tetap
  lewat route aplikasi (token bertanda tangan yang sama dengan driver local). Body upload dibungkus
  `FixedLengthStream` karena R2 butuh panjang yang diketahui.
- `wrangler.jsonc`: `images`, `r2_buckets`, dan `run_worker_first` untuk `/sw.js` + `/OneSignalSDKWorker.js`
  (aset statis lain dilayani langsung dan tidak memakan kuota request; header CSP khusus SW butuh middleware).

Bukti (job `Cloudflare build proof`, wrangler dev = workerd lokal + Postgres service + R2/Images simulasi):
- Smoke test penuh melawan Worker: 367 lulus, 3 gagal (run 37037006196, commit c7e7f7c). CI utama di commit yang sama hijau (37037006250).
- Termasuk lulus: login, server action, upload ikon/cover/screenshot/APK (R2 + Images), review, API key,
  chat tulis/baca, forum, 2FA, pembayaran mock, rilis terjadwal.
- Ukuran: 2700 KiB gzip (batas 3072, gerbang CI 2900).

3 kegagalan yang tersisa:
1. `/api/og` (sengaja dibuang di build Workers).
2-3. Unduhan file seed (seed menulis ke disk lokal job, bukan R2, jadi 404 di mode R2). Artefak setup uji,
   bukan bug. Unduhan file hasil upload lewat R2 lulus di tes lain.
Sebelumnya ada kegagalan ke-4 (CSP service worker: aset statis tidak lewat middleware); diperbaiki dengan
`run_worker_first`, terbukti di run di atas.

Belum terbukti (hanya bisa di Cloudflare sungguhan): batas CPU 10 ms/request pada Free, perilaku Hyperdrive,
binding Images di edge (lokal disimulasikan), kuota 100k request/hari dengan polling chat.
Chat SSE (`/api/chat/stream`, LISTEN per proses) belum dipindah: di Workers harus polling.
