Start: 2026-09-27

Catatan: tanggal mulai = tanggal commit pertama repo (2026-09-27). Log sebelum
hari ini tidak ada ("tidak ada log") — tidak diisi aktivitas karangan.

## 2026-09-27 — hari kerja ke-0 (estimasi dari riwayat git, BUKAN log kerja)

Ditulis ulang oleh audit 2026-09-28 dari 17 commit git: Fase 1 fondasi + share
gratis, komunitas (chat/forum), Fase 2 pembayaran Pakasir, Fase 3b follow/devlog/
lapor, Fase 4 keamanan & operasi (ClamAV worker, Turnstile, rate limit bersama,
cron, backup terenkripsi). Status: tidak ada log asli untuk hari ini.

## 2026-09-28 — hari kerja ke-1

Done:
- Clone + audit repo rilisin (struktur, CI, auth, upload, webhook, rate limit,
  supply chain). Temuan di docs/AUDIT-2026-09-28.md.
- Pin actions/checkout & actions/setup-node ke commit SHA asli (diverifikasi via
  git ls-remote) di 4 workflow — supply-chain risk [CRIT] ditutup.
- Tambah src/config/brand.ts (sumber tunggal atribusi XyVerse) + meta author di
  layout + baris "Powered by" di footer.
- Tambah LICENSE (proprietary, DRAFT), THIRD_PARTY_NOTICES.md (24 dependency,
  license asli dari registry npm), PROGRESS.md, IDEAS.md, docs/AUDIT-2026-09-28.md.

Blocked:
- Verifikasi CI butuh push ke main + Actions (token GitHub dari kall). Lint/
  typecheck/build/smoke test tidak dijalankan lokal (larangan sandbox).

Next:
- Proposal [MED]: pindahkan blueprint ke docs/PRD.md + docs/ROADMAP.md.
- Proposal [MED]: job security di CI (osv-scanner, semgrep, trivy).
- Proposal [MED]: draft Terms/Privacy/Cookie/AUP sebelum launch publik.

Lanjutan hari yang sama (kall: "bebas"):
- docs/PRD.md (problem, model bisnis berlabel ASSUMPTION, threat model, free-tier
  plan, milestone tanggal nyata) + docs/ROADMAP.md (target sampai gerbang launch).
- Job `security` di ci.yml: `npm audit --audit-level=high` dari lockfile (tanpa
  install), deploy sekarang butuh test + security. Catatan: osv-scanner TIDAK
  tersedia sebagai paket npm resmi (registry 404) — npm audit dipilih agar tidak
  menambah pihak ketiga baru di CI.

Lanjutan (kall: "gas") — proving test keamanan:
- tests/security/lib.mjs + tests/security/proving-tests.mjs (npm run test:security,
  jalan di CI setelah server menyala): header keamanan, batas auth (401 tanpa login),
  CSRF (origin asing 403, content-type salah 415, Sec-Fetch-Site cross-site 403),
  traversal token & injeksi SQLi/XSS (400/403/escape, data tidak berubah), validasi
  body & parameter, IDOR chat (edit/hapus/pin pesan orang lain 403, pesan sendiri
  tidak bisa dilaporkan), flag cookie session, dan rate limit: chat 30/menit,
  upload-init 60/10 menit, notifikasi 60/menit — semuanya dibuktikan membalas 429.
- Bug yang ketemu waktu bikin tes: nilai atribut HTML ter-escape (&quot;) WAJIB
  di-decode sebelum di-POST ulang, kalau tidak deskriptor Server Action rusak dan
  server membalas 500. Sudah diperbaiki di tests/security/lib.mjs.
- CI hijau (3 job) di https://github.com/xykal/rilisin/actions/runs/36491062365 —
  deploy staging ikut jalan.

Lanjutan (kall: "gas" lagi) — SAST + identitas visual:
- .github/workflows/codeql.yml: CodeQL untuk javascript-typescript (build-mode none,
  tidak perlu build Next.js), jalan tiap push + cron mingguan. Action di-pin ke
  commit SHA asli v4 (2892aa5e…, diverifikasi: tag v4 = annotated tag 7999b86c →
  commit 2892aa5e).
- Triage 2 alert CodeQL (dua-duanya false positive, ditutup dengan alasan tercatat
  di GitHub): sha256Hex dipakai untuk token MFA (bukan password — password pakai
  scrypt N=16384), dan image.url di composer adalah blob URL/URL server (bukan teks
  user). Rincian masuk SECURITY.md bagian 5.
- docs/DESIGN.md: identitas visual Rilisin (tipografi, skala brand + hasil hitung
  kontras WCAG AA asli, radius, elevation, aturan motion, daftar trope yang dilarang,
  rencana dark mode & ikon XyVerse).
- README bilingual: ringkasan English di atas + footer atribusi XyVerse dua bahasa.
- SECURITY.md disegarkan: daftar "belum ada" dibersihkan (Turnstile/ClamAV/reset
  password sudah jalan) + bagian SAST & triage.
- CI hijau (3 job) https://github.com/xykal/rilisin/actions/runs/36494437791 dan
  CodeQL hijau https://github.com/xykal/rilisin/actions/runs/36494437741.

Lanjutan (kall: "gas" lagi) — legal draft:
- docs/legal/: README (status + placeholder + keputusan bisnis yang belum diambil),
  TERMS.md, PRIVACY.md (inventaris & retensi data diambil dari skema DB asli +
  hak subjek data UU PDP 27/2022 + notifikasi pelanggaran 3x24 jam), COOKIES.md
  (3 cookie yang benar-benar dipasang aplikasi: session 30 hari, MFA 10 menit,
  reset 30 menit), AUP.md (larangan malware/bajakan/judol + konsekuensi bertingkat),
  REFUND.md (kapan diberikan/tidak + catatan UU Perlindungan Konsumen 8/1999 yang
  harus dikonfirmasi pengacara). Semua DRAFT-marked, bilingual (ID mengikat),
  placeholder [NAMA ENTITAS]/[EMAIL]/[KOTA] belum diisi karena entitas belum dibentuk.

Lanjutan (kall: "gas" lagi) — login sungguhan: Google OAuth + verifikasi email + halaman hukum publik:
- Migrasi drizzle/0006_auth_oauth.sql (tulis tangan, tanpa drizzle-kit lokal): kolom
  users.email_verified_at, tabel email_verifications & oauth_accounts, dan
  users.password_hash jadi nullable (akun daftar-via-Google tidak punya password).
- src/lib/auth/oauth.ts: Google OAuth 2.0 + PKCE S256 tanpa dependency baru (state &
  code_verifier dibawa dalam satu cookie HttpOnly bertanda tangan HMAC, 10 menit, sekali
  pakai). Aturan penautan: email Google wajib email_verified; penautan ke akun lama hanya
  kalau email akun itu sudah diverifikasi — akun lokal yang emailnya BELUM diverifikasi
  DITOLAK (menutup celah pra-pendaftaran: daftar pakai email orang lain lalu ambil alih
  akun Google-nya). Penautan dari /akun/keamanan hanya untuk email yang sama.
- Route: /api/auth/google (307 + cookie state) & /api/auth/google/callback (semua gagal →
  redirect /masuk dengan kode generik, tidak membocorkan detail). Tombol "Lanjutkan dengan
  Google" hanya dirender kalau GOOGLE_CLIENT_ID/SECRET diisi.
- Verifikasi email: src/lib/auth/email-verification.ts (token 32 byte, hanya hash-nya
  disimpan, 24 jam, sekali pakai), link email → /verifikasi-email/buka memindahkan token ke
  cookie HttpOnly lalu redirect ke URL bersih; verifikasi butuh klik tombol (pemindai link
  email tidak menghanguskannya). Dikirim otomatis setelah daftar + tombol kirim ulang.
- Halaman hukum publik: /ketentuan, /privasi, /kuki, /aup, /refund. Isi dibaca dari modul
  src/content/legal/*.ts yang DIHASILKAN dari docs/legal/*.md (scripts/sync-legal.mjs) —
  CI menjalankan `npm run legal:check` supaya keduanya tidak pernah beda. Semua halaman
  masih noindex + banner "Masih draf" karena placeholder belum diisi.
- Tes: tests/security/fake-google.mjs (Google palsu di CI, bukan kredensial sungguhan) +
  bagian baru di proving tests (PKCE S256, cookie state HttpOnly+SameSite=Lax, state palsu
  ditolak tanpa session, email_verified=false ditolak, pra-pendaftaran ditolak, tiket sekali
  pakai) + smoke test mengecek kelima halaman hukum & /verifikasi-email.
- Kredensial Google produksi TIDAK masuk repo: hanya env (GOOGLE_CLIENT_ID/SECRET). Redirect
  URI https://rilisin.xyverse.my.id/api/auth/google/callback masih harus didaftarkan kall di
  Google Cloud Console sebelum login Google bisa dipakai di staging/produksi.

Verifikasi (commit 735c2ff): CI hijau 3 job https://github.com/xykal/rilisin/actions/runs/36499733841
(Build & test, Security scan dependency, Deploy staging) + CodeQL
https://github.com/xykal/rilisin/actions/runs/36499733844. Semua tes login Google lolos:
PKCE S256, cookie tiket HttpOnly + SameSite=Lax + Max-Age 600, state palsu ditolak tanpa
session, alur penuh membuat session, email_verified=false ditolak, pra-pendaftaran ditolak,
identitas yang sama bisa dipakai ulang, tiket sekali pakai, kelima halaman hukum 200.
Commit perbaikan tes: 6b8847c (fitur) → 8caf8b6 (BASE import) → 92c6689 (nama cookie) →
604d04c (tunggu form guard) → 735c2ff (status halaman verifikasi).

2026-09-29 — kredensial Google Rilisin:
- kall kirim OAuth client KHUSUS Rilisin (project dykal-5e2b9,
  client_id ...p9h48et6vp9msa35s1hgf6o61jecnklv.apps.googleusercontent.com) dengan
  redirect URI https://rilisin.xyverse.my.id/api/auth/google/callback SUDAH terdaftar.
  Kredensial masuk file kerja lokal kall (uploads/ini-buat-kerja.txt — file .json-nya
  dikonversi ke format teks polos, 61 nilai terverifikasi pindah utuh), TIDAK masuk repo.
- Sisa satu langkah biar login Google nyala di staging: isi env Vercel
  GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET, lalu deploy ulang (CI deploy otomatis jalan
  saat push ke main, tapi env baru butuh redeploy).

Lanjutan 2026-09-29 (kall: "gas" buat env Vercel):
- Env Vercel project `rilisin` (prj_iadpXfsAy8ah0OaBQAhAaU8BBrpD) diisi lewat REST API
  pakai token Vercel dari file kerja lokal: `GOOGLE_CLIENT_ID` +
  `GOOGLE_CLIENT_SECRET` (type encrypted, target production + preview). Nilai TIDAK
  masuk repo/chat — cuma dicek lewat API (201 Created, lalu terdaftar di daftar env).
- Redeploy produksi dipicu lewat API (deployment dpl_DqgZ8dUdecaLBcdyRrP8f7WAUoHU,
  commit 4333ca9) → readyState READY. Staging rilisin.xyverse.my.id menjawab lagi
  (region sin1) dengan 401 site-lock seperti biasa.
- BELUM terverifikasi dari sandbox: tombol "Lanjutkan dengan Google" di halaman
  /masuk staging dan putaran penuh ke Google sungguhan — staging dikunci Basic Auth
  dan kredensial site-lock tidak ada di file kerja. Perlu kall buka sendiri.
- Catatan bagus: `RESEND_API_KEY` + `EMAIL_FROM` sudah ada di env Vercel, jadi email
  verifikasi (dan reset password) akan benar-benar terkirim di staging, bukan cuma log.

Verifikasi staging 2026-09-29 (pakai kredensial site-lock yang ditarik lewat Vercel CLI
`env pull`, tidak disimpan ke repo):
- `/masuk` → 200 dan BENAR-BENAR menampilkan tautan "Lanjutkan dengan Google" + teks
  "Login Google aktif" (bukti env Vercel kebaca di runtime, bukan cuma terdaftar).
- `/api/auth/google` → 307 ke `https://accounts.google.com/o/oauth2/v2/auth` dengan
  client_id client Rilisin, `redirect_uri=https://rilisin.xyverse.my.id/api/auth/google/callback`,
  `scope=openid email profile`, `code_challenge_method=S256`, state 43 karakter, dan cookie
  tiket `__Secure-rilisin_oauth` → `Secure; HttpOnly; SameSite=lax; Max-Age=600; Path=/`.
- Kelima halaman hukum (`/ketentuan` `/privasi` `/kuki` `/aup` `/refund`) → 200 dengan banner
  "Masih draf", dan `/verifikasi-email` → 200.
- Yang masih butuh manusia: klik tombol Google di staging lalu selesaikan consent Google
  (butuh akun Google + sesi browser; tidak bisa dilakukan dari sandbox).

Perbaikan 500 saat klik Google di staging 2026-09-29 (laporan kall: halaman error
Chrome "500 Internal Server Error" dari rilisin.xyverse.my.id sesudah klik):
- BUKAN soal "Authorized JavaScript origins" (kall sempat tanya). JS origins hanya
  untuk popup Google Identity Services; alur kita server-side redirect, jadi yang
  dipakai cuma Authorized redirect URI — dan itu sudah terdaftar benar.
- Akar masalah: migrasi `0006_auth_oauth` (tabel `oauth_accounts` +
  `email_verifications`, kolom `email_verified_at`, `password_hash` nullable) belum
  pernah jalan di DB staging. CI selalu hijau karena CI migrate ke DB uji yang fresh
  tiap run; Vercel build tidak menjalankan migrasi; tidak ada langkah migrate manual
  ke staging sesudah commit 6b8847c. Callback menabrak tabel yang tidak ada → 500.
- Sempat terkecoh: kolom `id` (SERIAL, mulai dari 1) di `__drizzle_migrations`
  dikira nomor migrasi, padahal migrator drizzle hanya membandingkan `created_at`
  vs `when` di journal. Baris 1..6 = migrasi 0000..0005 (hash sha256 cocok semua),
  0006 memang belum ada. Tidak ada migrasi misterius.
- Perbaikan: `npx tsx scripts/migrate.ts` dijalankan ke DB staging pakai
  `DATABASE_URL_UNPOOLED` (diambil sementara via `vercel env pull`, lalu dihapus;
  tidak masuk repo). Hasil: baris 7 = hash 0006_auth_oauth, kedua tabel + kolom ada,
  `password_hash` nullable. Dependensi migrator diinstal di /tmp (bukan di repo).
- Pengaman tambahan (commit ini): `src/app/api/auth/google/callback/route.ts`
  dibungkus try/catch penuh — gangguan backend sesaat tidak akan pernah jadi
  halaman 500 lagi, selalu redirect ke `/masuk?oauth=gagal`. README langkah
  produksi Google ditambah catatan JS origins tidak perlu + migrasi wajib manual.
- Sisa: kall klik ulang tombol Google di staging (harusnya sekarang lolos sampai
  consent Google / langsung masuk).

Auto-migrate saat deploy 2026-09-29 (tindak lanjut insiden 500 login Google):
- `package.json` dapat script `vercel-build` = `npm run db:migrate && next build`.
  Vercel otomatis memakai script ini sebagai build command (vercel.json tidak
  mengeset buildCommand, jadi tidak perlu diubah). Deploy gagal = build gagal =
  migrasi gagal ikut menggagalkan deploy (fail-closed, bukan 500 diam-diam).
- `scripts/migrate.ts` sekarang memilih `DATABASE_URL_UNPOOLED` (koneksi langsung,
  aman untuk DDL) dengan cadangan `DATABASE_URL`, error jelas kalau keduanya kosong,
  dan mencatat jenis koneksi di log (tanpa nilai secret).
- Job deploy CI (`vercel deploy --prod`, build remote) otomatis memakai jalur ini —
  tanpa perubahan workflow deploy. Step Build di CI diganti ke `npm run vercel-build`
  supaya jalur persis deploy ikut diuji tiap run (di CI jadi no-op migrate + build).
- `.vercelignore` sudah benar: `drizzle/` + `scripts/` tetap ter-upload saat deploy
  CLI, jadi migrator punya file SQL-nya.
- Bukti jalan: log build deployment Vercel berikutnya harus memuat baris
  "Migrasi database via koneksi langsung…" + "✓ Migrasi database selesai".

Onboarding seller 3 langkah 2026-09-29 (IDEAS: aktivasi seller = metrik MVP):
- Wizard `/seller/mulai`: langkah 1 info karya (buat draft) → langkah 2 upload
  (ikon/cover/screenshot, rilis + file, info Android) & harga → langkah 3 review
  checklist + kirim. Stepper bisa diklik; langkah 2–3 wajib membawa draft milik
  sendiri (draft asing/tidak ada/sudah lewat wizard dialihkan, tanpa bocoran).
- `updatePricingAction` baru (validasi harga SATU fungsi `refinePricing` dengan
  editor biasa supaya tidak pernah beda); `createProductAction` redirect ke
  langkah 2 kalau dipanggil dari wizard; `ProductForm` dapat prop `onboarding`
  (sembunyikan harga di langkah 1, tanpa mengubah editor biasa).
- Dashboard seller: kartu "Aktivasi toko" (toko aktif, verifikasi email, karya
  pertama dikirim) + CTA wizard, tampil sampai seller pernah submit; empty-state
  dan alert toko-baru mengarah ke wizard; editor biasa tetap ada (jalur cepat).
- Tes: proving test section 10 (batas tamu/non-seller, gating langkah, buat
  draft, tolak harga invalid & produk asing, checklist terkunci) + smoke 3b
  (daftar → aktivasi → kartu aktivasi → 3 langkah → submit diblokir jujur
  karena checklist belum lengkap). Penyelesaian penuh wizard tidak dites
  end-to-end (pakai action & API upload yang sama dengan editor biasa — sudah
  dites di smoke section 3).

ZAP baseline (DAST) di CI 2026-09-29 (ROADMAP 2026-10-05, dimajukan):
- Step baru sesudah contract test (commit ccae168): docker zaproxy stable yang
  di-pin by digest (sha256:781a2bda…, diverifikasi via ghcr API 2026-09-29),
  `zap-baseline.py -t http://localhost:3000 -m 2` = spider + scan PASIF saja
  (tanpa serangan aktif, tidak mengubah data). Timeout job test 20 → 30 menit.
- Penilai `scripts/qa/zap-baseline-check.mjs`: temuan HIGH = gagal; Medium ke
  bawah dilaporkan; fail-closed kalau laporan hilang/rusak/format tak dikenal.
- Dua fix sebelum hijau: (1) container ZAP non-root tidak bisa menulis volume
  repo (AccessDeniedException) → laporan ke `zap-out/` (chmod 777, gitignore);
  (2) riskdesc ZAP baru berformat "Risiko (Keyakinan)" → parser sempat buta
  (semua Unknown) → diperbaiki + dites lokal dua arah (High = exit 1).
- Hijau: CI 36519230190 + CodeQL 36519230199
  (https://github.com/xykal/rilisin/actions/runs/36519230190).
  Baseline pertama: 15 jenis temuan — 0 High, 4 Medium, 4 Low, 7 Info.
- Triage 4 Medium (diterima, bukan bug): 10202 token CSRF (desain kita origin +
  fetch-metadata + SameSite, keyakinan ZAP sendiri Low); 10055 `style-src
  unsafe-inline` (dibutuhkan atribut style React; script-src tetap nonce ketat);
  90003 SRI hilang (script same-origin Next — SRI hanya relevan cross-origin);
  10038 tanpa CSP di 404 `/api/*` (respons JSON tanpa konten tereksekusi;
  satu-satunya route API ber-HTML sudah punya CSP ketat sendiri).

Persiapan cutover produksi 2026-09-29 (gas dari kall; eksekusi menunggu akun):
- `docs/CUTOVER.md`: runbook 4 fase (keputusan & akun kall → proyek & env →
  deploy tertutup + smoke → go-live → pasca) + rollback + checklist env
  produksi (nama saja) + perintah verifikasi. Prinsip: prod = proyek Vercel +
  Neon terpisah, deploy hanya manual via CI, migrasi backward-compatible.
- Audit env (nama saja via API): staging 41 var; kode memakai ~45 nama;
  `.env.example` sudah lengkap (termasuk komentar-ID). Temuan: Turnstile +
  Pakasir memang belum di staging (mock/captcha mati — wajar); Upstash &
  OneSignal tidak ada di kode → dicoret dari cutover (limit bersama sudah
  lewat Postgres, push belum diimplementasi). Seed/restore double-guarded
  (ALLOW_SEED + *_ALLOW_REMOTE) — aman dari kecelakaan.
- Job CI `deploy-prod` (manual dispatch, environment `production`), proyek
  Vercel terpisah via vars + workflow `scan-prod.yml` (jadwal MATI sampai
  Fase 4, dispatch manual + cek prasyarat jelas). Keduanya gagal-jelas kalau
  vars/secrets belum diisi — tidak setengah jalan.
- Jujur: happy path kedua job ini BELUM teruji (butuh proyek prod) — diuji
  saat cutover Fase 2 sesuai runbook.

Jalur $0/bulan (self-host Docker) 2026-09-29 (kall: belum ada anggaran):
- Masalah: Vercel Pro ±$20 + Neon Launch ±$15 = produksi berbayar ±$35–50/bln.
  Jawaban: seluruh stack jalan di SATU VPS gratis (Oracle Always Free ARM;
  cadangan Hetzner ±€4) — kode sama, beda deploy. Runbook: `docs/SELFHOST.md`.
- `Dockerfile` (multi-stage, base Debian karena `sharp`): deps → build →
  `migrator` (service compose, jalan tiap deploy = auto-migrate) + `runner`
  non-root (standalone). `docker-compose.yml`: app + db (Postgres 17) + clamd
  + scanner daemon + caddy (HTTPS otomatis). `.dockerignore` + `Caddyfile`.
- `next.config.ts`: `output: "standalone"` (Vercel & `next start` tetap normal —
  dibuktikan CI). Tanpa runtime edge di kode → portabel penuh.
- CI job baru `docker`: `docker build` app + migrator tiap run (tanpa push) —
  Dockerfile tidak bisa busuk diam-diam. Compose/cron/sertifikat diuji saat
  deploy VPS pertama (butuh akun Oracle kall) — jujur belum terverifikasi.

Keputusan hosting 2026-09-29 (kelvin: tetap Vercel Hobby dulu):
- Konteks: tanpa duit, tanpa VPS, tanpa laptop → kelvin minta jalur Cloudflare.
  Audit kompatibilitas Workers SELESAI (driver postgres.js 3.4.9 + Hyperdrive
  Free 100k query/hari = bisa; korban: sharp, ClamAV, LISTEN realtime, storage
  lokal → butuh 6 operasi kode + driver R2 baru; risiko bundle 3 MB).
- Keputusan kelvin: TUNDA migrasi, produksi tetap Vercel Hobby sambil nabung.
  Risiko disadari: suspend sewaktu-waktu (komersial di Hobby). Parasut siap:
  backup .rlsbak, docs/SELFHOST.md (VPS $0), docs/CLOUDFLARE.md (audit penuh +
  langkah resume). Tidak ada kode diubah hari ini.
