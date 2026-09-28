# DESIGN — Rilisin visual identity

Status: DRAFT working document (2026-09-28). Bagian "Sekarang" mendokumentasikan
apa yang BENAR-BENAR ada di kode; bagian "Aturan" mengikat pekerjaan UI ke depan.
Kalau keduanya berbeda, kode yang benar — perbarui dokumen ini.

## Prinsip

Calm surfaces, hierarchy yang jujur, warna dipakai hemat, tipografi yang bekerja.
Referensi kualitas: Stripe / Apple / Vercel / Linear — untuk tingkat craft, bukan
untuk ditiru. Tidak ada template look, tidak ada skin component library apa adanya.

## Sekarang (dari kode, bukan rencana)

- Tipografi: Plus Jakarta Sans (Google Fonts, di-self-host oleh next/font saat
  build — tidak ada request font ke Google saat runtime). Fallback: system-ui.
  Mono: ui-monospace/Menlo untuk kode & hash.
- Warna: skala brand ungu `brand-50..900` (#f2f1ff → #33288a), brand-600 #5b43f5
  sebagai aksen utama, `ink #0f1222` untuk teks, latar `#f6f7fb`, permukaan putih,
  garis slate-200. Terang saja — dark mode BELUM ada.
- Radius: kartu/form besar `rounded-2xl`, kontrol `rounded-xl`, elemen kecil
  `rounded-lg`. Konsisten, tidak ada radius acak.
- Elevasi: `shadow-sm` tipis di kartu & input; tidak ada shadow berlapis.
- Ikon: lucide-react (ISC — tercatat di THIRD_PARTY_NOTICES.md), inline SVG,
  ukuran konsisten. BELUM punya set ikon XyVerse sendiri.
- Spacing: skala Tailwind default (4/8/12/16/24/32...), grid `max-w-7xl` untuk
  halaman lebar, `max-w-md` untuk form.
- Komponen inti: `src/components/ui.tsx` (Button, Field, Input, Card, Alert,
  EmptyState) + `cn()` untuk merge class.
- Motion: hanya `transition-colors` pada hover/fokus. Belum ada motion language
  tertulis.

## Aturan (mengikat)

1. Setiap permukaan membaca token yang sama; tidak ada warna hardcode di luar
   `globals.css` (@theme) kecuali nilai sekali pakai yang sudah jelas konteksnya.
2. Kontras teks minimum WCAG 2.2 AA (4.5:1 teks normal, 3:1 teks besar). Dihitung
   2026-09-28: brand-600 #5b43f5 di atas putih = 5.89:1 (lolos AA), brand-700
   #4b34d9 = 7.52:1, brand-500 #6e5bff = 4.56:1 (pas lolos — jangan dipakai untuk
   teks kecil di latar bukan-putih), ink #0f1222 di atas #f6f7fb = 17.36:1. Teks
   slate-400 hanya untuk teks sekunder pendek, jangan untuk isi.
3. Target sentuh minimal 44 px di mobile; state fokus selalu terlihat
   (`:focus-visible` outline brand-500 sudah jadi jaring pengaman global).
4. Teks buatan user (judul produk, nama toko, pesan chat) harus tahan layout:
   `overflow-wrap` sudah dipasang global — jangan dibuang.
5. Banned visual tropes (AI slop / generic): neon glow & glowing border, cyberpunk
   / hacker aesthetic, matrix rain, HUD futuristic, gradient ungu-biru "AI",
   gradient text di latar gelap, glassmorphism sebagai default, blob 3D & orb
   mengambang, background grid-line, template landing "hero + tiga kartu fitur",
   ilustrasi stok korporat, emoji sebagai ikon, kontrol OS default, tampilan
   Material tanpa modifikasi, lorem ipsum, avatar placeholder di UI rilis.
6. Screenshot produk & preview jujur: tangkapan layar asli, bukan mockup mewah.
7. Microcopy: Bahasa Indonesia sehari-hari, kalimat pendek, nama tombol = aksi
   ("Kirim ulang", bukan "Submit"). Pesan error selalu bilang apa yang harus
   dilakukan user.

## Motion language (target)

- Durasi: 120 ms (hover/fokus), 200 ms (masuk keluar elemen kecil), 300 ms
  (panel/dialog). Easing: `cubic-bezier(0.2, 0, 0, 1)` untuk masuk,
  `cubic-bezier(0.4, 0, 1, 1)` untuk keluar.
- Wajib hormati `prefers-reduced-motion: reduce` — animasi jadi transparan instan.
- Motion hanya untuk menjelaskan perubahan state (loading, konfirmasi, navigasi),
  bukan dekorasi.

## Theming (target)

- Token semantik (`--surface`, `--border`, `--text`, `--accent`) di atas token
  brand, supaya dark mode = satu file nilai, bukan cabang `dark:` di semua file.
- Dark mode: zero-flicker (kelas di <html> sebelum paint), konsisten web/desktop/mobile.
- Belum dijadwalkan — produksi jalan terang dulu; struktur token disiapkan sekarang.

## Aset milik XyVerse (target)

- `@xyverse/icons`: set ikon inline SVG XyVerse (grid 24 px, stroke 1.5 px,
  rounded joins, bobot optik konsisten) menggantikan lucide-react bertahap.
- Ilustrasi & motion (Lottie/Rive) digambar dari style guide XyVerse, bukan
  di-trace/recolor dari pihak ketiga.
- Logo & wordmark dari brand kit resmi (aturan pemakaian: latar terang → versi
  gelap, latar gelap → versi terang, tanpa recolor di luar hitam/putih, tanpa
  shadow/gradient/outline, mark kecil wajib untuk UI <=48 px).

## Checklist review UI

- [ ] Kontras lolos AA (dicek, bukan kira-kira)
- [ ] Jalur keyboard lengkap + fokus terlihat
- [ ] Layout aman di 320 px, 768 px, 1280 px+
- [ ] Teks Indonesia & Inggris (kalau ada) tidak kepotong
- [ ] Tidak memakai trope yang dilarang di atas
- [ ] Screenshot/demo asli
