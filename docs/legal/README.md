# Dokumen legal — Rilisin

**Status: DRAFT. Semua dokumen di folder ini ditulis oleh engineer, BUKAN nasihat
hukum. Jangan dipublikasikan sebelum ditinjau pengacara berlisensi.**

Versi dokumen: 1.0-draft · Disusun: 2026-09-28 · Bahasa Indonesia = versi yang
mengikat, Bahasa Inggris = terjemahan.

## Isi folder

| Berkas | Isi | Wajib sebelum |
|---|---|---|
| `TERMS.md` | Syarat & Ketentuan (pembeli + seller) | launch publik |
| `PRIVACY.md` | Kebijakan Privasi + inventaris & retensi data (UU PDP) | launch publik |
| `COOKIES.md` | Kebijakan Cookie (cookie yang BENAR-BENAR dipakai app) | launch publik |
| `AUP.md` | Aturan Pakai yang Dapat Diterima | launch publik |
| `REFUND.md` | Kebijakan Refund | menerima pembayaran nyata |

## Halaman publik (sumber teks yang dipakai situs)

Dokumen di folder ini adalah **satu-satunya sumber kebenaran**. Halaman publik
dibaca dari salinan hasil generate di `src/content/legal/*.ts`:

| Route | Dokumen |
|---|---|
| `/ketentuan` | `TERMS.md` |
| `/privasi` | `PRIVACY.md` |
| `/kuki` | `COOKIES.md` |
| `/aup` | `AUP.md` |
| `/refund` | `REFUND.md` |

Alur edit: ubah `.md` di folder ini → `npm run legal:sync` → commit keduanya.
CI menjalankan `npm run legal:check` dan **gagal** kalau keduanya beda, jadi teks
di situs tidak bisa diam-diam menyimpang dari dokumen yang direview pengacara.
Selama masih ada placeholder, semua halaman memakai `robots: noindex` dan
menampilkan banner "Masih draf" — jujur ke pengunjung bahwa dokumen belum final.

## Placeholder yang WAJIB diisi sebelum publish

Semua tanda `[TEMPAT_KOSONG]` di dokumen. Minimal:

- `[NAMA ENTITAS]` + bentuk badan hukum (PT/CV/perorangan) — perusahaan belum dibentuk
- `[ALAMAT ENTITAS]` — untuk klausul yurisdiksi & kontak DPO
- `[EMAIL KONTAK]` — untuk hak subjek data & laporan penyalahgunaan
- `[TANGGAL BERLAKU]` — tanggal publish, bukan tanggal draft
- Nama & domain final produk ("Rilisin" masih nama kerja; merek belum dicek di DJKI)

## Keputusan bisnis yang masih harus diambil kall (mengubah isi dokumen)

1. **Komisi platform** — draft memakai "[X]% dari harga jual, dibayar seller".
   Isi angka final sebelum publish.
2. **Siapa bayar biaya gateway** — draft mengikuti perilaku aplikasi sekarang:
   biaya gateway ditampilkan transparan & dibayar pembeli.
3. **Masa tahan dana** — draft memakai 7 hari (sesuai kode).
4. **Refund karya digital** — draft: refund kalau file terinfeksi / tidak sesuai
   deskripsi / tidak bisa diunduh; TIDAK refund setelah unduhan sukses dan file
   bekerja. Ini keputusan bisnis + konsumen — pengacara harus konfirmasi.
5. **Yurisdiksi & pengadilan** — draft: hukum Indonesia, pengadilan [KOTA].
6. **Usia minimum** — draft: 17 tahun (atau menikah) mengikuti UU ITE/PP 71/2019.

## Yang TIDAK bisa diselesaikan engineer (butuh profesional)

- Pembentukan badan hukum, NPWP, pendaftaran merek (DJKI)
- Pajak (PPN, PPh 21/23 untuk pencairan seller) — perlu konsultan pajak
- Kontrak kerja & kontrak dengan kontributor open-source (DCO/CLA)
- Kepatuhan Play Store / App Store kalau nanti bikin app mobile
- Klaim "lisensi yang dibeli mengizinkan penggunaan komersial" — tanggung jawab
  seller; dokumen hanya membatasi tanggung jawab platform, bukan menggantikannya

## Yang belum ditulis (di luar 5 dokumen di atas)

- **Perjanjian Seller** terpisah (aturan seller saat ini hidup di TERMS.md bagian
  Seller — kalau jadi panjang, pisahkan)
- **SLA** untuk tier berbayar (bila kelak ada paket berlangganan)
- **DPA** untuk pelanggan B2B (bila kelak ada)
- **Catatan penggunaan merek** "XyVerse Technology Global" dan merek Rilisin
- **CONTRIBUTING.md + CODE_OF_CONDUCT.md** (repo publik)
- **Catatan kepatuhan store** (Play/App Store) saat app mobile dibuat
- **Kebijakan DMCA/takedown** resmi (mekanisme lapor sudah ada di AUP; alur
  kontra-notifikasi butuh pengacara)

## Catatan kepatuhan

- **UU PDP No. 27/2022** — inventaris data, dasar pemrosesan, hak subjek data,
  dan kontak pengendali ada di `PRIVACY.md`. Notifikasi pelanggaran data
  **3x24 jam** ke subjek data & regulator (draft-nya sudah mengacu).
- **GDPR/UK GDPR & CCPA** — klausa kondisional di `PRIVACY.md`, aktif hanya kalau
  memang melayani pengguna Eropa/California. Kalau produk sengaja tidak melayani
  wilayah itu, tulis batasan itu secara eksplisit (sudah disiapkan tempatnya).
- **UU ITE & PP 71/2019** — AUP mengacu pada larangan konten ilegal; mekanisme
  penghapusan & pemblokiran ada di `AUP.md`.
