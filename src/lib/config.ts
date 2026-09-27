/**
 * Konfigurasi & konstanta aplikasi. Nama platform masih nama kerja ("Rilisin") —
 * cukup ganti di sini kalau nanti nama final sudah diputuskan.
 */
export const SITE = {
  name: "Rilisin",
  tagline: "Rumah karya developer Indonesia",
  description:
    "Download & dukung aplikasi, game, source code, dan template buatan developer Indonesia. Gratis maupun berbayar, plus komunitas buat saling dukung.",
} as const;

export const CATEGORIES = [
  {
    slug: "aplikasi",
    label: "Aplikasi",
    description: "Aplikasi Android, desktop, dan web",
  },
  { slug: "game", label: "Game", description: "Game indie buatan dev lokal" },
  {
    slug: "source-code",
    label: "Source Code",
    description: "Project siap pakai & starter kit",
  },
  {
    slug: "template",
    label: "Template & UI Kit",
    description: "Template web, desain UI, undangan digital",
  },
  { slug: "aset", label: "Aset Desain", description: "Ikon, ilustrasi, font, aset game" },
  { slug: "ebook", label: "E-book & Materi", description: "Panduan, e-book, materi belajar" },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

export const PLATFORMS = [
  { slug: "android", label: "Android" },
  { slug: "windows", label: "Windows" },
  { slug: "macos", label: "macOS" },
  { slug: "linux", label: "Linux" },
  { slug: "web", label: "Web" },
  { slug: "universal", label: "Semua perangkat" },
] as const;

export type PlatformSlug = (typeof PLATFORMS)[number]["slug"];

export const LICENSES = [
  "Gratis dipakai (hak cipta pembuat)",
  "MIT",
  "Apache-2.0",
  "GPL-3.0",
  "CC BY 4.0",
  "CC BY-NC 4.0",
  "Lisensi Personal",
  "Lisensi Komersial",
] as const;

export const PRICING_LABELS = {
  free: "Gratis",
  fixed: "Harga tetap",
  pwyw: "Bayar seikhlasnya",
} as const;

export const LIMITS = {
  imageMaxBytes: 5 * 1024 * 1024,
  releaseFileMaxBytes:
    Number(process.env.MAX_RELEASE_FILE_MB || 100) * 1024 * 1024,
  screenshotsMax: 8,
  filesPerRelease: 10,
} as const;

/** Username yang tidak boleh dipakai (bentrok dengan rute / menyesatkan). */
export const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "moderator", "mod", "staff", "support", "help", "bantuan",
  "rilisin", "official", "resmi", "api", "app", "apps", "seller", "u", "p", "t", "s",
  "masuk", "daftar", "keluar", "login", "logout", "register", "library", "jelajahi",
  "komunitas", "panduan", "pengaturan", "notifikasi", "checkout", "legal", "cari",
  "kategori", "root", "system", "null", "undefined", "google", "android",
]);

export function categoryLabel(slug: string) {
  return CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;
}

export function platformLabel(slug: string) {
  return PLATFORMS.find((p) => p.slug === slug)?.label ?? slug;
}
