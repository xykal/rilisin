# Rilisin — prototype (Fase 1 + Fase 2 Pembayaran + Fase 3/3b Komunitas + Fase 4 Keamanan & Operasi)

> "Rumah karya developer Indonesia". Tempat share gratis & jual aplikasi, game, source code, template, aset desain, dan e-book — plus komunitas (chat grup + forum) dan ulasan dari pemilik asli.
> **Rilisin** masih nama kerja: domain & merek belum dicek. Ganti nama cukup di `src/lib/config.ts`.

Blueprint lengkap ada di `../blueprint-store-komunitas.md`. Yang sudah jadi:

- **Fase 1** — fondasi + "share gratis": katalog, upload, download aman, library, moderasi.
- **Komunitas (ditarik maju dari Fase 3)** — chat grup realtime ala WhatsApp.
- **Keamanan (sebagian Fase 4 ditarik maju)** — 2FA, CSP, anti brute force, log keamanan, moderasi chat.

- **Fase 2 (uang)** — checkout QRIS / Virtual Account (Pakasir API v2 + mode simulasi), pesanan, buku besar saldo seller, masa tahan 7 hari, pencairan dana, refund, panel keuangan admin.
- **Fase 3 (komunitas)** — forum (tanya jawab dengan jawaban terbaik, diskusi per produk), ulasan & rating khusus pemilik, notifikasi in-app + email, lupa password lewat email.
- **Fase 3b** — ikuti seller & produk (kabar karya baru, versi baru, devlog), devlog per produk, lapor produk & akun, profil anggota dengan lencana, chat komunitas layar penuh.
- **Fase 4 (keamanan & operasi)** — scan malware otomatis (worker ClamAV terpisah, file terinfeksi diblokir + rilis ditolak), Cloudflare Turnstile di form rawan bot, rate limit bersama antar instance (Postgres), cron harian (pembersihan + backup database terenkripsi), halaman **Sistem** admin.

Detail keamanan ada di [`SECURITY.md`](./SECURITY.md).

---

## English summary

**Rilisin** (working name) is a marketplace for work by Indonesian developers: share
for free or sell apps, games, source code, templates, design assets, and e-books —
plus a community (group chat + forum) and reviews from verified owners only.

- **Status:** prototype / pre-launch. Name and domain not final. No real payments in
  staging (`PAYMENT_PROVIDER=mock`).
- **Stack:** Next.js 16 (App Router, React 19), TypeScript strict, Tailwind CSS 4,
  Drizzle ORM + Postgres (Neon), Vercel Blob, Zod, sharp. Node >= 20.9.
- **Working today:** catalog, safe uploads with signed 10-minute download URLs,
  ClamAV malware scanning (infected files blocked), checkout QRIS/Virtual Account
  via Pakasir (webhook re-confirmed against the gateway API), seller balance ledger,
  payouts and refunds, admin finance panel, realtime chat, forum, owner-only reviews,
  follows and devlogs, in-app + email notifications, 2FA/TOTP, password reset.
- **Security:** nonce CSP with `strict-dynamic`, Origin + Content-Type checks on
  every mutating endpoint, shared (Postgres) rate limits, honeypot + form tokens,
  Cloudflare Turnstile on bot-prone forms, per-object authorization, hashed IPs
  (Indonesian PDP law), encrypted database backups.
- **Tests in CI:** lint → typecheck → seed → backup/restore → build → 143-check
  end-to-end smoke test → security proving tests (429 after threshold, injection,
  traversal, XSS, IDOR, CSRF) → `npm audit` (high/critical) → deploy staging.
  CodeQL (SAST) runs on every push plus a weekly scan. All GitHub Actions are
  pinned to commit SHAs.
- **Docs:** [`docs/PRD.md`](docs/PRD.md) (product & business),
  [`docs/ROADMAP.md`](docs/ROADMAP.md), [`docs/AUDIT-2026-09-28.md`](docs/AUDIT-2026-09-28.md),
  [`docs/DESIGN.md`](docs/DESIGN.md), [`SECURITY.md`](SECURITY.md).
- **Legal:** public Terms/Privacy/Cookie/AUP documents are not written yet — they
  are a launch gate. `LICENSE` is proprietary (DRAFT, pending counsel review).
- Bahasa Indonesia is the product language; the detailed documentation below is in
  Indonesian.

---

## Yang sudah jalan

| Area | Fitur |
|---|---|
| Navigasi | Header dengan **mega menu** saat kursor diarahkan (Jelajahi: kategori + jumlah karya, platform, pintasan, pilihan editor · Komunitas: daftar ruang · Panduan). Bisa juga dibuka dengan klik & keyboard. Di HP: laci menu dari kanan |
| Katalog | Beranda (pilihan editor, trending 7 hari, baru rilis, cuplikan obrolan komunitas), Jelajahi dengan filter kategori/platform/harga, pencarian full-text |
| Produk | Cover, ikon, screenshot, deskripsi Markdown aman, riwayat versi, lisensi, label verifikasi developer Android |
| Download | Wajib login. Tombol (POST) → cek hak akses → catat → **signed URL** 10 menit yang terikat ke akun |
| Library | Karya yang pernah diunduh / dibeli + tanda **"Update tersedia"** |
| **Checkout (Fase 2)** | Harga tetap atau **bayar seikhlasnya** (boleh Rp0 kalau seller mengizinkan). Metode: **QRIS** (biaya termurah) & Virtual Account BRI/BNI/Permata/CIMB/Maybank. Biaya gateway ditampilkan transparan & dibayar pembeli. Halaman pesanan: QRIS / nomor VA, hitung mundur, status berubah otomatis (webhook + polling), bukti bayar, email struk (Resend, opsional) |
| **Saldo seller** | Komisi 10% (promo 0% seller awal) dipotong otomatis · pendapatan **ditahan 7 hari** lalu bisa dicairkan (min. Rp50.000) ke rekening bank / e-wallet · rekening **dienkripsi** & diverifikasi admin · pencairan wajib konfirmasi password (+2FA kalau aktif) |
| **Keuangan admin** | `/admin/keuangan` (khusus admin): omzet, komisi, saldo tertahan/tersedia, **antrian pencairan** (nomor rekening lengkap, tandai terkirim / tolak), verifikasi rekening, daftar pesanan + detail (log event pembayaran, buku besar), **refund** (akses dicabut, pendapatan seller ditarik) |
| Seller Center | Toko, profil `/@username`, editor karya, upload gambar & file rilis, checklist siap tayang, kirim review, rilis versi baru |
| **Komunitas (chat grup)** | 8 ruang (Pengumuman, Nongkrong, Tanya Jawab Coding, Pamer Karya, Android & Flutter, Desain, Cerita Seller, Game Dev). Pesan **realtime**, "sedang mengetik…", jumlah online, badge belum dibaca + penanda "N pesan belum dibaca", pemisah tanggal, balasan (quote), gambar, format `*tebal*` `_miring_` `~coret~` `` `kode` `` + blok kode, link & @mention, emoji besar |
| **Tahan pesan (ala WhatsApp iPhone)** | Tahan ±0,4 dtk (atau klik kanan / tombol ▾ di desktop / Enter di keyboard) → latar **blur**, pesan terangkat, **bar reaksi emoji** di atas, **menu** di bawah: Balas · Salin · Edit · Sematkan* · Laporkan · Bisukan* · Hapus → *sheet* **Hapus untuk saya / Hapus untuk semua orang**. Geser pesan ke kanan = balas cepat. (*khusus moderator) |
| Aturan chat | Edit ≤ 15 menit (label "diedit"), hapus untuk semua ≤ 48 jam (moderator kapan saja), 1 reaksi per orang per pesan, pesan tersemat, ruang pengumuman (hanya staf), mode lambat per ruang |
| **Keamanan akun** | Halaman `/akun/keamanan`: **2FA (TOTP)** + 10 kode cadangan, ganti password (perangkat lain otomatis keluar), daftar perangkat + keluarkan, riwayat aktivitas keamanan |
| Moderasi | Review karya & rilis · **Laporan chat** (hapus, pulihkan, tolak, bisukan, blokir akun) · **Laporan forum & ulasan** (sembunyikan, pulihkan, tolak, blokir penulis; otomatis tersembunyi setelah 3 pelapor) · sematkan / kunci / sembunyikan thread langsung di halaman thread · **Log keamanan** |
| **Forum (Fase 3)** | `/forum`: 8 kategori (Pengumuman · Tanya Jawab · Pamer Karya · Devlog · Request · Cari Tim · Masukan · Warung Kopi), urutan Aktif / Terbaru / Teratas / **Belum terjawab**, pencarian full-text. Thread & balasan **Markdown aman** (kode, daftar, link `nofollow ugc`, `@mention` → notifikasi), **upvote**, **jawaban terbaik** (kategori Tanya Jawab, dipilih penanya), ubah/hapus postingan sendiri. **Diskusi per produk**: thread bisa ditautkan ke produk, muncul di halaman produk dengan badge **Pembuat** / **Pemilik** |
| **Ulasan & rating (Fase 3)** | Hanya **pemilik** (sudah mengunduh / membeli) yang bisa mengulas, 1 ulasan per orang, bisa diubah/dihapus. Rating 1–2 wajib ada alasan, tanpa link. **Seller membalas** (tidak bisa menghapus). Ringkasan & distribusi bintang, halaman semua ulasan (urut & filter bintang), rating di kartu produk, urutan **Rating tertinggi** di Jelajahi |
| **Notifikasi (Fase 3)** | **Lonceng** di header (jumlah belum dibaca, panel 8 terbaru, tandai dibaca) + halaman `/notifikasi`. Pemicu: balasan & mention forum, jawaban terbaik, ulasan baru, balasan seller, penjualan, pencairan diproses/ditolak, karya disetujui/ditolak, balasan & mention di chat. Kejadian sejenis **digabung** ("3 balasan baru di …"). **Email** via Resend per kategori (`/akun/notifikasi`), maks. 1 email per grup sampai dibuka, link **berhenti berlangganan** + one-click (RFC 8058) |
| **Lupa password (Fase 3)** | `/lupa-password` → link sekali pakai 30 menit ke email → password baru → semua perangkat dikeluarkan + email pemberitahuan. Jawaban selalu sama (tidak membocorkan email terdaftar) |
| **Ikuti (Fase 3b)** | Ikuti **seller** (kabar karya baru) & **produk** (versi baru + devlog). Karya yang diunduh/dibeli **otomatis diikuti** (bisa dihentikan). Jumlah pengikut di profil & halaman produk, halaman `/akun/diikuti`, seller dapat notifikasi pengikut baru. Notifikasi ke semua pengikut dikirim dalam **satu query** (INSERT … SELECT), email kategori ini default **mati** |
| **Devlog (Fase 3b)** | Thread kategori Devlog yang ditulis seller untuk produknya: tampil di bagian **Devlog** halaman produk (`/p/[slug]/devlog`), pengikut produk dapat notifikasi; komentar, upvote & moderasi memakai forum |
| **Profil anggota (Fase 3b)** | `/@username` untuk semua anggota: lencana (Tim Rilisin, Moderator, Seller/terpercaya, Penjawab andal, Aktif di forum), statistik forum & ulasan, thread & balasan terbaru, ulasan yang ditulis, tombol ikuti & **laporkan akun** |
| **Lapor produk & akun (Fase 3b)** | Alasan khusus per jenis (bajakan, malware, penipuan, akun palsu, …). Masuk antrean **Laporan konten**: produk bisa **ditangguhkan**, akun diblokir (admin). Tidak disembunyikan otomatis (mencegah laporan jahat dari pesaing) |
| Chat layar penuh | Desktop/tablet: daftar ruang + obrolan mengisi seluruh layar di bawah header (tanpa kartu), HP: ruang obrolan layar penuh seperti aplikasi |
| **Antivirus (Fase 4)** | Setiap file rilis masuk **antrean scan**. Worker terpisah (`scanner/`, ClamAV) mengklaim antrean lewat API internal bertoken → stream file → clamd `INSTREAM` (file tak pernah mendarat di disk worker). **Terinfeksi**: hash diblokir permanen, file dihapus, rilis otomatis **ditolak**, produk ditangguhkan kalau tak ada versi bersih, seller dikabari. File lama dipindai ulang tiap 30 hari (signature baru). `REQUIRE_CLEAN_SCAN=1` → file belum bersih tak bisa diunduh. Uji EICAR di CI (workflow `scanner.yml`) |
| **Turnstile (Fase 4)** | Captcha tanpa teka-teki (Cloudflare) di daftar, lupa password, dan **masuk setelah 3× gagal** dari IP yang sama (pengguna normal tak terganggu). Verifikasi server-side (action + hostname diikat), gagal tertutup saat Cloudflare down. Kunci uji resmi dipakai CI |
| **Rate limit bersama (Fase 4)** | Jalur sensitif (login, daftar, reset, lapor, chat, unduh, checkout) pakai limit fixed-window di **Postgres** (`INSERT … ON CONFLICT` atomik) → konsisten walau request jatuh ke instance Vercel berbeda. Database down → jatuh ke limit memori (fail-open terukur, situs tidak mati) |
| **Cron harian & backup (Fase 4)** | Vercel Cron → `/api/cron/harian` (Bearer `CRON_SECRET`): pembersihan (sesi/token kedaluwarsa, notifikasi > 90 hari, upload mentah, isi pesan terhapus > 30 hari, pesanan lewat batas) + **backup database terenkripsi** (X25519 + AES-256-GCM, retensi 14 file, kunci privat tidak pernah ada di server). Restore teruji: `npm run backup:restore` |
| **Halaman Sistem (Fase 4)** | `/admin/sistem` (khusus admin): status pengaman (2FA staf, Turnstile, worker scan, backup), riwayat tugas cron, daftar backup + unduh terenkripsi, picu tugas manual |
| Halaman info | `/keamanan` (Pusat Keamanan), `/komunitas/aturan`, `/panduan/android`, `/.well-known/security.txt` |

## Akun demo

Password semua akun: **`rilisin123`**

| Email | Peran |
|---|---|
| `user@rilisin.test` | Rina, pengguna biasa. Library terisi (1 update tersedia, 1 produk **dibeli**), ada **pesan belum dibaca** di #nongkrong & #pamer-karya. Coba beli **KasirKu Pro** / **Laravel Kasir POS** → bayar lewat tombol simulasi |
| `seller@rilisin.test` | Seller "Nusantara Labs": karya tayang/direview/draft + **KasirKu Pro (berbayar)** dengan 5 penjualan, saldo tersedia Rp82.300 & tertahan Rp88.200, rekening BCA terverifikasi → bisa langsung coba **cairkan dana** |
| `admin@rilisin.test` | Admin. Antrian review, **2 laporan chat**, **Keuangan**: 1 pencairan menunggu (Dapur Kode Rp250.000) + 1 rekening e-wallet perlu verifikasi |
| `dimas24@contoh.test` | **Moderator komunitas** (bisa sematkan, hapus pesan siapa pun, bisukan anggota) |

Semua produk, akun, obrolan, dan angka unduhan adalah **data demo**. File unduhan hanya placeholder kecil.

**Coba beli:** masuk sebagai Rina → buka *KasirKu Pro* → **Beli** → pilih QRIS → di halaman pesanan tekan **Simulasikan pembayaran berhasil** → produk masuk Library. Lalu masuk sebagai seller (penjualan & saldo) dan admin (Keuangan).

**Coba 2FA:** masuk → menu akun → *Keamanan akun* → *Aktifkan 2FA* → scan QR dengan Google Authenticator/Authy → simpan kode cadangan → keluar & masuk lagi.

---

## Cara menjalankan

Butuh: **Node.js ≥ 20.9** dan **PostgreSQL** (skrip di bawah memasangnya otomatis di Debian/Ubuntu).

```bash
npm install
cp .env.example .env.local      # isi DATABASE_URL & APP_SECRET (lihat komentar di file)
npm run setup                   # nyalakan PostgreSQL lokal + buat tabel + isi data demo
npm run build && npm run start  # buka http://localhost:3000
```

| Perintah | Fungsi |
|---|---|
| `npm run setup` | Nyalakan PostgreSQL lokal + reset & isi data demo |
| `npm run db:seed` | Reset database & storage lokal lalu isi data demo. ⚠️ **Semua data dihapus** |
| `npm run db:migrate` | Jalankan migrasi (tanpa menghapus data) |
| `npm run db:generate` | Buat file migrasi baru setelah mengubah `src/lib/db/schema.ts` |
| `npm run typecheck` / `npm run lint` | Cek TypeScript / ESLint |
| `npm run test:smoke` | Tes end-to-end **252 pengecekan** (keamanan, katalog, upload, chat realtime, 2FA, checkout, pembayaran, saldo, pencairan, refund, forum, ulasan, ikuti, Turnstile, rate limit bersama, cron+backup, protokol worker antivirus). Server harus jalan; isi `CRON_SECRET`/`SCAN_WORKER_TOKEN` di env shell supaya uji cron & worker ikut jalan. Menambah data uji → jalankan `db:seed` lagi |
| `npm run test:pakasir` | Contract test adapter **Pakasir API v2** + webhook (16 pengecekan) memakai server Pakasir palsu — tidak menyentuh akun asli |
| `npm run test:backup` | Uji bolak-balik backup: ekspor → enkripsi → dekripsi → restore ke database baru → cocokkan jumlah baris, saldo, rating, skor forum & sequence (butuh `DATABASE_URL`) |
| `npm run test:scanner` | Uji worker antivirus dengan **ClamAV sungguhan** + file uji EICAR: deteksi → hash diblokir → file dihapus → rilis ditolak (butuh app jalan + clamd, lihat `.github/workflows/scanner.yml`) |
| `npm run backup:keygen` | Buat pasangan kunci X25519 untuk backup: publik → env server, privat → simpan offline |
| `npm run backup:restore -- <file.rlsbak> [--ganti]` | Pulihkan backup terenkripsi (butuh `BACKUP_PRIVATE_KEY` + `DATABASE_URL` database kosong) |
| `npm run test:responsive -- <engine> <quick\|full>` | Audit tampilan: 36 halaman × 8 (quick) atau 25 (full) ukuran layar. Engine: `chromium`, `webkit`, `firefox`, `all`. Tambah `shots` untuk screenshot |
| `npm run test:ui -- <engine>` | Cek komponen interaktif: laci menu, mega menu, dropdown akun, chat, overlay tahan pesan, sheet hapus |

> **Di sandbox chat ini:** database, file upload (`.local/`), `node_modules`, dan `.next` **tidak ikut tersimpan**. Kalau sandbox restart:
> `npm install && npm run setup && npm run build && npm run start`

## Pembayaran (Fase 2) — cara kerjanya

```
Pembeli → /beli/[slug] ──createOrder()──► orders (pending) ──► Pakasir v2: create-transaction (idempoten per order_id)
                                                   │
Halaman /pesanan/[kode]: QRIS / VA + hitung mundur │  polling /api/orders/[kode]/status (maks 1×/5 dtk ke gateway)
                                                   ▼
Pakasir ──POST webhook (X-Secret)──► /api/payments/pakasir/webhook ──► konfirmasi ulang ke API transaction-status
                                                   │
                                                   ▼
                      applyPaymentCompleted()  [1 transaksi DB, baris pesanan dikunci FOR UPDATE]
                        ├─ orders.status = paid
                        ├─ entitlements (source=purchase)  → produk masuk Library, bisa di-download
                        ├─ ledger_entries: sale +pendapatan seller, available_at = +7 hari
                        └─ email struk (setelah respons, lewat after())
```

Aturan uang yang dijaga kode **dan** database:
- Rupiah selalu **BIGINT**; komisi dibulatkan ke bawah (selisih pembulatan milik seller). CHECK constraint: `komisi + hak seller = harga`.
- **Saldo = SUM(ledger)**, tidak ada kolom saldo yang bisa melenceng. `ledger_entries` **append-only**: trigger database menolak UPDATE/DELETE. Koreksi = baris baru (refund, pengembalian pencairan).
- Idempoten: unique index 1 pesanan pending per pembeli+produk, 1 `sale`/`refund` per pesanan, 1 debit/pengembalian per pencairan, 1 pencairan terbuka per seller. Webhook dikirim ulang = `duplicate`, saldo tidak dobel.
- Webhook tidak dipercaya mentah: secret dicek constant-time, status + nominal + order_id dikonfirmasi ke API status, nominal harus sama dengan pesanan, transaksi sandbox tidak bisa melunasi pesanan live (`PAKASIR_ALLOW_SANDBOX=0`).
- Harga dihitung ulang di server (nominal dari browser diabaikan untuk harga tetap). Tidak bisa membeli produk sendiri / yang sudah dimiliki.
- Pencairan: minimal Rp50.000, hanya dari saldo yang sudah cair, konfirmasi password (+2FA), rekening terverifikasi admin, baris seller dikunci supaya dua pengajuan bersamaan tidak lolos cek saldo. Semua aksi uang tercatat di log keamanan.
- Mode simulasi (`PAYMENT_PROVIDER=mock`) memakai jalur kode yang sama persis dengan webhook asli.

## Responsif & kompatibilitas browser (dicek 27 Sep 2026)

Semua halaman diuji otomatis dengan Playwright di **25 ukuran layar**, dari **280px** (Galaxy Fold tertutup) sampai **3440px** (monitor ultrawide). Ukuran di antaranya: HP kecil & besar, HP landscape, tablet (portrait/landscape), laptop, Full HD, dan QHD.

| Engine | Mewakili | Hasil |
|---|---|---|
| Chromium | Chrome, Edge, Samsung Internet, Opera, WebView Android | 900 kombinasi halaman×layar: **0 masalah**; semua komponen interaktif muat |
| WebKit | Safari iPhone, iPad, Mac | 925 kombinasi (termasuk data nama super panjang): **0 masalah**; login lewat HTTPS & komponen interaktif OK |
| Firefox | Firefox desktop & Android | 296 kombinasi: **0 masalah**; komponen interaktif OK |

Yang dicek:
- **Tata letak:** tidak ada scroll horizontal, elemen keluar layar, atau teks meluber keluar kotaknya.
- **Kualitas:** tidak ada error JS/konsol; semua halaman HTTP 200.
- **Komponen interaktif:** laci menu HP, mega menu (hover di desktop, tap di tablet), dropdown akun, overlay "tahan pesan" + bar emoji, dan sheet "Hapus untuk semua orang" muat di layar.
- **Kolom ketik chat** selalu terlihat, termasuk di HP landscape.
- **Uji teks ekstrem:** judul 80 karakter, nama toko/nama user 50 karakter tanpa spasi, username 20 karakter, pesan chat berisi URL & kata sangat panjang.

Aturan layout yang dipakai (penting kalau menambah halaman baru):
- **Grid responsif selalu punya kolom dasar** `grid-cols-1`, dan kolom fleksibel memakai `minmax(0,1fr)`, bukan `1fr` polos. Tanpa itu, satu baris konten panjang bisa melebarkan kolom melewati layar (bug lama di Seller Center HP).
- **Teks buatan user di dalam `flex`** dibungkus `<span className="min-w-0 truncate">` atau `[overflow-wrap:anywhere]`. Ada jaring pengaman global juga: `overflow-wrap: break-word` di body, dan `anywhere` di h1–h3.
- **Chat:** tata letak "desktop" (daftar ruang + obrolan berdampingan) hanya aktif kalau layar **≥ 768px lebar DAN ≥ 560px tinggi** (varian `chat-wide` / `chat-narrow` di `globals.css`). HP landscape memakai tata letak layar penuh.
- **Tombol di HP (< 640px)** boleh turun baris kalau labelnya panjang.
- **Mega menu** bisa discroll kalau lebih tinggi dari layar.
- **Tab chat di latar belakang** melepas koneksi realtime setelah 45 detik, lalu menyambung lagi otomatis saat dibuka.

Batasan yang perlu diketahui:
- **Browser:** yang didukung adalah browser modern, mengikuti syarat Tailwind CSS v4: Safari/iOS 16.4+, Chrome/Edge 111+, Firefox 128+ (browser ±3 tahun terakhir). Browser yang sangat tua mungkin menampilkan gaya kurang rapi.
- **Getar saat menahan pesan** hanya jalan di Android (iPhone tidak mengizinkan web memakai getar).
- **Hosting:** chat realtime memakai SSE. Pastikan hosting production memakai **HTTP/2**; ini standar di Vercel, Cloudflare, dan nginx modern. Di HTTP/1.1 browser cuma memberi ±6 koneksi per situs untuk semua tab.

Cara mengulang tes:
```bash
npm install && npx playwright install --with-deps chromium webkit firefox   # sekali saja
npm run test:responsive -- chromium full      # 900 kombinasi, ±4 menit
npm run test:ui -- chromium
# WebKit perlu HTTPS (cookie login __Host- + Secure):
node scripts/qa/https-proxy.mjs &              # https://localhost:3443
BASE=https://localhost:3443 npm run test:responsive -- webkit quick
BASE=https://localhost:3443 npm run test:ui -- webkit
```
Tes login memakai akun demo, jadi jalankan `npm run db:seed` dulu kalau datanya sudah diubah.

### Kalau login tidak "nyangkut" di preview
Preview berjalan di dalam iframe. Beberapa browser (terutama Safari) memblokir cookie di iframe — buka preview di tab baru.

---

## Struktur folder

```
src/
  proxy.ts                   Content-Security-Policy + nonce per request, HSTS
  app/
    page.tsx                 Beranda
    jelajahi/, p/[slug]/, u/[username]/, library/, seller/, panduan/android/
    komunitas/               Chat: daftar ruang, [room] (ruang chat), aturan
    akun/keamanan/           Keamanan akun + 2fa/ (aktivasi 2FA)
    masuk/verifikasi/        Langkah ke-2 login (kode 2FA / kode cadangan)
    keamanan/                Pusat Keamanan (publik)
    admin/                   review/, laporan/ (laporan chat), keamanan/ (log keamanan)
    actions/                 Server Actions: auth, security, moderation, seller, admin
    api/chat/                rooms/[slug]/messages|typing|read, messages/[id], stream (SSE), uploads
    api/uploads/, api/storage/, api/download/, media/
  components/
    chat/                    chat-app, message-bubble (gestur tahan/geser), message-focus (overlay blur),
                             sheets (action sheet, emoji, reaksi, lapor, bisukan, link luar), composer, format
    nav-menus.tsx            Mega menu desktop + laci menu HP
    security-forms.tsx       Form 2FA, ganti password, kode cadangan
  lib/
    chat/                    shared (tipe & aturan), server (query & aksi), bus (realtime), notify, filter (judol), text
    security/                crypto (AES-GCM, HKDF), totp, events (log), labels, password-policy, form-guard, login-guard
    auth/                    password, session, current-user, guards, mfa
    api.ts                   Helper route handler: CSRF (Origin + Content-Type), batas ukuran body
    db/schema.ts             Skema database (Drizzle) — 23 tabel
scripts/
  seed.ts, seed-chat.ts      Data demo (produk + percakapan komunitas)
  smoke-test.mjs             Tes end-to-end tanpa browser
  qa/                        Tes tampilan pakai browser sungguhan (Playwright): responsive-audit, interactive-check, https-proxy
drizzle/                     Migrasi SQL (0000_init, 0001_security_chat)
```

## Alur penting

**Chat realtime:**
1. Browser membuka `GET /api/chat/stream?room=…` (Server-Sent Events, wajib login, maks 6 koneksi per akun).
2. Setiap pesan baru / edit / hapus / reaksi disimpan ke PostgreSQL, lalu server mengirim sinyal kecil lewat **`NOTIFY`**.
3. Setiap instance server yang `LISTEN` mengambil pesan itu **sekali** dari database, lalu meneruskannya ke semua browser di ruang tersebut.
4. Kalau koneksi putus, browser menyambung ulang otomatis dan menyinkronkan perubahan yang terlewat (`?since=`).
5. Pesan dikirim secara *optimistic* (langsung tampil). `clientId` acak membuat kirim ulang tidak menghasilkan pesan dobel.

**Login dengan 2FA:** password benar → tantangan disimpan (cookie httpOnly, 10 menit, maks 5 percobaan) → kode TOTP/kode cadangan → baru session dibuat.

**Upload & review karya:** sama seperti Fase 1 (init → PUT → complete; cek magic bytes, SHA-256, blocklist; review moderator).

## Keamanan yang sudah diterapkan (ringkas)

Lengkapnya di [`SECURITY.md`](./SECURITY.md).

- **Header:** CSP dengan nonce + `strict-dynamic`, HSTS, `X-Frame-Options`/`frame-ancestors`, nosniff, Referrer-Policy, Permissions-Policy, COOP.
- **Akun:**
  - 2FA TOTP (secret terenkripsi AES-256-GCM, anti replay) + kode cadangan (hash ber-pepper);
  - kunci akun 15 menit setelah 8× gagal;
  - rate limit per IP & per akun;
  - anti-enumeration;
  - kebijakan password (min 10, tolak password umum);
  - honeypot + token waktu anti-bot;
  - cookie `__Host-`;
  - session baru tiap login, keluarkan semua perangkat saat ganti password.
- **Chat:**
  - validasi zod;
  - pembersihan karakter tak terlihat/bidi/zalgo;
  - filter **judol** (tahan trik `5l0t g4c0r`);
  - rate limit, deteksi flood, mode lambat;
  - akun baru < 24 jam tak bisa kirim link;
  - peringatan link luar;
  - lapor → auto-sembunyi di 3 laporan;
  - bisukan & blokir;
  - gambar dicek magic bytes, EXIF dibuang.
- **Umum:**
  - CSRF (Origin + Content-Type JSON);
  - batas ukuran body;
  - IP hanya disimpan sebagai hash;
  - IP dibaca dari proxy tepercaya (`TRUSTED_PROXY_HOPS`);
  - log keamanan & log moderasi.
- **Fase 4:**
  - **Turnstile** di form rawan bot (daftar, lupa password, masuk setelah 3× gagal) — verifikasi server-side, action & hostname diikat, gagal tertutup;
  - rate limit jalur sensitif **di Postgres** (konsisten antar instance; kunci di-hash, tanpa IP/email mentah — UU PDP);
  - **antivirus**: file rilis dipindai ClamAV sebelum boleh diunduh publik (opsional `REQUIRE_CLEAN_SCAN=1`), hash malware diblokir permanen;
  - endpoint internal (`/api/cron/*`, `/api/internal/scan/*`) bertoken (timing-safe, min. 32 karakter) & mati total tanpa env — dikecualikan dari Basic Auth staging hanya untuk pemegang token;
  - **backup terenkripsi** harian (X25519 + AES-256-GCM, integritas teruji, kunci privat offline) + retensi 14 file;
  - pembersihan terjadwal data kedaluwarsa (sesi, token, notifikasi lama, upload yatim, isi pesan terhapus).

## Belum ada / batasan prototype

- **Pembayaran:**
  - demo memakai **mode simulasi** (`PAYMENT_PROVIDER=mock`) — tidak ada uang sungguhan;
  - adapter **Pakasir API v2** sudah jadi & lolos contract test, tapi butuh **proyek Pakasir khusus Rilisin** (slug, API key, webhook secret) + URL publik untuk webhook;
  - pencairan ke seller masih **transfer manual** oleh admin (Pakasir tidak punya API disbursement); refund ke pembeli juga manual;
  - pajak (PMK 37/2025, PPh 22 marketplace) belum dihitung — baru relevan kalau ditunjuk DJP.
- **Akun:**
  - belum ada login Google, verifikasi email, dan reset password (butuh layanan email/Google Cloud, dikerjakan saat deploy);
  - admin belum *wajib* 2FA di demo (`REQUIRE_STAFF_2FA=0`); di production set `1`.
- **Realtime:**
  - presence ("N online") masih dihitung per proses server (rate limit sensitif sudah pindah ke Postgres di Fase 4);
  - untuk banyak instance/serverless → layanan realtime khusus (mis. Supabase Realtime), atau jalankan chat di server Node biasa;
  - `LISTEN` butuh koneksi database langsung (`DATABASE_URL_DIRECT`), bukan transaction pooler.
- **Chat:**
  - belum ada pencarian pesan, notifikasi push, DM pribadi, dan deteksi gambar tidak pantas otomatis (masih mengandalkan laporan).
- **File:** scan malware sudah jalan (Fase 4) dan **worker ClamAV produksi sudah aktif via cron GitHub Actions** (workflow `scan-staging.yml`, tiap jam + manual "Run workflow" — tanpa VPS, runner repo publik gratis). `REQUIRE_CLEAN_SCAN` masih 0 (file baru langsung bisa diunduh; dinyalakan kalau mau wajib-tunggu-scan). Storage: driver lokal (dev) & Vercel Blob (staging); R2 saat trafik besar.
- **Review ulang:** edit produk yang sudah tayang langsung berlaku tanpa review ulang — perlu diputuskan sebelum beta publik.
- **Audit:** sebelum memegang uang sungguhan, kode sebaiknya direview **security reviewer manusia** / pentest.

## Staging gratis — https://rilisin.xyverse.my.id

- **Stack:** Vercel Hobby (region `sin1`) + Neon Free (Postgres 18, Singapura, via Vercel Marketplace) + Vercel Blob (`rilisin-media` publik, `rilisin-files` privat). DNS: CNAME di Cloudflare.
- **Dikunci Basic Auth** (`SITE_LOCK_USER` / `SITE_LOCK_PASSWORD`). Yang tetap terbuka: webhook pembayaran, `/.well-known/`, `robots.txt`. Pembayaran **mode simulasi** (`PAYMENT_PROVIDER=mock`).
- **Hobby = non-komersial.** Jangan terima uang sungguhan di sini; produksi pakai Vercel Pro.
- **Email staging:** Resend (akun `stok_ke_2`, terpisah dari domain proyek lain), pengirim `notifikasi@rilisin.xyverse.my.id` (DKIM + SPF + DMARC `p=none` di Cloudflare). Kuota gratis Resend ±100 email/hari. Akun demo memakai domain `.test` → emailnya **tidak pernah dikirim**; untuk mencoba, daftar pakai email asli lalu buka `/akun/notifikasi` → **Kirim email uji**.
- **Deploy otomatis:** tiap push ke `main` yang lulus CI, job `deploy` di GitHub Actions menjalankan `vercel deploy --prod` (build di Vercel). Deploy ulang manual: tab **Actions → CI → Run workflow** (branch `main`).
  - Token: GitHub → Settings → Environments → `staging` → secret `VERCEL_TOKEN` (hanya branch `main`). Kalau token Vercel dirotasi, ganti secret ini juga.
  - Tidak memakai integrasi Git Vercel: deploy hanya terjadi kalau tes lulus, dan aplikasi Vercel tidak perlu akses ke akun GitHub.
- **Seed ulang** (MENGHAPUS semua data staging, termasuk file di Blob):
  ```bash
  vercel env pull .env.staging --environment=production   # JANGAN ke .env.local
  # muat isi .env.staging ke environment, lalu:
  DATABASE_URL="$DATABASE_URL_UNPOOLED" SEED_ALLOW_REMOTE=hapus-semua-data SEED_DEMO_PASSWORD='…' npx tsx scripts/seed.ts
  ```
- **Smoke test ke staging** (menambah data uji, jadi seed ulang sesudahnya):
  ```bash
  SMOKE_BASIC_AUTH='user:password' SMOKE_DEMO_PASSWORD='…' node scripts/smoke-test.mjs https://rilisin.xyverse.my.id
  ```
- **Catatan:**
  - Neon Free tidur setelah 5 menit sepi, jadi request pertama sesudahnya ±1–2 dtk lebih lambat.
  - Seed dari luar Singapura makan waktu ±5 menit (latensi per query).
  - `vercel install` / `vercel env pull` / `vercel link` bisa menulis `.env.local` dan file "agent skills" (`.agents/`, `.claude/`, `skills-lock.json`). Pakai `--no-env-pull`; file skills sudah masuk `.gitignore`.
  - Edge Vercel menolak path `..%2F` dengan 400 sebelum sampai ke app (lokal: 404 dari route).

## Menuju production (butuh akun milik kamu)

1. **Domain:** cek ketersediaan nama + merek di DJKI.
2. **Database — Neon** (sudah dipakai staging):
   - `DATABASE_URL` = pooler, `DATABASE_URL_UNPOOLED` = koneksi langsung (dipakai LISTEN chat realtime); keduanya diisi otomatis oleh integrasi Vercel;
   - jalankan `npm run db:migrate`. Produksi = proyek/branch Neon terpisah dari staging.
3. **File — Vercel Blob** (sudah jalan: store publik + privat, presigned upload/download). Pindah ke **Cloudflare R2** kalau trafik unduhan besar (egress R2 gratis).
4. **Hosting — Vercel Pro** (Hobby dilarang untuk komersial):
   - isi env: `APP_SECRET` (acak ≥ 32 karakter), `ALLOWED_ORIGINS=domainkamu`, `REQUIRE_STAFF_2FA=1`, `TRUSTED_PROXY_HOPS=1`;
   - `FRAME_ANCESTORS` kosongkan;
   - ganti kontak di `public/.well-known/security.txt`.
5. **Upstash Redis:** rate limit & presence lintas server.
6. **Pakasir (pembayaran):** buat proyek baru "rilisin" (otomatis mode sandbox) → isi Webhook URL `https://DOMAIN/api/payments/pakasir/webhook` → isi env `PAYMENT_PROVIDER=pakasir`, `PAKASIR_SLUG`, `PAKASIR_API_KEY`, `PAKASIR_WEBHOOK_SECRET`. Go live: KYC akun + KYC proyek di Pakasir, lalu `PAKASIR_ALLOW_SANDBOX=0`.

---

Built by xykal — XyVerse Technology Global.
Dibuat oleh xykal — XyVerse Technology Global.
