/**
 * Validasi tipe file berdasarkan "magic bytes" (isi file), bukan cuma ekstensi —
 * supaya file .apk yang ternyata bukan APK (atau file berbahaya yang diganti nama) ketahuan.
 */

type Check = (head: Buffer, tail: Buffer) => boolean;

const starts = (sig: number[], offset = 0): Check => (head) =>
  head.length >= offset + sig.length && sig.every((b, i) => head[offset + i] === b);

const ZIP = starts([0x50, 0x4b, 0x03, 0x04]);
const ZIP_EMPTY = starts([0x50, 0x4b, 0x05, 0x06]);
const isZip: Check = (h, t) => ZIP(h, t) || ZIP_EMPTY(h, t);

export const RELEASE_FILE_TYPES: Record<string, { label: string; check: Check }> = {
  apk: { label: "APK Android", check: isZip },
  exe: { label: "Windows EXE", check: starts([0x4d, 0x5a]) },
  msi: { label: "Windows MSI", check: starts([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) },
  dmg: {
    label: "macOS DMG",
    check: (_h, t) => t.length >= 512 && t.subarray(t.length - 512, t.length - 508).toString("latin1") === "koly",
  },
  pkg: { label: "macOS PKG", check: starts([0x78, 0x61, 0x72, 0x21]) },
  appimage: { label: "Linux AppImage", check: starts([0x7f, 0x45, 0x4c, 0x46]) },
  deb: { label: "Paket DEB", check: starts([0x21, 0x3c, 0x61, 0x72, 0x63, 0x68, 0x3e, 0x0a]) },
  rpm: { label: "Paket RPM", check: starts([0xed, 0xab, 0xee, 0xdb]) },
  zip: { label: "Arsip ZIP", check: isZip },
  "7z": { label: "Arsip 7z", check: starts([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) },
  rar: { label: "Arsip RAR", check: starts([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]) },
  "tar.gz": { label: "Arsip TAR.GZ", check: starts([0x1f, 0x8b]) },
  tgz: { label: "Arsip TGZ", check: starts([0x1f, 0x8b]) },
  pdf: { label: "Dokumen PDF", check: starts([0x25, 0x50, 0x44, 0x46]) },
  epub: { label: "E-book EPUB", check: isZip },
};

export const ACCEPTED_RELEASE_EXTENSIONS = Object.keys(RELEASE_FILE_TYPES)
  .map((e) => `.${e}`)
  .join(",");

export function extensionOf(filename: string): string | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".tar.gz")) return "tar.gz";
  const idx = lower.lastIndexOf(".");
  if (idx <= 0 || idx === lower.length - 1) return null;
  return lower.slice(idx + 1);
}

export function sanitizeFilename(filename: string) {
  const cleaned = filename
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-120);
  return cleaned || "file";
}

export type ImageType = "png" | "jpeg" | "webp";

export function detectImageType(head: Buffer): ImageType | null {
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])(head, head)) return "png";
  if (starts([0xff, 0xd8, 0xff])(head, head)) return "jpeg";
  if (
    head.length >= 12 &&
    head.subarray(0, 4).toString("latin1") === "RIFF" &&
    head.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return "webp";
  return null;
}

export type AudioType = "webm" | "ogg" | "mp4";

export function detectAudioType(head: Buffer): AudioType | null {
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "webm"; // EBML
  if (head.length >= 4 && head.subarray(0, 4).toString("latin1") === "OggS") return "ogg";
  if (head.length >= 8 && head.subarray(4, 8).toString("latin1") === "ftyp") return "mp4";
  return null;
}

export const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/webp";
export const ACCEPTED_AUDIO_TYPES = "audio/webm,audio/ogg,audio/mp4";

/** Nama paket Android, contoh: id.namadev.aplikasi */
export const ANDROID_PACKAGE_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
