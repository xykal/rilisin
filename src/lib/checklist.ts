/** Syarat minimal sebelum produk bisa dikirim ke review (dipakai di UI & server). */
export type ChecklistInput = {
  descriptionMd: string;
  iconKey: string | null;
  coverKey: string | null;
  platforms: string[];
  androidPackage: string | null;
  androidRegistration: string | null;
  pricingModel: string;
  mediaCount: number;
  hasReleaseWithFiles: boolean;
};

export function productChecklist(p: ChecklistInput) {
  const items = [
    { key: "description", label: "Deskripsi minimal 80 karakter", done: p.descriptionMd.trim().length >= 80 },
    { key: "icon", label: "Ikon produk", done: Boolean(p.iconKey) },
    { key: "cover", label: "Gambar cover", done: Boolean(p.coverKey) },
    { key: "screenshot", label: "Minimal 1 screenshot", done: p.mediaCount > 0 },
    { key: "release", label: "Rilis dengan minimal 1 file", done: p.hasReleaseWithFiles },
  ];
  if (p.platforms.includes("android")) {
    items.push({
      key: "android",
      label: "Info Android (nama paket & status verifikasi)",
      done: Boolean(p.androidPackage && p.androidRegistration),
    });
    if (p.pricingModel !== "free") {
      // Keputusan blueprint #11: APK berbayar wajib dari developer yang terdaftar di Google.
      items.push({
        key: "android_paid",
        label: "Android berbayar: developer wajib sudah terdaftar di Google",
        done: p.androidRegistration === "registered",
      });
    }
  }
  return { items, complete: items.every((i) => i.done) };
}
