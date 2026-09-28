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
