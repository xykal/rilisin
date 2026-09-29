# Push HP (OneSignal Web Push) + PWA

Status kode: TERPASANG, mati-aman (tanpa kunci = push nonaktif, aplikasi normal).
Status live: KUNCI TERPASANG di Vercel (production+preview) 2026-09-29 — App ID
publik + REST key sensitif. Sisa: uji end-to-end dari HP kelvin (langganan +
picu notif, lihat langkah 6).

## Cara kerja (ringkas)

- Browser memuat OneSignal SDK (CDN, malas) via `<PushInit/>` di layout.
  Login → `OneSignal.login(userId)`; logout → `logout()`.
- User menekan “Aktifkan push” di `/akun/notifikasi` → izin browser → langganan.
- Tiap `notifyAndEmail()` juga menjadwalkan push (`after`, tidak memperlambat aksi).
  Push dikirim hanya kalau: kategori push-nya ON + belum dibaca + belum terkirim
  (`pushed_at`, klaim atomik cerminan email). Pesan identik digabung 1 request.
- Preferensi per kategori: kunci `push` di `users.notify_prefs` (JSONB, tanpa migrasi).
  Default: transaksi ON, karya ON, forum OFF, diikuti OFF.
- Service worker: `public/OneSignalSDKWorker.js` (wajib root). Manifest PWA:
  `public/manifest.webmanifest` + ikon.

## Yang harus kelvin lakukan (sekali, ±10 menit)

1. onesignal.com → **New App** → nama `Rilisin` → **Web Push** → **Typical Site**.
2. Site URL = `https://rilisin.xyverse.my.id` (staging). SAVE. (URL produksi
   ditambah/diubah saat cutover — atau bikin app kedua `Rilisin Prod` nanti.)
3. **Settings → Keys & IDs**: salin **App ID** → kirim ke gua via chat (publik, aman).
4. Di halaman yang sama: salin **REST API Key** → tambahkan SENDIRI ke Vercel:
   proyek `rilisin` → Settings → Environment Variables → `ONESIGNAL_REST_API_KEY`
   (Production + Preview). JANGAN kirim via chat.
5. Kabari gua App ID-nya → gua pasang `NEXT_PUBLIC_ONESIGNAL_APP_ID` ke Vercel via
   CLI + verifikasi kirim push beneran ke HP lu.
6. Uji: buka staging di HP → `/akun/notifikasi` → Aktifkan → picu notif
   (mis. beli produk sendiri / minta ulasan) → push harus masuk.

## Batasan jujur

- Safari Mac: butuh sertifikat Apple ($99/thn) — BELUM didukung, user Safari tidak
  dapat push (lonceng + email tetap jalan).
- iPhone: push hanya kalau web dibuka dari ikon Home Screen (install via
  Bagikan → Add to Home Screen), iOS 16.4+. Android + Chrome desktop: langsung bisa.
- Pemblokir iklan / koneksi ke `cdn.onesignal.com` diblokir = panel menampilkan
  “gagal dimuat”, aplikasi tetap normal.
- Gratis OneSignal: 10 ribu email/bln (tidak dipakai — email tetap Resend),
  push web UNLIMITED di semua paket (termasuk gratis).
