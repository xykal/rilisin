# Rilisin — prototype Fase 1

> "Rumah karya developer Indonesia". Tempat share gratis & jual aplikasi, game, source code, template, aset desain, dan e-book.
> **Rilisin** masih nama kerja: domain & merek belum dicek. Ganti nama cukup di `src/lib/config.ts`.

Ini hasil **Fase 1** dari blueprint (`../blueprint-store-komunitas.md`), yaitu fondasi + "share gratis". Fitur uang (checkout, saldo, payout) ada di Fase 2, komunitas di Fase 3.

---

## Yang sudah jalan

| Area | Fitur |
|---|---|
| Akun | Daftar, masuk, keluar. Password di-hash scrypt, session disimpan di database (yang disimpan cuma hash token), rate limit percobaan login |
| Katalog | Beranda (pilihan editor, trending 7 hari, baru rilis), halaman Jelajahi dengan filter kategori/platform/harga, pencarian full-text, 3 pilihan urutan |
| Produk | Cover, ikon, screenshot, deskripsi Markdown (HTML mentah tidak dirender), riwayat versi, info lisensi, label verifikasi developer Android |
| Download | Wajib login. Tombol (POST) → cek hak akses → catat unduhan → redirect ke **signed URL** yang berlaku 10 menit dan terikat ke akun |
| Library | Semua karya yang pernah diunduh, plus tanda **"Update tersedia"** kalau ada versi baru |
| Seller Center | Aktifkan toko, profil publik `/@username`, tambah/edit karya, upload gambar & file rilis, checklist "siap tayang", kirim ke review, rilis versi baru |
| Keamanan file | Validasi dari isi file (magic bytes, bukan cuma ekstensi), APK wajib berisi `AndroidManifest.xml`, SHA-256 tiap file, blokir hash, deteksi file identik milik seller lain, gambar dikonversi ke WEBP (EXIF/GPS terbuang) |
| Moderasi | Antrian review karya baru & update rilis, setujui/tolak dengan alasan, blokir hash (malware/bajakan), pilihan editor, tangguhkan/pulihkan, seller terpercaya (auto-tayang), log moderasi |
| Android 2026 | Seller mengisi nama paket & status verifikasi developer. Pengguna melihat label + panduan instal (`/panduan/android`). APK berbayar wajib dari developer terdaftar |

## Akun demo

Password semua akun: **`rilisin123`**

| Email | Peran |
|---|---|
| `user@rilisin.test` | Pengguna biasa. Library-nya sudah terisi dan ada 1 update tersedia |
| `seller@rilisin.test` | Seller "Nusantara Labs". Punya karya tayang, 1 karya sedang direview, 1 draft, dan rilis KasirKu v2.1.0 yang menunggu review |
| `admin@rilisin.test` | Admin/moderator. Antriannya berisi contoh karya "APK MOD" yang **harus ditolak**; sistem sudah mendeteksi file-nya identik dengan KasirKu |

Semua produk, akun, dan angka unduhan adalah **data demo**. File yang bisa diunduh cuma placeholder (ZIP/APK/PDF kecil), bukan aplikasi sungguhan.

---

## Cara menjalankan

Butuh: **Node.js ≥ 20.9** dan **PostgreSQL** (skrip di bawah memasangnya otomatis di Debian/Ubuntu).

```bash
npm install
cp .env.example .env.local      # lalu isi DATABASE_URL & APP_SECRET (lihat komentar di file)
npm run setup                   # nyalakan PostgreSQL lokal + buat tabel + isi data demo
npm run build && npm run start  # buka http://localhost:3000
```

Untuk development (auto-reload): `npm run dev`.

| Perintah | Fungsi |
|---|---|
| `npm run setup` | Nyalakan PostgreSQL lokal + reset & isi data demo |
| `npm run db:seed` | Reset database & storage lokal, lalu isi data demo. ⚠️ **Semua data dihapus** |
| `npm run db:migrate` | Jalankan migrasi (tanpa menghapus data) |
| `npm run db:generate` | Buat file migrasi baru setelah mengubah `src/lib/db/schema.ts` |
| `npm run typecheck` / `npm run lint` | Cek TypeScript / ESLint |
| `npm run test:smoke` | Smoke test end-to-end, 36 pengecekan. Server harus sudah jalan. Menambah data uji; jalankan `db:seed` lagi untuk reset |

> **Di sandbox chat ini:** database (`/var/lib/postgresql`), file upload (`.local/`), `node_modules`, dan `.next` **tidak ikut tersimpan**. Kalau sandbox restart, jalankan lagi:
> `npm install && npm run setup && npm run build && npm run start`

### Kalau login tidak "nyangkut" di preview
Preview berjalan di dalam iframe. Beberapa browser (terutama Safari) memblokir cookie di iframe. Solusinya: buka preview di tab baru.

---

## Struktur folder

```
src/
  app/
    page.tsx                 Beranda
    jelajahi/                Katalog + filter + pencarian
    p/[slug]/                Halaman produk
    u/[username]/            Profil seller (diakses lewat /@username)
    masuk/, daftar/          Login & registrasi
    library/                 Library pengguna
    seller/                  Seller Center (dashboard, daftar karya, editor)
    admin/review/            Antrian & detail review moderator
    panduan/android/         Panduan instal APK (aturan verifikasi 2026)
    komunitas/               Teaser Fase 3
    actions/                 Server Actions: auth, seller, admin
    api/uploads/             Upload 3 langkah: init → (PUT) → complete
    api/storage/             Endpoint driver "local" (pengganti R2 saat dev)
    api/download/[fileId]/   Cek hak akses + catat unduhan → signed URL
    media/[...path]/         Menyajikan gambar publik (dev)
  components/                UI: kartu produk, form seller, uploader, dll
  lib/
    db/schema.ts             Skema database (Drizzle)
    auth/                    Password, session, user aktif, guard peran
    storage/                 Kontrak storage + driver lokal (R2 menyusul)
    uploads.ts               Validasi & finalisasi upload
    files.ts                 Deteksi tipe file dari magic bytes
    queries.ts               Query data untuk halaman
    config.ts                Nama situs, kategori, platform, lisensi, batas
scripts/
  dev-db.sh                  Pasang & nyalakan PostgreSQL lokal
  migrate.ts, seed.ts        Migrasi & data demo
  seed-assets.ts             Generator ikon/cover/screenshot & file demo
  smoke-test.mjs             Tes end-to-end tanpa browser
drizzle/                     File migrasi SQL
```

## Alur penting

**Upload (3 langkah, siap untuk R2):**
1. Browser minta izin ke `POST /api/uploads/init`. Server mengecek hak akses, ukuran, dan ekstensi, lalu memberi URL upload + token bertanda tangan (HMAC).
2. Browser meng-upload file langsung ke URL tersebut:
   - sekarang ke endpoint lokal;
   - nanti ke presigned URL Cloudflare R2, jadi server tidak ikut menanggung bandwidth.
3. `POST /api/uploads/complete` memeriksa isi file (magic bytes), menghitung SHA-256, dan mengecek blocklist. Lalu:
   - gambar diproses jadi WEBP;
   - file rilis dipindah ke folder privat.

**Review:** seller baru → status `review` → moderator setuju/tolak. Seller terpercaya bisa langsung tayang (tetap tercatat di log). Update rilis untuk produk yang sudah tayang juga masuk antrian, dan versi lama tetap bisa diunduh sampai versi baru disetujui.

## Keamanan yang sudah diterapkan

- **Cookie session:** `httpOnly`. Di HTTPS juga `Secure` + `SameSite=None` + `Partitioned` (supaya jalan di iframe preview). Di domain sendiri nanti cukup `SameSite=Lax`.
- **Anti-CSRF:** Server Actions dicek Origin-nya oleh Next.js, dan semua route handler POST/PUT dicek Origin-nya secara manual.
- **Token upload/download:** HMAC-SHA256, berumur pendek, dan terikat ke user. Link download tidak bisa dibagikan ke akun lain.
- **Anti open redirect:** parameter `next` di halaman login cuma boleh path internal.
- **Anti path traversal:** key storage divalidasi ketat, jadi path traversal ditolak.
- **Markdown aman:** HTML mentah tidak dirender, gambar eksternal tidak dimuat, link diberi `rel="nofollow ugc noopener"`.
- **Privasi:** IP pengunduh disimpan dalam bentuk hash, bukan mentah (UU PDP).
- **Anti user-enumeration:** waktu respons login dibuat sama, baik email ada maupun tidak.

## Belum ada / batasan prototype

- **Pembayaran:** belum ada. Tombol beli nonaktif sampai **Fase 2** (Xendit).
- **Akun:** belum ada login Google, verifikasi email, dan reset password. Semuanya butuh layanan email/Google Cloud dan dikerjakan saat deploy.
- **Storage:** baru driver lokal. Driver **R2** ditambahkan saat deploy.
- **Rate limit:** masih di memori, cukup untuk 1 server. Di Vercel perlu Redis/Upstash.
- **Scan malware:** belum otomatis (ClamAV masuk Fase 4). Sementara moderator cek manual.
- **Review ulang:** edit info/gambar produk yang sudah tayang langsung berlaku tanpa review ulang. Perlu diputuskan sebelum beta publik.
- **Komunitas, ulasan & rating, notifikasi:** masuk Fase 3.
- **Review keamanan:** sebelum memegang uang sungguhan, kode sebaiknya direview **developer/security reviewer manusia**.

## Menuju production (butuh akun milik kamu)

1. **Domain:** cek ketersediaan nama + merek di DJKI.
2. **Supabase (database):**
   - buat project;
   - salin connection string *Transaction pooler* ke `DATABASE_URL`;
   - jalankan `npm run db:migrate`.
3. **Cloudflare R2 (file):**
   - buat 1 bucket publik (gambar) + 1 bucket privat (file aplikasi);
   - buat API token;
   - aku tambahkan driver `r2`.
4. **Vercel (hosting):**
   - import repo dari GitHub;
   - isi environment variables;
   - set `ALLOWED_ORIGINS` ke domain kamu.
5. **Xendit (pembayaran):** buat akun & sandbox untuk Fase 2, sambil mulai urus NIB/PSE dan KYB.
