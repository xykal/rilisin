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
