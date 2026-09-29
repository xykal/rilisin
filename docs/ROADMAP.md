# ROADMAP — Rilisin

Real dates. Revised when they slip, with the reason logged in PROGRESS.md.
Estimates are working-day counts from the start date 2026-09-27.

## Selesai (dari riwayat git, 17 commit)

| Tanggal | Pencapaian |
|---|---|
| 2026-09-27 | Fase 1: fondasi, katalog, upload & download aman, library, moderasi |
| 2026-09-27 | Komunitas: chat realtime, forum, ulasan pemilik, notifikasi, lupa password |
| 2026-09-27 | Fase 2: checkout QRIS/VA (Pakasir), pesanan, saldo seller, pencairan, refund |
| 2026-09-27 | Fase 3b: follow seller/produk, devlog, lapor, profil + lencana |
| 2026-09-27 | Fase 4: scan ClamAV, Turnstile, rate limit bersama, cron, backup terenkripsi |

## Sekarang

| Tanggal | Item | Status |
|---|---|---|
| 2026-09-28 | Audit repo + docs/AUDIT-2026-09-28.md | selesai |
| 2026-09-28 | Pin actions ke commit SHA (supply chain) | selesai, CI hijau |
| 2026-09-28 | Atribusi XyVerse + LICENSE + THIRD_PARTY_NOTICES | selesai, CI hijau |
| 2026-09-28 | Job audit dependency di CI | selesai, CI hijau |
| 2026-09-28 | docs/PRD.md + docs/ROADMAP.md | selesai |
| 2026-09-28 | Proving test keamanan (tests/security/) + step CI | selesai, CI hijau |
| 2026-09-28 | Login Google (OAuth + PKCE), verifikasi email, halaman hukum publik | selesai, CI hijau (36499733841), butuh env + redirect URI Google dari kall |

## Berikutnya (target, bisa geser)

| Target | Item | Kenapa | Effort |
|---|---|---|---|
| 2026-10-05 | ~~Legal DRAFT: Terms, Privacy, Cookie, AUP, Refund~~ | **SELESAI 2026-09-28** (docs/legal/, DRAFT-marked, bilingual) | — |
| 2026-10-05 | Review pengacar dokumen legal + isi placeholder entitas | draft engineer ≠ nasihat hukum | M |
| 2026-09-29 | ZAP baseline (DAST) di CI | SELESAI: jalan tiap run (spider + pasif, image pin digest); baseline pertama 0 High / 4 Medium (false positive desain) / 4 Low / 7 Info | — |
| 2026-09-29 | Verifikasi staging login Google | SELESAI: env kebaca runtime, redirect 307 ke Google dengan PKCE S256 + redirect URI benar; sisa klik consent Google oleh manusia | — |
| 2026-09-29 | Onboarding seller 3 langkah + checklist verifikasi | SELESAI: wizard `/seller/mulai` (info → upload & harga → publish) + kartu aktivasi toko di dashboard; editor biasa tetap ada sebagai jalur cepat | — |
| 2026-10-19 | Cutover produksi: domain, rotasi secret, budget alert, runbook | hentikan ketergantungan staging; runbook siap di `docs/CUTOVER.md` (job deploy-prod + scan-prod menunggu akun & domain kall) | L |
| 2026-11-02 | Gerbang launch publik: legal reviewed, proving test hijau, support live | tidak launch tanpa syarat ini | L |

### Selesai di 2026-09-28 (dipindah dari jadwal)

- Audit repo + `docs/AUDIT-2026-09-28.md`
- Pin actions ke commit SHA (supply chain) di semua workflow
- Atribusi XyVerse + LICENSE + THIRD_PARTY_NOTICES + PROGRESS + IDEAS
- Job audit dependency di CI (`npm audit --audit-level=high`)
- `docs/PRD.md` + `docs/ROADMAP.md`
- Proving test keamanan `tests/security/` (429, injeksi, IDOR, CSRF, batas auth)
- Workflow CodeQL (SAST) + triage 2 alert (false positive, alasan tercatat)
- `docs/DESIGN.md` + README bilingual + SECURITY.md disegarkan
- Legal draft `docs/legal/` (5 dokumen + indeks, DRAFT-marked, bilingual)
- Login sungguhan: Google OAuth 2.0 + PKCE S256 (`lib/auth/oauth.ts`, `/api/auth/google*`),
  verifikasi email (`lib/auth/email-verification.ts`, `/verifikasi-email`), migrasi
  `drizzle/0006_auth_oauth.sql`, halaman hukum publik (`/ketentuan`, `/privasi`, `/kuki`,
  `/aup`, `/refund`) yang isinya di-generate dari `docs/legal/*.md` + cek sinkron di CI,
  dan tes Google palsu di CI (`tests/security/fake-google.mjs`)
- OAuth client khusus Rilisin dibuat di Google Cloud Console (project `dykal-5e2b9`) dengan
  redirect URI `https://rilisin.xyverse.my.id/api/auth/google/callback` — kredensial hanya di
  file lokal kall, tidak masuk repo

## Parkir (belum dijadwalkan)

- Aplikasi mobile (PWA dulu, OneSignal app XyCloudStore/XyDesk sudah tersedia)
- UI bahasa Inggris penuh
- Program referral seller
- AI rekomendasi / pencarian semantik
- Multi-currency

## Cara roadmap ini dipakai

- Satu item selesai = entri PROGRESS.md hari itu + commit yang bisa ditunjuk.
- Geser tanggal boleh, asal alasannya ditulis. Tidak ada estimasi karangan.
- Item "parkir" naik ke jadwal hanya kalau kall bilang gas.
