# Keamanan Rilisin

Dokumen ini menjelaskan perlindungan yang sudah ada di prototype, cara mengaturnya untuk production, dan celah yang masih terbuka.
Status: **prototype, belum diaudit pihak ketiga**. Wajib ada review keamanan/pentest manusia sebelum pembayaran asli diaktifkan (Fase 2).

## 1. Ancaman utama & perlindungannya

| Ancaman | Perlindungan | Lokasi kode |
|---|---|---|
| Pencurian akun (password bocor / ditebak) | scrypt; kebijakan password (min 10, tolak password umum/username/nama situs); **2FA TOTP** + 10 kode cadangan; kunci akun 15 menit setelah 8× gagal; rate limit per IP & per akun | `lib/auth/password.ts`, `lib/security/password-policy.ts`, `lib/security/totp.ts`, `lib/auth/mfa.ts`, `lib/security/login-guard.ts`, `app/actions/auth.ts` |
| Brute force kode 2FA | Tantangan login maks 5 percobaan & 10 menit; kode yang sudah dipakai ditolak (anti replay, simpan time-step terakhir); rate limit per IP | `lib/auth/mfa.ts`, `app/actions/auth.ts` |
| Kebocoran database | Token session disimpan sebagai SHA-256; secret 2FA terenkripsi **AES-256-GCM** (kunci turunan HKDF dari `APP_SECRET`); kode cadangan disimpan sebagai HMAC ber-pepper; IP disimpan sebagai hash | `lib/security/crypto.ts`, `lib/auth/session.ts`, `lib/http.ts` |
| Session hijacking / fixation | Cookie `httpOnly` + `Secure` + prefix `__Host-`; token baru setiap login; ganti password & aktifkan 2FA mengeluarkan semua perangkat lain; daftar perangkat + tombol keluarkan | `lib/auth/session.ts`, `app/akun/keamanan` |
| XSS | React (auto-escape); Markdown tanpa HTML mentah; format chat dirender sebagai elemen React (tanpa `dangerouslySetInnerHTML`); link hanya `http(s)`; **CSP nonce + `strict-dynamic`**, `object-src 'none'`, `base-uri 'self'`; file unduhan & gambar disajikan dengan `CSP: sandbox` + `nosniff` | `src/proxy.ts`, `components/chat/format.tsx`, `next.config.ts` |
| CSRF | Server Actions dicek Origin oleh Next.js; semua route handler yang mengubah data cek **Origin** + wajib `Content-Type: application/json` / `image/*` (tidak bisa dikirim form lintas situs tanpa preflight); `Sec-Fetch-Site` untuk GET API | `lib/api.ts`, `lib/http.ts` |
| Clickjacking | `frame-ancestors` (+ `X-Frame-Options`) — default `'none'`, dilonggarkan hanya lewat env `FRAME_ANCESTORS` untuk preview | `src/proxy.ts`, `next.config.ts` |
| Bot pendaftaran & spam | Honeypot + token waktu bertanda tangan (form < 1,5 dtk = bot); rate limit daftar per IP | `lib/security/form-guard.ts` |
| Spam / judol / penipuan di chat | Filter judol dengan normalisasi leetspeak; rate limit (6/10 dtk, 30/menit); deteksi pesan berulang; mode lambat; akun < 24 jam tak bisa kirim link; maks 3 link; peringatan saat membuka link luar; lapor → auto-sembunyi di 3 pelapor berbeda; bisukan & blokir | `lib/chat/filter.ts`, `lib/chat/server.ts`, `components/chat/sheets.tsx` |
| Spoofing tampilan teks | Buang karakter bidi override ("Trojan Source"), zero-width, Hangul filler; batasi tanda diakritik bertumpuk (zalgo) | `lib/chat/text.ts` |
| Upload berbahaya | Cek magic bytes (bukan ekstensi); APK wajib `AndroidManifest.xml`; SHA-256 + blocklist; gambar di-decode ulang oleh sharp (batas piksel), EXIF/GPS dibuang, disimpan sebagai WebP dengan nama acak; batas ukuran & kuota harian | `lib/uploads.ts`, `app/api/chat/uploads` |
| IDOR / akses tanpa izin | Semua aksi mengecek pemilik/peran di server (edit hanya penulis ≤ 15 menit, hapus untuk semua ≤ 48 jam kecuali moderator, panel admin 404 untuk non-staf, blokir akun khusus admin) | `lib/chat/server.ts`, `lib/auth/guards.ts` |
| DoS ringan | Batas ukuran body JSON (16–32 KB) & gambar (8 MB); batas koneksi SSE (6 per akun, 2000 per proses); koneksi realtime ditutup berkala; rate limit baca | `lib/api.ts`, `lib/chat/bus.ts` |
| Pemalsuan IP untuk lolos rate limit | IP diambil dari entri `X-Forwarded-For` milik proxy tepercaya (`TRUSTED_PROXY_HOPS`), bukan entri pertama yang bisa diisi klien | `lib/http.ts` |
| Phishing | Pusat Keamanan & peringatan "tim Rilisin tidak pernah minta password/OTP"; peringatan link luar di chat | `app/keamanan`, `components/chat/sheets.tsx` |
| **Webhook pembayaran palsu** | Header `X-Secret` dibandingkan constant-time; body maks 8 KB; status, nominal & order_id **dikonfirmasi ulang ke API transaction-status** Pakasir; nominal harus sama dengan pesanan; txn_id harus cocok; webhook ditolak (404) kalau gateway belum dikonfigurasi; semua penolakan dicatat di log keamanan | `app/api/payments/pakasir/webhook/route.ts`, `lib/payments/orders.ts` |
| **Saldo dobel / race condition uang** | Pelunasan dalam 1 transaksi DB dengan `SELECT … FOR UPDATE`; unique index (1 sale/refund per pesanan, 1 debit/pengembalian per pencairan, 1 pencairan terbuka per seller, 1 pesanan pending per pembeli+produk); pengajuan pencairan mengunci baris seller sebelum cek saldo | `lib/payments/orders.ts`, `lib/payments/payouts.ts`, `drizzle/0002_payments.sql` |
| **Manipulasi catatan uang** | `ledger_entries` **append-only**: trigger database menolak UPDATE/DELETE; saldo selalu dihitung dari SUM ledger; CHECK constraint `komisi + hak seller = harga`, nominal > 0 | `drizzle/0002_payments.sql` |
| **Manipulasi harga dari browser** | Harga tetap dihitung ulang di server (nominal kiriman browser diabaikan); bayar seikhlasnya dibatasi minimal/maksimal; metode dibatasi rentang nominal gateway; kode pesanan acak 50 bit (tidak bisa ditebak) + halaman/status pesanan hanya untuk pembeli & staf | `lib/payments/orders.ts`, `lib/payments/queries.ts` |
| **Transaksi sandbox dipakai di live** | Pesanan live tidak bisa dilunasi event sandbox; `PAKASIR_ALLOW_SANDBOX=0` menolak membuat transaksi di proyek yang masih sandbox | `lib/payments/orders.ts` |
| **Pembobolan akun seller → kuras saldo** | Pencairan & ganti rekening wajib **password (+kode 2FA kalau aktif)**, rate limit percobaan; ganti rekening = verifikasi ulang admin sebelum bisa cair; nomor rekening **dienkripsi AES-256-GCM** (tampil 4 digit terakhir, lengkap hanya untuk admin di antrian pencairan) | `lib/payments/payouts.ts` |
| **Penyalahgunaan panel keuangan** | `/admin/keuangan` & semua aksi uang khusus role `admin` (moderator 404); refund/pencairan/verifikasi tercatat di log keamanan dengan pelakunya | `app/admin/keuangan`, `app/actions/payments.ts` |
| **Ulasan palsu / serangan rating** | Hanya pemilik sah (entitlement download/beli) yang bisa mengulas, dicek ulang di server untuk setiap kiriman (form paksa ditolak); 1 ulasan per orang per produk (unique index); seller tidak bisa mengulas karyanya sendiri & tidak bisa menghapus ulasan; rating 1–2 wajib alasan; tanpa link; 3 pelapor berbeda → disembunyikan otomatis; rata-rata dihitung **trigger database** hanya dari ulasan yang tampil | `lib/reviews.ts`, `lib/community/reports.ts`, `drizzle/0003_community.sql` |
| **Spam / judol di forum** | Filter judol yang sama dengan chat; akun < 24 jam tanpa link, maks. 5 link per postingan; batas thread (5/jam, 20/hari) & jeda balasan 8 dtk dihitung dari **database** (tetap akurat walau server lebih dari satu); judul/balasan kembar ditolak; honeypot + token waktu di form thread; anggota yang dibisukan global tidak bisa posting | `lib/forum.ts`, `lib/community/guard.ts` |
| **XSS / link berbahaya di forum** | Markdown dirender tanpa HTML mentah (`skipHtml`), URL `javascript:`/`data:` dibuang, gambar eksternal tidak dimuat (anti tracking pixel), link luar `nofollow ugc` + tab baru, mention diubah jadi link internal tanpa `dangerouslySetInnerHTML` | `components/markdown.tsx` |
| **Otorisasi forum (IDOR)** | Ubah/hapus hanya penulis atau moderator; jawaban terbaik hanya penanya/moderator; upvote postingan sendiri ditolak; thread terkunci menolak balasan di server; konten tersembunyi hanya terlihat moderator & penulisnya | `lib/forum.ts`, `app/forum/t/[id]/page.tsx` |
| **Open redirect lewat notifikasi** | `url` notifikasi wajib path internal — dicek di kode (`safeNextPath`) **dan** CHECK constraint database (`url like '/%' and not like '//%'`); link notifikasi milik orang lain tidak bisa dibuka/ditandai | `lib/notifications/server.ts`, `drizzle/0003_community.sql` |
| **Banjir email / reputasi domain** | Maks. 1 email per grup notifikasi sampai dibaca (klaim atomik `emailed_at`); preferensi per kategori; berhenti berlangganan satu klik (RFC 8058, token HMAC per user+kategori, konfirmasi lewat tombol POST supaya pemindai link tidak ikut mematikan); alamat `.test/.example/.invalid/.localhost` **tidak pernah dikirim** (bounce merusak reputasi) | `lib/notifications/server.ts`, `lib/email.ts` |
| **Pengambilalihan akun lewat reset password** | Token acak 256-bit, hanya SHA-256 yang disimpan, sekali pakai (klaim atomik), 30 menit, link lama hangus saat minta baru, maks. 3 per jam per akun + 5 per 15 menit per IP; jawaban selalu sama & email dikirim setelah respons (tidak membocorkan email terdaftar lewat isi/waktu); token dipindah ke cookie httpOnly berpath lalu redirect (tidak tertinggal di URL/Referer); semua sesi dikeluarkan + email pemberitahuan; 2FA tetap berlaku | `lib/auth/password-reset.ts`, `app/atur-ulang-password/` |
| **Laporan jahat terhadap pesaing** | Produk & akun **tidak** disembunyikan otomatis oleh laporan — selalu diputuskan moderator; alasan laporan divalidasi per jenis konten di server; tidak bisa melaporkan karya/akun sendiri; 1 laporan per orang per target; rate limit 10 laporan/jam | `lib/community/reports.ts`, `lib/community/shared.ts` |
| **Banjir notifikasi dari fitur ikuti** | Notifikasi ke pengikut digabung per produk/seller selama belum dibaca ("3 versi baru"); email kategori *Update yang diikuti* default mati, dikirim batch (maks. 100/request) hanya ke yang menyalakan; ikuti/berhenti di-rate limit | `lib/follows.ts`, `lib/notifications/server.ts` |

## 2. Audit trail

- `security_events`: login sukses/gagal, akun terkunci, bot diblokir, 2FA diaktifkan/dimatikan, kode cadangan dipakai, ganti password, perangkat dikeluarkan, pesan judol diblokir, laporan, aksi moderator.
- Pengguna melihat riwayatnya di `/akun/keamanan`, staf melihat semuanya di `/admin/keamanan`.
- `moderation_actions`: semua keputusan moderator (review karya, hapus/pulihkan pesan, bisukan, blokir).
- `reports.snapshot`: salinan konten saat dilaporkan — tetap ada walau pelaku mengedit/menghapus pesan.

## 3. Konfigurasi production (wajib)

| Env | Nilai production |
|---|---|
| `APP_SECRET` | acak ≥ 32 karakter (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`). **Jangan pernah diganti sembarangan** — secret 2FA terenkripsi dengan kunci turunannya |
| `REQUIRE_STAFF_2FA` | `1` (admin & moderator wajib 2FA untuk membuka panel moderasi) |
| `FRAME_ANCESTORS` | kosong (= `'none'`) |
| `ALLOWED_ORIGINS` | domain kamu, mis. `rilisin.id` |
| `TRUSTED_PROXY_HOPS` | jumlah proxy di depan app (Vercel/Cloudflare: `1`) |
| `COOKIE_SECURE` | jangan di-set `false` |
| `DATABASE_URL_DIRECT` | koneksi langsung Supabase (untuk LISTEN/NOTIFY chat) |
| `PAYMENT_PROVIDER` | `pakasir` (jangan `mock` di situs yang menerima uang sungguhan) |
| `PAKASIR_SLUG` / `PAKASIR_API_KEY` / `PAKASIR_WEBHOOK_SECRET` | dari proyek Pakasir **khusus Rilisin**. Simpan di env hosting, jangan di repo |
| `PAKASIR_ALLOW_SANDBOX` | `0` setelah go live |
| `APP_URL` | URL publik (untuk link di email struk) |

Lainnya: ganti kontak di `public/.well-known/security.txt`, aktifkan backup database harian, simpan secret di environment hosting (bukan di repo), aktifkan 2FA/passkey untuk akun GitHub/Vercel/Neon/Cloudflare/Pakasir milik tim. Kunci situs staging mengecualikan webhook pembayaran & `/api/notifications/unsubscribe` (dipanggil server email, diotorisasi token HMAC). Token deploy CI hanya disimpan sebagai secret environment `staging` di GitHub (dibatasi ke branch `main`, tidak terbaca oleh PR/Dependabot); job test tidak memakai secret sama sekali.

## 4. Yang belum ada (rencana)

- Verifikasi email & login Google (saat deploy).
- Rate limit & presence di **Redis** untuk multi-instance.
- Deteksi otomatis gambar tidak pantas di chat.
- Job terjadwal: hapus salinan pesan terhapus > 30 hari, gambar chat tak terpakai, event keamanan > 1 tahun.
- Notifikasi email saat login dari perangkat baru / 2FA dimatikan.
- Passkey (WebAuthn) sebagai alternatif 2FA.
- **Pentest / audit independen sebelum menerima uang sungguhan** (Fase 2 sudah jalan dalam mode simulasi & sandbox).
- Rekonsiliasi harian otomatis: cocokkan pesanan lunas dengan laporan transaksi Pakasir (deteksi selisih).
- Allowlist IP webhook kalau Pakasir mempublikasikan daftar IP pengirim.
- Batas & pola anti-fraud pembelian (banyak pesanan gagal beruntun, kartu/akun baru dengan nominal besar).

Sudah jalan (dulu masuk daftar ini): Cloudflare Turnstile di form daftar/login, scan malware ClamAV untuk file rilis, reset password via email, rate limit bersama antar instance lewat Postgres.

## 5. SAST & tes keamanan di CI

- **CodeQL (SAST)** jalan di tiap push + mingguan (`.github/workflows/codeql.yml`, action di-pin commit SHA). Alert muncul di tab **Security → Code scanning**; tidak memblokir deploy, tapi harus ditriage.
- **Proving test** (`tests/security/proving-tests.mjs`, `npm run test:security`) membuktikan tiap run: rate limit membalas 429 setelah ambang (chat 30/menit, upload 60/10 menit, notifikasi 60/menit), payload injeksi/traversal/XSS ditolak atau dinetralkan, IDOR per-objek (akun B tidak bisa edit/hapus/pin pesan akun A), CSRF (Origin asing 403, Content-Type salah 415), endpoint mutasi wajib login, flag cookie session. Kontrol tanpa tes bukti dianggap tidak ada.
- **Triage alert (2026-09-28)** — dua alert CodeQL ditutup sebagai *false positive* dengan alasan tercatat di GitHub:
  - `js/insufficient-password-hash` (crypto-core.ts): `sha256Hex` hanya dipakai untuk hash token acak MFA challenge (mfa.ts:20,30), bukan password. Password memakai **scrypt N=16384/r=8/p=1** (password.ts:15) — memory-hard, tanpa dependency tambahan.
  - `js/xss-through-dom` (composer.tsx:194): `image.url` adalah blob URL lokal atau URL publik dari server setelah upload — bukan teks buatan user; `<img src>` juga tidak bisa menjalankan script.

## 6. Melaporkan celah

Lihat `/.well-known/security.txt`. Mohon jangan dipublikasikan sebelum diperbaiki.
