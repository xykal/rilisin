# IDEAS — backlog Rilisin

Format: ide — kenapa penting buat user nyata — effort (S/M/L).

## Dari audit 2026-09-28

- Pindahkan blueprint store-komunitas ke `docs/PRD.md` + `docs/ROADMAP.md` —
  pengetahuan proyek harus ikut ter-clone, bukan nganggur di luar repo — S
- Job `security` di CI (osv-scanner + semgrep + trivy image scanner) — dependency
  rentan & celah umum ketahuan sebelum deploy, bukan setelah — M
- Draft Terms / Privacy (UU PDP 27/2022) / Cookie / AUP / Refund — syarat wajib
  sebelum launch publik & syarat gateway pembayaran — M
- README dual-language (ID + EN) — calon seller & contributor luar negeri bisa
  baca tanpa translate — S
- `ALLOWED_ORIGINS` via env, buang hardcode `*.e2b.app` sebelum produksi —
  origin sandbox tidak boleh lolos di domain asli — S
- Struktur `tests/security/` untuk proving test — **SELESAI 2026-09-28**:
  tests/security/proving-tests.mjs (429 setelah ambang, injeksi/traversal/XSS,
  IDOR, CSRF, batas auth, flag cookie) jalan tiap CI

## Produk & pertumbuhan

- Halaman "karya gratis minggu ini" + RSS/Atom feed karya baru — jalur akuisisi
  organik + notifikasi ke pengguna tanpa app — S
- Badge "terverifikasi aman" (lulus scan ClamAV) di kartu produk — kepercayaan
  adalah penghalang download di marketplace sumber terbuka — S
- Onboarding seller 3 langkah (upload → harga → publish) dengan checklist —
  aktivasi seller adalah metrik stage MVP — M
- Devlog otomatis dari commit/tag GitHub per produk — alasan seller kembali
  setiap rilis, bukan cuma saat upload — M
- Leaderboard kontribusi komunitas (jawaban terbaik, ulasan membantu) — retensi
  D30 sisi pembaca gratis — M
- Program referral seller (kode unik, insentif saldo) — CAC marketplace
  biasanya mahal; referral seller-ke-seller lebih murah — L
- PWA + notifikasi push (OneSignal app XyCloudStore/XyDesk sudah ada) — user
  Indonesia mobile-first, hemat kuota daripada app native dulu — M

## Operasional

- Alarm budget Vercel/Neon/Blob + hard quota per user — cegah cost-DoS —
  S
- Runbook insiden (repo kena suspend, gateway down, blob leak) di
  `docs/runbooks/` — downtime tanpa runbook = panic decision — S
