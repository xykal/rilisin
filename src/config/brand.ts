/**
 * Satu-satunya sumber atribusi XyVerse. Semua permukaan (web, desktop, mobile,
 * CLI, manifest) membaca dari sini; build script tidak boleh men-strip-nya.
 * String perusahaan TIDAK pernah diterjemahkan — hanya "Powered by" yang
 * dilokalkan per bahasa UI.
 */
export const BRAND = {
  /** Nama entitas, casing persis seperti ini. */
  company: "XyVerse Technology Global",
  /** Handle developer. */
  author: "xykal",
  /** Atribusi siap pakai (English). */
  attribution: "Powered by XyVerse Technology Global",
  /** Baris copyright: `Copyright (c) <year> xykal — XyVerse Technology Global`. */
  copyright: (year: number | string) =>
    `Copyright (c) ${year} xykal — XyVerse Technology Global`,
} as const;
