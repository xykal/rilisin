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

## Berikutnya (target, bisa geser)

| Target | Item | Kenapa | Effort |
|---|---|---|---|
| 2026-09-30 | Job CodeQL/SAST + ZAP baseline di CI | celah umum & XSS regresi ketahuan sebelum deploy | M |
| 2026-10-03 | ~~`tests/security/`: proving test 429, injeksi 400/403, IDOR, header~~ | **SELESAI 2026-09-28** (lihat tests/security/) | — |
| 2026-10-05 | Legal DRAFT: Terms, Privacy (UU PDP), Cookie, AUP, Refund | syarat launch publik & gateway | M |
| 2026-10-05 | docs/DESIGN.md: tipografi, palet, spacing, motion, aturan ikon | identitas asli sebelum tampilan publik | M |
| 2026-10-10 | README dual-language (ID + EN) + bagian English ringkas | kontributor & seller luar negeri | S |
| 2026-10-12 | Onboarding seller 3 langkah + checklist verifikasi | aktivasi seller = metrik stage MVP | M |
| 2026-10-19 | Cutover produksi: domain, rotasi secret, budget alert, runbook | hentikan ketergantungan staging | L |
| 2026-11-02 | Gerbang launch publik: legal reviewed, proving test hijau, support live | tidak launch tanpa syarat ini | L |

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
