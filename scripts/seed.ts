/**
 * Reset database + isi data demo.  Jalankan: npm run db:seed
 * PERINGATAN: menghapus SEMUA data (schema public) dan semua file di storage lokal.
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { hashPassword } from "../src/lib/auth/password";
import * as schema from "../src/lib/db/schema";
import { makeApk, makeCover, makeIcon, makePdf, makeScreenshot, makeZip, type ScreenSpec, type Visual } from "./seed-assets";
import { seedChat } from "./seed-chat";
import { seedPayments } from "./seed-payments";

config({ path: ".env.local", quiet: true });

if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED !== "1") {
  console.error("Menolak menjalankan seed di production (set ALLOW_SEED=1 kalau benar-benar yakin).");
  process.exit(1);
}

const STORAGE_ROOT = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR || ".local/storage");
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const ago = (days: number, hours = 0) => new Date(now - days * DAY - hours * 60 * 60 * 1000);

let rngState = 20260927;
function rand() {
  // PRNG deterministik supaya data demo konsisten tiap seed
  rngState = (rngState * 1664525 + 1013904223) % 4294967296;
  return rngState / 4294967296;
}

async function put(key: string, data: Buffer) {
  const full = path.join(STORAGE_ROOT, key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const shortId = () => Math.floor(rand() * 0xffffffff).toString(16).padStart(8, "0");

// ─── Data demo ───────────────────────────────────────────────────────────────
type FileSpec = { platform: string; kind: "apk" | "zip" | "pdf"; name: string; mb: number; reuseFrom?: string };
type ReleaseSpec = { version: string; daysAgo: number; changelog: string; status?: "published" | "review"; files: FileSpec[] };
type ProductSpec = {
  key: string;
  seller: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  categoryLabel: string;
  platforms: string[];
  tags: string[];
  license: string;
  pricing?: "free" | "fixed" | "pwyw";
  price?: number;
  minPrice?: number;
  colors: [string, string];
  visual: Visual;
  screens: ScreenSpec[];
  releases: ReleaseSpec[];
  android?: { pkg: string; registration: "registered" | "not_registered"; checked?: boolean };
  status?: "published" | "review" | "draft";
  featured?: boolean;
  downloads?: number;
  createdDaysAgo: number;
  heat: number; // 0..1 → aktivitas unduhan 7 hari terakhir (untuk trending)
  websiteUrl?: string;
};

const SELLERS = [
  { username: "nusantaralabs", email: "seller@rilisin.test", displayName: "Nusantara Labs", store: "Nusantara Labs", tagline: "Aplikasi sederhana untuk UMKM Indonesia", bio: "Tim kecil dari Yogyakarta yang bikin aplikasi offline-first untuk warung, toko, dan sekolah.", daysAgo: 120 },
  { username: "pixelrantau", email: "pixelrantau@rilisin.test", displayName: "Pixel Rantau", store: "Pixel Rantau Studio", tagline: "Game indie bertema budaya Nusantara", bio: "Studio game indie dua orang dari Padang. Suka cerita rakyat dan pixel art.", daysAgo: 100, trusted: true },
  { username: "dapurkode", email: "dapurkode@rilisin.test", displayName: "Dapur Kode", store: "Dapur Kode", tagline: "Source code & template siap pakai, dokumentasi Bahasa Indonesia", bio: "Berbagi starter kit dan template supaya developer pemula cepat rilis.", daysAgo: 95 },
  { username: "rintisdesain", email: "rintisdesain@rilisin.test", displayName: "Rintis Desain", store: "Rintis Desain", tagline: "UI kit & aset desain lokal", bio: "Desainer UI/UX dari Bandung. Aset desain dengan nuansa Indonesia.", daysAgo: 80 },
  { username: "bukuterbuka", email: "bukuterbuka@rilisin.test", displayName: "Buku Terbuka", store: "Buku Terbuka", tagline: "E-book teknologi berbahasa Indonesia", bio: "Menulis panduan praktis seputar pengembangan aplikasi, dari nol sampai rilis.", daysAgo: 70 },
  { username: "apkgratis123", email: "apkgratis123@contoh.test", displayName: "APK Gratis", store: "APK Premium Gratis", tagline: "Semua aplikasi premium gratis!!!", bio: null, daysAgo: 2 },
];

const PRODUCTS: ProductSpec[] = [
  {
    key: "kasirku",
    seller: "nusantaralabs",
    title: "KasirKu Offline",
    summary: "Aplikasi kasir untuk warung & toko kecil — jalan tanpa internet, stok otomatis, struk Bluetooth.",
    description: `**KasirKu** adalah aplikasi kasir (POS) yang **jalan tanpa internet** — cocok untuk warung, kedai kopi, dan toko kelontong.

## Fitur utama
- Catat penjualan cepat dengan pencarian barang & scan barcode pakai kamera
- Stok otomatis berkurang setiap transaksi, ada peringatan stok menipis
- Cetak struk ke printer Bluetooth 58 mm atau bagikan struk ke WhatsApp
- Laporan harian/bulanan: omzet, laba kotor, barang terlaris
- Backup ke file dan pulihkan di HP baru

## Kenapa offline?
Data tersimpan di perangkat kamu sendiri, jadi tetap bisa jualan walau sinyal hilang. Versi Windows cocok untuk kasir di meja.

## Persyaratan
| Platform | Minimal |
|---|---|
| Android | 8.0 (Oreo) |
| Windows | 10 64-bit |

Ada saran fitur? Tulis di kolom komunitas (segera hadir).`,
    category: "aplikasi",
    categoryLabel: "Aplikasi",
    platforms: ["android", "windows"],
    tags: ["kasir", "umkm", "offline", "pos", "stok"],
    license: "Gratis dipakai (hak cipta pembuat)",
    colors: ["#6d5dfc", "#3b2bb8"],
    visual: "phone",
    screens: [
      { title: "Kasir", subtitle: "Transaksi hari ini", stats: [["Omzet", "Rp1,2 jt"], ["Transaksi", "48"]], items: ["Kopi Susu Gula Aren", "Indomie Goreng", "Teh Botol 350ml", "Roti Bakar Coklat", "Air Mineral 600ml"] },
      { title: "Laporan", subtitle: "September 2026", stats: [["Laba kotor", "Rp8,4 jt"], ["Terlaris", "Kopi"]], items: ["Minggu 1 - Rp6,1 jt", "Minggu 2 - Rp7,3 jt", "Minggu 3 - Rp6,8 jt", "Minggu 4 - Rp8,0 jt", "Ekspor ke Excel"] },
      { title: "Stok Barang", subtitle: "124 barang", items: ["Gula Pasir 1kg - 12", "Minyak Goreng 2L - 3", "Beras 5kg - 8", "Telur (butir) - 90", "Kopi Bubuk 250g - 15", "Susu Kental - 20", "Mie Instan - 64"] },
      { title: "Struk", subtitle: "Printer 58mm terhubung", items: ["Toko Berkah Jaya", "2x Kopi Susu  Rp36.000", "1x Roti Bakar  Rp15.000", "Total  Rp51.000", "Terima kasih!"] },
    ],
    releases: [
      { version: "1.0.0", daysAgo: 80, changelog: "- Rilis pertama: kasir, stok, laporan harian", files: [{ platform: "android", kind: "apk", name: "kasirku-1.0.0.apk", mb: 0.3 }] },
      { version: "1.2.0", daysAgo: 45, changelog: "- Scan barcode pakai kamera\n- Struk bisa dibagikan ke WhatsApp", files: [{ platform: "android", kind: "apk", name: "kasirku-1.2.0.apk", mb: 0.3 }] },
      { version: "2.0.0", daysAgo: 12, changelog: "- **Baru:** versi Windows (portable)\n- Laporan bulanan & barang terlaris\n- Backup/pulihkan data", files: [{ platform: "android", kind: "apk", name: "kasirku-2.0.0.apk", mb: 3.2 }, { platform: "windows", kind: "zip", name: "KasirKu-2.0.0-windows-portable.zip", mb: 4.1 }] },
      { version: "2.1.0", daysAgo: 0.2, status: "review", changelog: "- Multi kasir (shift)\n- Diskon per barang\n- Perbaikan printer Bluetooth tertentu", files: [{ platform: "android", kind: "apk", name: "kasirku-2.1.0.apk", mb: 3.3 }, { platform: "windows", kind: "zip", name: "KasirKu-2.1.0-windows-portable.zip", mb: 4.2 }] },
    ],
    android: { pkg: "id.nusantaralabs.kasirku", registration: "registered", checked: true },
    featured: true,
    downloads: 12840,
    createdDaysAgo: 82,
    heat: 0.8,
  },
  {
    key: "kasirkupro",
    seller: "nusantaralabs",
    title: "KasirKu Pro",
    summary: "Versi Pro KasirKu: multi kasir & shift, laporan laba per barang, ekspor Excel, dan backup otomatis.",
    description: `**KasirKu Pro** untuk toko yang sudah ramai: beberapa kasir, shift, dan laporan lebih dalam.

## Tambahan dibanding versi gratis
- Multi kasir + shift (buka/tutup kas, selisih kas otomatis)
- Laporan laba per barang & per kategori
- Ekspor laporan ke Excel / CSV
- Backup otomatis terjadwal ke penyimpanan HP
- Dukungan prioritas lewat chat

Sekali bayar, **update gratis selamanya** untuk versi 3.x.`,
    category: "aplikasi",
    categoryLabel: "Aplikasi",
    platforms: ["android", "windows"],
    tags: ["kasir", "umkm", "pos", "laporan", "pro"],
    license: "Lisensi komersial (1 toko)",
    pricing: "fixed",
    price: 49_000,
    colors: ["#0f766e", "#134e4a"],
    visual: "phone",
    screens: [
      { title: "Shift Kasir", subtitle: "Shift pagi · Rina", stats: [["Kas awal", "Rp500rb"], ["Selisih", "Rp0"]], items: ["Buka shift 07:00", "Transaksi 64", "Tunai Rp1,8 jt", "QRIS Rp940rb", "Tutup shift 15:00"] },
      { title: "Laba per Barang", subtitle: "September 2026", stats: [["Laba", "Rp9,1 jt"], ["Margin", "31%"]], items: ["Kopi Susu - Rp2,4 jt", "Roti Bakar - Rp1,1 jt", "Mie Instan - Rp860rb", "Teh Botol - Rp540rb", "Ekspor ke Excel"] },
      { title: "Backup Otomatis", subtitle: "Setiap hari 23:00", items: ["Backup terakhir: kemarin 23:00", "Ukuran 2,4 MB", "Simpan 14 cadangan", "Pulihkan dari file"] },
    ],
    releases: [
      { version: "3.0.0", daysAgo: 40, changelog: "- Rilis pertama KasirKu Pro", files: [{ platform: "android", kind: "apk", name: "kasirku-pro-3.0.0.apk", mb: 3.6 }] },
      { version: "3.1.0", daysAgo: 10, changelog: "- Laba per kategori\n- Ekspor CSV\n- Perbaikan shift lintas hari", files: [{ platform: "android", kind: "apk", name: "kasirku-pro-3.1.0.apk", mb: 3.7 }, { platform: "windows", kind: "zip", name: "KasirKuPro-3.1.0-windows.zip", mb: 4.6 }] },
    ],
    android: { pkg: "id.nusantaralabs.kasirku.pro", registration: "registered", checked: true },
    downloads: 214,
    createdDaysAgo: 42,
    heat: 0.4,
  },
  {
    key: "catatduit",
    seller: "nusantaralabs",
    title: "Catat Duit",
    summary: "Pencatat keuangan pribadi yang simpel: pemasukan, pengeluaran, dan target tabungan.",
    description: `Catat pemasukan dan pengeluaran dalam 3 ketukan. Tanpa iklan, tanpa login, data tetap di HP kamu.

## Fitur
- Kategori pengeluaran yang bisa diatur sendiri
- Grafik bulanan & ringkasan per kategori
- Target tabungan dengan progress bar
- Pengingat harian untuk mencatat
- Ekspor CSV

> Developer belum terdaftar di program verifikasi Google, jadi instalnya butuh mode lanjutan. Lihat panduan Android.`,
    category: "aplikasi",
    categoryLabel: "Aplikasi",
    platforms: ["android"],
    tags: ["keuangan", "tabungan", "budget"],
    license: "Gratis dipakai (hak cipta pembuat)",
    colors: ["#10b981", "#047857"],
    visual: "phone",
    screens: [
      { title: "Catat Duit", subtitle: "Saldo bulan ini", stats: [["Masuk", "Rp5,5 jt"], ["Keluar", "Rp3,9 jt"]], items: ["Makan siang - Rp25.000", "Bensin - Rp40.000", "Gaji - Rp5.500.000", "Pulsa - Rp50.000", "Kopi - Rp18.000"] },
      { title: "Target", subtitle: "Tabungan", items: ["Dana darurat 62%", "Laptop baru 35%", "Mudik 2027 18%", "Liburan 10%"] },
      { title: "Grafik", subtitle: "Per kategori", stats: [["Terbesar", "Makan"], ["Hemat", "12%"]], items: ["Makan & minum 38%", "Transportasi 21%", "Tagihan 19%", "Hiburan 12%", "Lainnya 10%"] },
    ],
    releases: [
      { version: "1.0.0", daysAgo: 60, changelog: "- Rilis pertama", files: [{ platform: "android", kind: "apk", name: "catat-duit-1.0.0.apk", mb: 0.3 }] },
      { version: "1.1.0", daysAgo: 20, changelog: "- Target tabungan\n- Ekspor CSV\n- Mode gelap", files: [{ platform: "android", kind: "apk", name: "catat-duit-1.1.0.apk", mb: 2.1 }] },
    ],
    android: { pkg: "id.nusantaralabs.catatduit", registration: "not_registered" },
    downloads: 5210,
    createdDaysAgo: 62,
    heat: 0.45,
  },
  {
    key: "resep",
    seller: "nusantaralabs",
    title: "Resep Nusantara Offline",
    summary: "500+ resep masakan daerah yang bisa dibuka tanpa internet, lengkap dengan daftar belanja.",
    description: `Kumpulan resep masakan dari Sabang sampai Merauke yang bisa dibuka **tanpa internet**.

## Fitur
- 500+ resep dengan foto & langkah bergambar
- Cari berdasarkan bahan yang ada di kulkas
- Daftar belanja otomatis
- Timer masak`,
    category: "aplikasi",
    categoryLabel: "Aplikasi",
    platforms: ["android"],
    tags: ["resep", "masakan", "kuliner"],
    license: "Gratis dipakai (hak cipta pembuat)",
    colors: ["#f97316", "#9a3412"],
    visual: "phone",
    screens: [
      { title: "Resep", subtitle: "Mau masak apa hari ini?", items: ["Rendang Padang", "Soto Lamongan", "Gudeg Jogja", "Coto Makassar", "Papeda Kuah Kuning", "Pempek Palembang", "Rawon Surabaya"] },
      { title: "Daftar Belanja", subtitle: "7 bahan", items: ["Daging sapi 1kg", "Santan 2 bungkus", "Cabai merah 250g", "Lengkuas", "Serai 3 batang"] },
    ],
    releases: [{ version: "1.0.0", daysAgo: 1, status: "review", changelog: "- Rilis pertama", files: [{ platform: "android", kind: "apk", name: "resep-nusantara-1.0.0.apk", mb: 2.8 }] }],
    android: { pkg: "id.nusantaralabs.resep", registration: "registered" },
    status: "review",
    createdDaysAgo: 3,
    heat: 0,
  },
  {
    key: "absensi",
    seller: "nusantaralabs",
    title: "Absensi Sekolah Lite",
    summary: "Absensi siswa berbasis QR untuk sekolah kecil, bisa dipakai di laptop guru.",
    description: "Draft — deskripsi lengkap menyusul.",
    category: "aplikasi",
    categoryLabel: "Aplikasi",
    platforms: ["web", "windows"],
    tags: ["sekolah", "absensi"],
    license: "Gratis dipakai (hak cipta pembuat)",
    colors: ["#0ea5e9", "#1e40af"],
    visual: "browser",
    screens: [],
    releases: [],
    status: "draft",
    createdDaysAgo: 1,
    heat: 0,
  },
  {
    key: "kancil",
    seller: "pixelrantau",
    title: "Petualangan Si Kancil",
    summary: "Game platformer pixel art: bantu Kancil menyeberangi sungai buaya dan mengecoh Pak Tani.",
    description: `Game platformer 2D bergaya pixel art yang terinspirasi cerita rakyat **Si Kancil**.

## Fitur
- 30 level di 3 dunia: Hutan, Sungai Buaya, dan Kebun Pak Tani
- Kontrol sederhana, cocok untuk anak-anak & dewasa
- Musik gamelan modern
- Bisa dimainkan offline, tanpa iklan

## Kontrol (Windows)
- Panah kiri/kanan: jalan
- Spasi: lompat
- Z: kecoh musuh`,
    category: "game",
    categoryLabel: "Game",
    platforms: ["android", "windows"],
    tags: ["platformer", "pixel-art", "cerita-rakyat", "anak"],
    license: "Gratis dipakai (hak cipta pembuat)",
    colors: ["#f59e0b", "#15803d"],
    visual: "game",
    screens: [
      { title: "Dunia 1: Hutan", subtitle: "Skor 12.400", items: [] },
      { title: "Sungai Buaya", subtitle: "Skor 28.150", items: [] },
      { title: "Kebun Pak Tani", subtitle: "Skor 41.900", items: [] },
    ],
    releases: [
      { version: "1.0.0", daysAgo: 70, changelog: "- Rilis pertama: 20 level", files: [{ platform: "android", kind: "apk", name: "si-kancil-1.0.0.apk", mb: 0.4 }] },
      { version: "1.2.0", daysAgo: 30, changelog: "- Versi Windows\n- 5 level baru", files: [{ platform: "android", kind: "apk", name: "si-kancil-1.2.0.apk", mb: 0.4 }, { platform: "windows", kind: "zip", name: "si-kancil-1.2.0-windows.zip", mb: 0.4 }] },
      { version: "1.3.0", daysAgo: 2, changelog: "- **Dunia baru:** Kebun Pak Tani (5 level)\n- Simpan progres ke file\n- Perbaikan lompatan yang kadang tembus tanah", files: [{ platform: "android", kind: "apk", name: "si-kancil-1.3.0.apk", mb: 4.6 }, { platform: "windows", kind: "zip", name: "si-kancil-1.3.0-windows.zip", mb: 5.2 }] },
    ],
    android: { pkg: "id.pixelrantau.sikancil", registration: "registered", checked: true },
    featured: true,
    downloads: 8930,
    createdDaysAgo: 72,
    heat: 0.95,
  },
  {
    key: "becak",
    seller: "pixelrantau",
    title: "Balap Becak Nusantara",
    summary: "Game balap santai keliling kota-kota Indonesia pakai becak. Early access!",
    description: `Balapan becak di jalanan Jakarta, Yogyakarta, dan Medan. Hindari lubang, jemput penumpang, kumpulkan koin!

**Status: early access** — masih ada bug, masukan kamu sangat berarti.`,
    category: "game",
    categoryLabel: "Game",
    platforms: ["android"],
    tags: ["balap", "casual", "early-access"],
    license: "Gratis dipakai (hak cipta pembuat)",
    colors: ["#ef4444", "#7c2d12"],
    visual: "game",
    screens: [
      { title: "Jakarta", subtitle: "Koin 1.250", items: [] },
      { title: "Malioboro", subtitle: "Koin 3.480", items: [] },
    ],
    releases: [{ version: "0.9.0", daysAgo: 25, changelog: "- Early access: 2 kota, 6 becak", files: [{ platform: "android", kind: "apk", name: "balap-becak-0.9.0.apk", mb: 3.6 }] }],
    android: { pkg: "id.pixelrantau.balapbecak", registration: "not_registered" },
    downloads: 3120,
    createdDaysAgo: 26,
    heat: 0.5,
  },
  {
    key: "tebakkata",
    seller: "pixelrantau",
    pricing: "pwyw",
    price: 10_000,
    minPrice: 0,
    title: "Tebak Kata Daerah",
    summary: "Tebak arti kata dari bahasa daerah se-Indonesia. Main di browser atau Android.",
    description: `Seberapa kenal kamu dengan bahasa daerah? Tebak arti kata dari bahasa Jawa, Sunda, Minang, Batak, Bugis, dan lainnya.

- Mode harian (satu kata per hari, seperti Wordle)
- Mode tantangan 60 detik
- Bagikan skor ke teman`,
    category: "game",
    categoryLabel: "Game",
    platforms: ["web", "android"],
    tags: ["kata", "edukasi", "bahasa-daerah"],
    license: "Gratis dipakai (hak cipta pembuat)",
    colors: ["#06b6d4", "#155e75"],
    visual: "phone",
    screens: [
      { title: "Tebak Kata", subtitle: "Kata harian #214", stats: [["Streak", "12 hari"], ["Menang", "87%"]], items: ["\"Matur nuwun\" (Jawa)", "\"Hatur nuhun\" (Sunda)", "\"Tarimo kasih\" (Minang)", "\"Mauliate\" (Batak)", "\"Terima kasih\" = ?"] },
      { title: "Tantangan", subtitle: "Sisa 00:42", items: ["Lamo = ?", "Awak = ?", "Sae = ?", "Horas = ?", "Nggih = ?"] },
    ],
    releases: [{ version: "1.0.0", daysAgo: 15, changelog: "- Rilis pertama: 1.200 kata dari 12 bahasa daerah", files: [{ platform: "android", kind: "apk", name: "tebak-kata-daerah-1.0.0.apk", mb: 1.9 }, { platform: "web", kind: "zip", name: "tebak-kata-daerah-web-1.0.0.zip", mb: 1.1 }] }],
    android: { pkg: "id.pixelrantau.tebakkata", registration: "registered" },
    downloads: 1980,
    createdDaysAgo: 16,
    heat: 0.35,
  },
  {
    key: "starterkit",
    seller: "dapurkode",
    title: "Starter Kit Next.js Bahasa Indonesia",
    summary: "Boilerplate Next.js + auth + database + Tailwind dengan komentar & dokumentasi Bahasa Indonesia.",
    description: `Mulai project web tanpa bingung setup. Semua kode diberi **komentar Bahasa Indonesia**.

## Isi
- Next.js App Router + TypeScript
- Login email/password + session aman
- Drizzle ORM + PostgreSQL
- Tailwind CSS, komponen form, tabel, dan dashboard
- Contoh CRUD lengkap

## Cara pakai
\`\`\`bash
npm install
cp .env.example .env.local
npm run dev
\`\`\``,
    category: "source-code",
    categoryLabel: "Source Code",
    platforms: ["web"],
    tags: ["nextjs", "typescript", "boilerplate", "tailwind"],
    license: "MIT",
    colors: ["#334155", "#0f172a"],
    visual: "browser",
    screens: [
      { title: "Dashboard", subtitle: "Contoh halaman admin", stats: [["Pengguna", "1.284"], ["Aktif", "342"], ["Baru", "57"]], items: ["Budi Santoso", "Siti Aminah", "Andi Wijaya", "Dewi Lestari", "Rudi Hartono", "Putri Ayu"] },
      { title: "Produk", subtitle: "Contoh CRUD", stats: [["Total", "96"], ["Draft", "12"], ["Arsip", "4"]], items: ["Kaos Batik", "Tas Rotan", "Kopi Gayo", "Sambal Roa", "Keripik Tempe", "Madu Hutan"] },
    ],
    releases: [
      { version: "1.0.0", daysAgo: 40, changelog: "- Rilis pertama", files: [{ platform: "web", kind: "zip", name: "starter-nextjs-id-1.0.0.zip", mb: 0.3 }] },
      { version: "1.1.0", daysAgo: 8, changelog: "- Upgrade ke Next.js 16\n- Contoh upload file\n- Dokumentasi deploy", files: [{ platform: "web", kind: "zip", name: "starter-nextjs-id-1.1.0.zip", mb: 1.4 }] },
    ],
    downloads: 4410,
    createdDaysAgo: 42,
    heat: 0.6,
  },
  {
    key: "landingumkm",
    seller: "dapurkode",
    title: "Template Landing UMKM",
    summary: "Template landing page responsif untuk UMKM: katalog, testimoni, tombol WhatsApp. HTML + Tailwind.",
    description: `Template landing page siap pakai untuk usaha kecil — tinggal ganti teks dan foto.

- 5 pilihan warna
- Bagian katalog produk, testimoni, FAQ, lokasi (Google Maps)
- Tombol chat WhatsApp mengambang
- Skor Lighthouse 95+
- Tanpa framework berat: HTML + Tailwind CDN`,
    category: "template",
    categoryLabel: "Template & UI Kit",
    platforms: ["web"],
    tags: ["landing-page", "umkm", "html", "tailwind"],
    license: "CC BY 4.0",
    colors: ["#ec4899", "#831843"],
    visual: "browser",
    screens: [
      { title: "Kopi Senja", subtitle: "Contoh: kedai kopi", stats: [["Menu", "24"], ["Cabang", "3"], ["Rating", "4,9"]], items: ["Es Kopi Susu", "Americano", "Kopi Tubruk", "Matcha Latte", "Roti Bakar", "Pisang Goreng"] },
      { title: "Batik Laras", subtitle: "Contoh: toko batik", stats: [["Koleksi", "120"], ["Pembeli", "2rb+"], ["Kota", "34"]], items: ["Batik Parang", "Batik Kawung", "Batik Mega Mendung", "Batik Truntum", "Batik Sekar Jagad", "Batik Lasem"] },
    ],
    releases: [{ version: "1.0.0", daysAgo: 35, changelog: "- Rilis pertama: 3 contoh usaha", files: [{ platform: "web", kind: "zip", name: "template-landing-umkm-1.0.0.zip", mb: 2.4 }] }],
    downloads: 6120,
    createdDaysAgo: 36,
    heat: 0.55,
  },
  {
    key: "laravelpos",
    seller: "dapurkode",
    title: "Laravel Kasir POS Starter",
    summary: "Source code aplikasi kasir web (Laravel 12 + Livewire) siap dikembangkan untuk klien.",
    description: `Source code lengkap aplikasi kasir berbasis web untuk dijual ulang ke klien (lisensi komersial, 1 lisensi = project tanpa batas untuk klien kamu).

## Fitur
- Multi outlet & multi kasir
- Manajemen stok, supplier, pembelian
- Laporan laba rugi sederhana
- Cetak struk thermal
- Dokumentasi instalasi Bahasa Indonesia`,
    category: "source-code",
    categoryLabel: "Source Code",
    platforms: ["web"],
    tags: ["laravel", "php", "kasir", "livewire"],
    license: "Lisensi Komersial",
    pricing: "fixed",
    price: 149000,
    colors: ["#f43f5e", "#881337"],
    visual: "browser",
    screens: [
      { title: "Penjualan", subtitle: "Outlet Kemang", stats: [["Hari ini", "Rp4,8 jt"], ["Struk", "132"], ["Rata-rata", "Rp36rb"]], items: ["INV-0921 Rp48.000", "INV-0920 Rp15.500", "INV-0919 Rp122.000", "INV-0918 Rp36.000", "INV-0917 Rp9.000", "INV-0916 Rp64.000"] },
      { title: "Stok", subtitle: "Semua outlet", stats: [["SKU", "842"], ["Menipis", "17"], ["Habis", "3"]], items: ["Gula 1kg", "Kopi 250g", "Susu UHT", "Teh Celup", "Sirup 460ml", "Cup 16oz"] },
    ],
    releases: [{ version: "1.0.0", daysAgo: 18, changelog: "- Rilis pertama", files: [{ platform: "web", kind: "zip", name: "laravel-kasir-pos-1.0.0.zip", mb: 3.1 }] }],
    downloads: 214,
    createdDaysAgo: 19,
    heat: 0.1,
  },
  {
    key: "uikitojol",
    seller: "rintisdesain",
    title: "UI Kit Ojek Online",
    summary: "120+ layar UI aplikasi ojol (penumpang, driver, merchant) untuk Figma. Siap diadaptasi.",
    description: `UI kit lengkap untuk aplikasi transportasi & pesan-antar makanan.

## Isi
- 120+ layar: penumpang, driver, dan merchant
- Komponen dengan auto layout & varian
- Design token warna/tipografi
- Ilustrasi & ikon khusus
- Format: Figma (file .fig di dalam ZIP)

Lisensi komersial: boleh dipakai untuk project klien, tidak boleh dijual ulang sebagai UI kit.`,
    category: "template",
    categoryLabel: "Template & UI Kit",
    platforms: ["universal"],
    tags: ["figma", "ui-kit", "mobile", "ojol"],
    license: "Lisensi Komersial",
    pricing: "fixed",
    price: 79000,
    colors: ["#22c55e", "#14532d"],
    visual: "phone",
    screens: [
      { title: "Mau ke mana?", subtitle: "Jl. Malioboro No. 12", items: ["Rumah", "Kantor", "Stasiun Tugu", "Bandara YIA", "Pasar Beringharjo"] },
      { title: "Pesan Makan", subtitle: "Promo hari ini", stats: [["Diskon", "40%"], ["Ongkir", "Rp0"]], items: ["Gudeg Yu Djum", "Sate Klathak Pak Pong", "Bakmi Jawa Mbah Gito", "Es Teh Jumbo", "Mie Ayam Tumini"] },
      { title: "Driver", subtitle: "Pendapatan hari ini", stats: [["Order", "18"], ["Pendapatan", "Rp312rb"]], items: ["Antar - 4,2 km", "Makanan - 2,1 km", "Kirim barang - 7,8 km", "Antar - 3,3 km", "Makanan - 1,4 km"] },
    ],
    releases: [{ version: "1.0.0", daysAgo: 28, changelog: "- Rilis pertama: 120 layar", files: [{ platform: "universal", kind: "zip", name: "ui-kit-ojol-figma-1.0.0.zip", mb: 5.4 }] }],
    featured: true,
    downloads: 530,
    createdDaysAgo: 29,
    heat: 0.2,
  },
  {
    key: "ikonkuliner",
    seller: "rintisdesain",
    title: "Ikon Kuliner Nusantara",
    summary: "120+ ikon makanan & minuman khas Indonesia dalam SVG dan PNG. Gratis dengan atribusi.",
    description: `Set ikon bergaya flat untuk makanan dan minuman khas Indonesia.

- 120+ ikon (rendang, sate, bakso, es cendol, dan lainnya)
- Format SVG + PNG (64, 128, 512 px)
- Warna bisa diubah
- **Gratis** — cukup cantumkan atribusi "Ikon oleh Rintis Desain"`,
    category: "aset",
    categoryLabel: "Aset Desain",
    platforms: ["universal"],
    tags: ["ikon", "svg", "kuliner", "flat"],
    license: "CC BY 4.0",
    colors: ["#f97316", "#b91c1c"],
    visual: "grid",
    screens: [
      { title: "Ikon Kuliner Nusantara", subtitle: "Makanan berat", items: ["Rendang", "Sate", "Bakso", "Nasi Goreng", "Gado-gado", "Soto", "Rawon", "Pempek", "Gudeg", "Coto", "Papeda", "Ayam Betutu"] },
      { title: "Ikon Kuliner Nusantara", subtitle: "Minuman & jajanan", items: ["Es Cendol", "Es Teler", "Wedang Jahe", "Bajigur", "Klepon", "Martabak", "Serabi", "Onde-onde", "Kerak Telor", "Lemper", "Dodol", "Es Dawet"] },
    ],
    releases: [
      { version: "1.0.0", daysAgo: 50, changelog: "- 80 ikon", files: [{ platform: "universal", kind: "zip", name: "ikon-kuliner-nusantara-1.0.0.zip", mb: 0.3 }] },
      { version: "1.1.0", daysAgo: 10, changelog: "- 40 ikon minuman & jajanan pasar", files: [{ platform: "universal", kind: "zip", name: "ikon-kuliner-nusantara-1.1.0.zip", mb: 2.2 }] },
    ],
    downloads: 2750,
    createdDaysAgo: 51,
    heat: 0.4,
  },
  {
    key: "ebookandroid",
    seller: "bukuterbuka",
    title: "E-book Panduan Rilis Aplikasi Android 2026",
    summary: "Panduan praktis merilis aplikasi Android di 2026: verifikasi developer, signing, sampai distribusi.",
    description: `E-book gratis yang membahas langkah merilis aplikasi Android di tahun 2026 — termasuk **aturan verifikasi developer** yang berlaku di Indonesia mulai 30 September 2026.

## Daftar isi
1. Menyiapkan build rilis & signing key
2. Verifikasi developer: siapa yang wajib, dan caranya
3. Distribusi di luar Play Store (website, toko alternatif)
4. Update aplikasi tanpa bikin pengguna bingung
5. Checklist sebelum rilis

Format PDF, 1 halaman contoh (versi demo).`,
    category: "ebook",
    categoryLabel: "E-book & Materi",
    platforms: ["universal"],
    tags: ["android", "rilis", "panduan", "2026"],
    license: "CC BY-NC 4.0",
    colors: ["#8b5cf6", "#4c1d95"],
    visual: "book",
    screens: [
      { title: "Verifikasi Developer Android", subtitle: "Bab 2", items: ["Siapa yang wajib mendaftar", "Akun distribusi terbatas", "Mendaftarkan nama paket", "Kalau pengguna belum bisa instal", "Tips untuk tim kecil"] },
      { title: "Menyiapkan Build Rilis", subtitle: "Bab 1", items: ["./gradlew bundleRelease", "keytool -genkey -v \\", "  -keystore rilis.jks \\", "  -alias kunci-rilis", "apksigner verify app.apk", "# simpan keystore baik-baik!", ""] },
    ],
    releases: [{ version: "1.0", daysAgo: 21, changelog: "- Edisi pertama", files: [{ platform: "universal", kind: "pdf", name: "panduan-rilis-android-2026.pdf", mb: 0 }] }],
    downloads: 3890,
    createdDaysAgo: 22,
    heat: 0.7,
  },
  {
    key: "flutter",
    seller: "bukuterbuka",
    title: "Belajar Flutter dari Nol",
    summary: "E-book 300+ halaman: dari instalasi sampai rilis aplikasi Flutter pertamamu, full Bahasa Indonesia.",
    description: `Belajar Flutter step by step sambil membuat 3 aplikasi nyata: to-do list, aplikasi cuaca, dan toko online sederhana.

- 300+ halaman, 24 bab
- Source code tiap bab
- Update gratis untuk versi Flutter berikutnya`,
    category: "ebook",
    categoryLabel: "E-book & Materi",
    platforms: ["universal"],
    tags: ["flutter", "dart", "mobile", "belajar"],
    license: "Lisensi Personal",
    pricing: "fixed",
    price: 49000,
    colors: ["#0ea5e9", "#1e3a8a"],
    visual: "book",
    screens: [
      { title: "Widget Pertamamu", subtitle: "Bab 3", items: ["Apa itu widget?", "Stateless vs Stateful", "Hot reload", "Layout: Row & Column", "Latihan"] },
      { title: "Mengambil Data dari API", subtitle: "Bab 11", items: ["final res = await http.get(", "  Uri.parse(url),", ");", "if (res.statusCode == 200) {", "  return Cuaca.fromJson(", "    jsonDecode(res.body));", "}"] },
    ],
    releases: [{ version: "1.0", daysAgo: 33, changelog: "- Edisi pertama (Flutter 3.35)", files: [{ platform: "universal", kind: "pdf", name: "belajar-flutter-dari-nol.pdf", mb: 0 }] }],
    downloads: 410,
    createdDaysAgo: 34,
    heat: 0.15,
  },
  {
    key: "apkpremium",
    seller: "apkgratis123",
    title: "Kumpulan APK Premium Gratis",
    summary: "Download aplikasi premium versi MOD gratis!!! Unlock semua fitur, no iklan.",
    description: `SEMUA APLIKASI PREMIUM GRATIS!!!

- Spotify Premium MOD
- Netflix MOD unlock
- Game MOD unlimited coin
- Dan masih banyak lagi

Download sekarang sebelum dihapus!!!`,
    category: "aplikasi",
    categoryLabel: "Aplikasi",
    platforms: ["android"],
    tags: ["mod", "premium", "gratis"],
    license: "Gratis dipakai (hak cipta pembuat)",
    colors: ["#facc15", "#dc2626"],
    visual: "phone",
    screens: [{ title: "APK MOD", subtitle: "Semua gratis!!!", items: ["Musik Premium MOD", "Film Premium MOD", "Game Coin MOD", "Editor Pro MOD", "VPN Premium MOD"] }],
    releases: [{ version: "1.0", daysAgo: 0.4, status: "review", changelog: "update terbaru", files: [{ platform: "android", kind: "apk", name: "apk-premium-pack.apk", mb: 0, reuseFrom: "kasirku-2.0.0.apk" }] }],
    android: { pkg: "com.premium.gratis.mod", registration: "registered" },
    status: "review",
    createdDaysAgo: 0.5,
    heat: 0,
  },
];

const POOL_NAMES = [
  "Andi Saputra", "Siti Rahma", "Budi Hartono", "Dewi Anggraini", "Rizky Pratama", "Nur Aisyah", "Fajar Nugroho", "Putri Maharani",
  "Agus Setiawan", "Indah Permata", "Yoga Aditya", "Ratna Sari", "Hendra Wijaya", "Maya Kartika", "Dimas Prakoso", "Ayu Lestari",
  "Bayu Firmansyah", "Citra Dewanti", "Eko Susanto", "Fitri Handayani", "Galih Ramadhan", "Hana Safitri", "Irfan Hakim", "Joko Purnomo",
  "Kartika Sari", "Lukman Hidayat", "Mega Puspita", "Nanda Kurniawan", "Oki Setiana", "Rina Wulandari",
];

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });
  const t0 = Date.now();

  console.log("» Reset database…");
  // Pengaman: seed MENGHAPUS seluruh isi database. Tolak database non-lokal (Neon/Supabase/production)
  // kecuali benar-benar disengaja lewat SEED_ALLOW_REMOTE=hapus-semua-data.
  const dbHost = new URL(process.env.DATABASE_URL!).hostname;
  if (!["localhost", "127.0.0.1", "::1", "postgres"].includes(dbHost) && process.env.SEED_ALLOW_REMOTE !== "hapus-semua-data") {
    console.error(`✗ Seed ditolak: DATABASE_URL mengarah ke "${dbHost}" (bukan database lokal). Seed akan MENGHAPUS SEMUA DATA.`);
    console.error("  Kalau memang sengaja (mis. database staging kosong): SEED_ALLOW_REMOTE=hapus-semua-data npx tsx scripts/seed.ts");
    process.exit(1);
  }
  await client.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await migrate(db, { migrationsFolder: "drizzle" });

  console.log("» Reset storage lokal…");
  await fs.rm(STORAGE_ROOT, { recursive: true, force: true });
  await fs.mkdir(STORAGE_ROOT, { recursive: true });

  const passwordHash = await hashPassword("rilisin123");

  // Akun inti
  const [admin] = await db
    .insert(schema.users)
    .values({ email: "admin@rilisin.test", username: "tim_rilisin", displayName: "Tim Rilisin", role: "admin", passwordHash, createdAt: ago(130) })
    .returning();
  const [demoUser] = await db
    .insert(schema.users)
    .values({ email: "user@rilisin.test", username: "rina", displayName: "Rina Pratiwi", passwordHash, createdAt: ago(40), bio: "Pemilik warung kopi kecil di Bekasi, suka coba aplikasi baru." })
    .returning();

  const sellerIds = new Map<string, string>();
  for (const s of SELLERS) {
    const [u] = await db
      .insert(schema.users)
      .values({ email: s.email, username: s.username, displayName: s.displayName, passwordHash, createdAt: ago(s.daysAgo), bio: s.bio })
      .returning();
    await db.insert(schema.sellerProfiles).values({
      userId: u!.id,
      storeName: s.store,
      tagline: s.tagline,
      isTrusted: Boolean(s.trusted),
      activatedAt: ago(s.daysAgo - 1),
    });
    sellerIds.set(s.username, u!.id);
  }

  const userIds = new Map<string, string>([["tim_rilisin", admin!.id], ["rina", demoUser!.id], ...sellerIds]);
  const pool = [];
  for (const [i, name] of POOL_NAMES.entries()) {
    const username = `${name.split(" ")[0]!.toLowerCase()}${10 + i}`;
    const [u] = await db
      .insert(schema.users)
      .values({
        email: `${username}@contoh.test`,
        username,
        displayName: name,
        passwordHash,
        createdAt: ago(30 + (i % 60)),
        // Satu anggota jadi moderator relawan komunitas (demo badge & menu moderator di chat)
        role: username === "dimas24" ? "moderator" : "user",
      })
      .returning({ id: schema.users.id });
    pool.push(u!.id);
    userIds.set(username, u!.id);
  }

  console.log("» Membuat produk, gambar & file demo…");
  const buffersByName = new Map<string, Buffer>();
  const latestFileByProduct = new Map<string, string>();
  const productIds = new Map<string, string>();
  const releaseIds = new Map<string, string>();
  let fileCount = 0;

  for (const p of PRODUCTS) {
    const status = p.status ?? "published";
    const sellerId = sellerIds.get(p.seller)!;
    const publishedReleases = p.releases.filter((r) => (r.status ?? "published") === "published");
    const firstPublished = publishedReleases.length ? ago(Math.max(...publishedReleases.map((r) => r.daysAgo))) : null;
    const lastActivity = p.releases.length ? ago(Math.min(...p.releases.map((r) => r.daysAgo))) : ago(p.createdDaysAgo);

    const [prod] = await db
      .insert(schema.products)
      .values({
        sellerId,
        slug: p.title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60).replace(/-+$/, ""),
        title: p.title,
        summary: p.summary,
        descriptionMd: p.description,
        category: p.category,
        platforms: p.platforms,
        tags: p.tags,
        license: p.license,
        pricingModel: p.pricing ?? "free",
        priceIdr: p.price ?? 0,
        minPriceIdr: p.minPrice ?? 0,
        androidPackage: p.android?.pkg ?? null,
        androidRegistration: p.android?.registration ?? null,
        androidCheckedAt: p.android?.checked ? ago(p.createdDaysAgo - 1) : null,
        status,
        isFeatured: Boolean(p.featured),
        downloadCount: p.downloads ?? 0,
        websiteUrl: p.websiteUrl ?? null,
        createdAt: ago(p.createdDaysAgo),
        updatedAt: lastActivity,
        submittedAt: status === "draft" ? null : ago(status === "review" ? Math.min(...p.releases.map((r) => r.daysAgo)) : p.createdDaysAgo - 0.5),
        publishedAt: status === "published" ? firstPublished : null,
      })
      .returning({ id: schema.products.id });
    const productId = prod!.id;
    productIds.set(p.key, productId);

    // Gambar (draft sengaja tanpa gambar → contoh checklist belum lengkap)
    if (status !== "draft") {
      const icon = await makeIcon(p.title, p.colors[0], p.colors[1]);
      const iconKey = `public/products/${productId}/icon-${shortId()}.webp`;
      await put(iconKey, icon.data);
      const cover = await makeCover({ title: p.title, summary: p.summary, category: p.categoryLabel, c1: p.colors[0], c2: p.colors[1], visual: p.visual });
      const coverKey = `public/products/${productId}/cover-${shortId()}.webp`;
      await put(coverKey, cover.data);
      await db.update(schema.products).set({ iconKey, coverKey }).where(eq(schema.products.id, productId));
      for (const [i, spec] of p.screens.entries()) {
        const shot = await makeScreenshot(p.visual, spec, p.colors[0], p.colors[1], i);
        const key = `public/products/${productId}/screenshot-${shortId()}.webp`;
        await put(key, shot.data);
        await db.insert(schema.productMedia).values({ productId, storageKey: key, width: shot.info.width, height: shot.info.height, sort: i });
      }
    }

    // Rilis + file
    for (const r of p.releases) {
      const rStatus = r.status ?? "published";
      const [rel] = await db
        .insert(schema.releases)
        .values({
          productId,
          version: r.version,
          changelogMd: r.changelog,
          status: rStatus,
          createdAt: ago(r.daysAgo, 3),
          submittedAt: ago(r.daysAgo, 1),
          publishedAt: rStatus === "published" ? ago(r.daysAgo) : null,
        })
        .returning({ id: schema.releases.id });
      releaseIds.set(`${p.key}@${r.version}`, rel!.id);
      for (const f of r.files) {
        let buf: Buffer;
        if (f.reuseFrom && buffersByName.has(f.reuseFrom)) buf = buffersByName.get(f.reuseFrom)!;
        else if (f.kind === "apk") buf = makeApk(p.android?.pkg ?? "id.demo.app", r.version, Math.round(f.mb * 1024 * 1024));
        else if (f.kind === "zip") buf = makeZip({ "README.md": `# ${p.title} v${r.version}\n\n${p.summary}\n\n(File demo Rilisin)\n` }, Math.round(f.mb * 1024 * 1024));
        else buf = makePdf(p.title, [p.summary.slice(0, 90), "", "Ini file demo dari prototype Rilisin.", "Versi lengkap akan diunggah oleh penulis.", "", `Versi ${r.version}`]);
        buffersByName.set(f.name, buf);
        const key = `private/releases/${rel!.id}/${shortId()}-${f.name}`;
        await put(key, buf);
        const [file] = await db
          .insert(schema.releaseFiles)
          .values({
            releaseId: rel!.id,
            platform: f.platform,
            filename: f.name,
            storageKey: key,
            sizeBytes: buf.length,
            sha256: sha256(buf),
            detectedType: f.kind === "apk" ? "APK Android" : f.kind === "zip" ? "Arsip ZIP" : "Dokumen PDF",
            scanStatus: rStatus === "published" ? "clean" : "pending",
            createdAt: ago(r.daysAgo, 2),
          })
          .returning({ id: schema.releaseFiles.id });
        fileCount++;
        if (rStatus === "published") latestFileByProduct.set(p.key, file!.id);
      }
    }

    if (status === "published") {
      await db.insert(schema.moderationActions).values({
        moderatorId: p.seller === "pixelrantau" ? null : admin!.id,
        targetType: "product",
        targetId: productId,
        action: p.seller === "pixelrantau" ? "auto_publish_trusted" : "approve",
        createdAt: firstPublished ?? ago(p.createdDaysAgo),
      });
    }
  }

  console.log("» Membuat riwayat unduhan…");
  const logs: (typeof schema.downloadLogs.$inferInsert)[] = [];
  const ents: (typeof schema.entitlements.$inferInsert)[] = [];
  for (const p of PRODUCTS) {
    if ((p.status ?? "published") !== "published" || (p.pricing ?? "free") !== "free") continue;
    const productId = productIds.get(p.key)!;
    const fileId = latestFileByProduct.get(p.key) ?? null;
    const age = Math.min(p.createdDaysAgo, 30);
    for (const userId of pool) {
      const recent = rand() < p.heat * 0.9;
      const older = rand() < 0.25 + p.heat * 0.3;
      if (!recent && !older) continue;
      const days = recent ? rand() * Math.min(7, age) : 7 + rand() * Math.max(0, age - 7);
      const at = ago(days, rand() * 12);
      logs.push({ userId, productId, releaseFileId: fileId, ipHash: null, createdAt: at });
      ents.push({ userId, productId, source: "free", createdAt: at });
    }
  }
  // Library akun demo: satu produk punya update baru sejak terakhir diunduh
  const demoLib: [string, number][] = [["kasirku", 4], ["kancil", 9], ["landingumkm", 20], ["ebookandroid", 3]];
  for (const [key, days] of demoLib) {
    const productId = productIds.get(key)!;
    ents.push({ userId: demoUser!.id, productId, source: "free", createdAt: ago(days) });
    logs.push({ userId: demoUser!.id, productId, releaseFileId: latestFileByProduct.get(key) ?? null, createdAt: ago(days) });
  }
  if (ents.length) await db.insert(schema.entitlements).values(ents).onConflictDoNothing();
  if (logs.length) await db.insert(schema.downloadLogs).values(logs);

  // Kurasi
  for (const key of ["kasirku", "kancil", "uikitojol"]) {
    await db.insert(schema.moderationActions).values({ moderatorId: admin!.id, targetType: "product", targetId: productIds.get(key)!, action: "feature", createdAt: ago(5) });
  }

  console.log("» Membuat ruang komunitas & percakapan demo…");
  const chat = await seedChat(db, { userIds, put, now });

  console.log("» Membuat transaksi, saldo & pencairan demo…");
  const pay = await seedPayments(db, { userIds, productIds, now });

  await client.end();
  console.log(
    `✓ Seed selesai dalam ${((Date.now() - t0) / 1000).toFixed(1)} dtk — ${PRODUCTS.length} produk, ${fileCount} file, ${logs.length} log unduhan, ${chat.rooms} ruang chat, ${chat.messages} pesan, ${pay.orders} pesanan.`,
  );
  console.log("  Akun demo (password: rilisin123): admin@rilisin.test · seller@rilisin.test · user@rilisin.test · moderator: dimas24@contoh.test");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
