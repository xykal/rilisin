/**
 * Kebijakan Privasi — Rilisin
 *
 * DIBUAT OTOMATIS dari docs/legal/PRIVACY.md — JANGAN diedit manual.
 * Perbarui dokumen Markdown-nya lalu jalankan: npm run legal:sync
 */
export const LEGAL_PRIVACY = `
# Kebijakan Privasi — Rilisin

**DRAFT — review oleh pengacara berlisensi sebelum dipublikasikan.**
Versi 1.0-draft · Disusun 2026-09-28 · Berlaku sejak: [TANGGAL BERLAKU]

Pengendali data: [NAMA ENTITAS], [BENTUK BADAN HUKUM], [ALAMAT ENTITAS]
("Kami"). Kontak privasi: [EMAIL KONTAK].

Dokumen ini disusun mengacu **UU No. 27 Tahun 2022 tentang Pelindungan Data
Pribadi (UU PDP)**, dan memuat klausa kondisional GDPR/UK GDPR & CCPA yang aktif
hanya bila Kami melayani pengguna di wilayah tersebut.

## 1. Data yang Kami kumpulkan

Inventaris ini diambil langsung dari skema database aplikasi (\`src/lib/db/schema.ts\`)
— bukan perkiraan:

| Data | Dari | Tujuan | Dasar pemrosesan |
|---|---|---|---|
| Email, username, nama tampilan | Pendaftaran | Akun, login, notifikasi | Pelaksanaan kontrak |
| Hash password (scrypt) | Pendaftaran | Autentikasi | Pelaksanaan kontrak |
| Rahasia 2FA (terenkripsi AES-256-GCM), kode cadangan (di-hash) | Aktivasi 2FA | Keamanan akun | Pelaksanaan kontrak |
| Identitas Google: ID pengguna Google (\`sub\`), provider, email yang dilaporkan Google, waktu penautan | Login dengan Google | Autentikasi & penautan akun | Pelaksanaan kontrak |
| Token verifikasi email (hanya SHA-256-nya yang disimpan), email tujuan, **hash IP** peminta, waktu kedaluwarsa | Daftar / kirim ulang verifikasi | Membuktikan email milik pemilik akun | Pelaksanaan kontrak |
| Penanda email sudah terverifikasi (\`email_verified_at\`) | Verifikasi / login Google | Membuka fitur yang butuh email terverifikasi | Pelaksanaan kontrak |
| Token sesi (di-hash), user agent, **hash IP** | Setiap login | Menjaga sesi & keamanan | Kepentingan yang sah |
| **Hash IP** + user agent pada event keamanan (login gagal, bot diblokir, webhook ditolak) | Aktivitas | Deteksi penyalahgunaan | Kepentingan yang sah |
| Nama toko, tagline, bio, avatar | Profil seller/anggota | Tampilan publik | Persetujuan |
| Isi karya (judul, deskripsi, versi, file rilis, gambar) | Seller | Distribusi karya | Pelaksanaan kontrak |
| Pesan chat, posting forum, ulasan, laporan | Pengguna | Fungsi komunitas & moderasi | Pelaksanaan kontrak |
| Data pembayaran: kode pesanan, nominal, metode, status, ID transaksi gateway | Checkout | Memproses pembayaran | Pelaksanaan kontrak |
| Data pencairan: metode, nama bank/e-wallet, nama pemilik rekening, nomor rekening **terenkripsi**, 4 digit terakhir | Seller | Mencairkan saldo | Pelaksanaan kontrak |
| Log unduhan (user, karya, **hash IP**) | Download | Statistik & keamanan | Kepentingan yang sah |
| Preferensi notifikasi | Pengguna | Mengatur notifikasi | Persetujuan |

**Yang TIDAK Kami kumpulkan:** nomor rekening dalam bentuk terbuka (hanya
tersimpan terenkripsi dan hanya 4 digit terakhir yang ditampilkan), nomor kartu
(pembayaran lewat gateway — Kami tidak pernah menerima data kartu), alamat IP
mentah (hanya hash, dengan garam rahasia server).

## 2. Penerima data (pihak ketiga)

| Pihak | Peran | Data yang diterima |
|---|---|---|
| Vercel | Hosting & CDN | Data request (termasuk IP) untuk menyajikan situs |
| Neon | Basis data Postgres | Seluruh data di tabel inventaris |
| Vercel Blob | Penyimpanan file karya & gambar | File yang diunggah |
| Cloudflare | DNS + Cloudflare Turnstile (anti-bot) | Data request untuk verifikasi tantangan |
| Resend | Pengiriman email (opsional) | Alamat email & isi notifikasi |
| Pakasir | Gateway pembayaran | Data pesanan & pembayaran |
| GitHub | CI/CD & penyimpanan kode | Tidak ada data pengguna produksi |

Kami tidak menjual data pribadi. Tidak ada iklan pihak ketiga di Platform.

## 3. Penyimpanan & retensi

| Kategori | Masa simpan |
|---|---|
| Akun & profil | Selama akun aktif; dihapus/anonimkan ≤ 30 hari setelah permintaan penghapusan, kecuali ada kewajiban hukum |
| Sesi login | 30 hari (otomatis kedaluwarsa) |
| Tantangan 2FA | 10 menit |
| Token reset password | 30 menit, sekali pakai |
| Token verifikasi email | 24 jam, sekali pakai |
| Identitas Google yang tertaut | Selama akun aktif; dihapus saat tautan dilepas atau akun dihapus |
| Event keamanan | 12 bulan (rencana pembersihan otomatis) |
| Pesan chat & posting forum | Selama akun aktif; salinan "dihapus untuk semua orang" dibersihkan ≤ 30 hari |
| Catatan transaksi & pencairan | 10 tahun (kewajiban pembukuan/pajak Indonesia) |
| File karya | Selama karya dipublikasikan; dihapus ≤ 90 hari setelah karya dihapus seller |

## 4. Hak Anda (UU PDP)

Anda berhak meminta: **akses**, **koreksi**, **penghapusan**, **pembatasan
pemrosesan**, **keberatan**, **penarikan persetujuan**, dan **portabilitas**
(salinan data Anda dalam format terbaca mesin). Kirim permintaan ke
[EMAIL KONTAK]; Kami menanggapi paling lambat **3x24 jam** untuk konfirmasi dan
selesai sesuai tenggat UU PDP (paling lambat 30 hari, bisa diperpanjang sekali).

Bila data bocor dan menimbulkan risiko terhadap Anda, Kami memberitahukan
paling lambat **3x24 jam** setelah tahu, beserta langkah yang diambil.

## 5. Cookie

Lihat \`COOKIES.md\`. Platform hanya memakai cookie yang diperlukan untuk fungsi
(session, 2FA, reset password) — tidak ada cookie iklan atau pelacakan lintas situs.

## 6. Anak di bawah umur

Platform tidak ditujukan untuk pengguna di bawah 17 tahun. Bila Kami mengetahui
data anak terkumpul tanpa wewenang, data itu dihapus.

## 7. Keamanan

Password memakai scrypt (memory-hard), rahasia 2FA & nomor rekening disimpan
terenkripsi (AES-256-GCM), IP hanya disimpan sebagai hash, koneksi dipaksa HTTPS
(HSTS), dan setiap endpoint yang mengubah data memeriksa Origin. Rincian teknis
ada di \`SECURITY.md\`.

## 8. Transfer lintas negara

Data disimpan di server penyedia (region Singapura). Bila Kami melayani pengguna
UE/UK, transfer tersebut dilakukan dengan klausa kontrak standar (SCC) — bagian
ini aktif hanya bila wilayah itu benar-benar dilayani. Pengguna California
memiliki hak akses/penghapusan tambahan sesuai CCPA/CPRA; permintaan dikirim ke
[EMAIL KONTAK].

## 9. Perubahan

Perubahan material diumumkan minimal **14 hari** sebelum berlaku. Riwayat versi
dokumen dicatat di bagian bawah berkas ini.

## 10. Kontak

[EMAIL KONTAK] · [ALAMAT ENTITAS]

---

# Privacy Policy — Rilisin (English translation, non-binding)

**DRAFT — review by licensed counsel before publishing.**

1. **What we collect** (full inventory with purposes and legal bases is in the
   Indonesian section): account data (email, username, display name), scrypt
   password hash, encrypted 2FA secrets, hashed session tokens and IP hashes,
   security event logs, seller profiles, uploaded works, community content
   (chat, forum, reviews, reports), payment and payout records, and download
   logs, linked Google identities (Google user ID + the email Google reports), and
   email verification tokens (stored only as SHA-256 hashes). We do **not** store
   raw IP addresses or card numbers.
2. **Recipients:** Vercel (hosting/CDN), Neon (database), Vercel Blob (files),
   Cloudflare (DNS + Turnstile), Resend (email, optional), Pakasir (payments),
   GitHub (CI). We do not sell personal data and run no third-party ads.
3. **Retention:** see the retention table in the Indonesian section (accounts
   while active, sessions 30 days, 2FA challenges 10 minutes, reset tokens 30
   minutes, email verification tokens 24 hours, linked Google identities until
   unlinked, security events 12 months, transaction records 10 years for tax).
4. **Your rights** (UU PDP No. 27/2022): access, correction, deletion,
   restriction, objection, withdrawal of consent, and portability. Contact
   [CONTACT EMAIL]. We confirm within 3x24 hours and complete requests within
   30 days. Data breaches are notified within 3x24 hours.
5. **Cookies:** see \`COOKIES.md\` — functional cookies only.
6. **Children:** not intended for users under 17.
7. **Security:** scrypt, AES-256-GCM at rest for secrets, hashed IPs, HSTS,
   Origin checks on all mutations (details in \`SECURITY.md\`).
8. **International transfers:** data is hosted in Singapore; EU/UK SCC clauses
   apply only if those regions are actually served. CCPA/CPRA rights apply to
   California users on request.
9. **Changes:** announced at least 14 days ahead; version history below.
10. **Contact:** [CONTACT EMAIL] · [ENTITY ADDRESS]

Riwayat versi: 1.0-draft (2026-09-28) — draf awal engineer, belum ditinjau
pengacara.
`;
