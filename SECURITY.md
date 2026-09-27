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

Lainnya: ganti kontak di `public/.well-known/security.txt`, aktifkan backup database harian, simpan secret di environment hosting (bukan di repo), aktifkan 2FA untuk akun GitHub/Vercel/Supabase/Cloudflare/Xendit milik tim.

## 4. Yang belum ada (rencana)

- Verifikasi email, reset password via email, login Google (saat deploy).
- Cloudflare **Turnstile** di form daftar/login (Fase 4) — adapter tinggal ditambah di `form-guard.ts`.
- **ClamAV**/pemindai malware otomatis untuk file rilis (Fase 4).
- Rate limit & presence di **Redis** untuk multi-instance.
- Deteksi otomatis gambar tidak pantas di chat.
- Job terjadwal: hapus salinan pesan terhapus > 30 hari, gambar chat tak terpakai, event keamanan > 1 tahun.
- Notifikasi email saat login dari perangkat baru / 2FA dimatikan.
- Passkey (WebAuthn) sebagai alternatif 2FA.
- Pentest / audit independen sebelum Fase 2 (uang sungguhan).

## 5. Melaporkan celah

Lihat `/.well-known/security.txt`. Mohon jangan dipublikasikan sebelum diperbaiki.
