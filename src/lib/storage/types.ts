/**
 * Kontrak penyimpanan file. Driver: "local" (folder di server, development) dan
 * "vercel-blob" (produksi gratis: store publik + store privat). Kode fitur lain tidak peduli driver-nya.
 *
 * Konvensi key:
 *   tmp/...      → upload yang belum difinalisasi
 *   public/...   → gambar (ikon, cover, screenshot) — boleh diakses publik
 *   private/...  → file aplikasi — hanya lewat signed URL berumur pendek
 */
export interface StorageDriver {
  /** URL tujuan upload langsung dari browser (method PUT). Ukuran maksimal dikunci di URL/token. */
  uploadUrl(key: string, token: string, maxBytes: number): Promise<string>;
  stat(key: string): Promise<{ size: number } | null>;
  read(key: string): Promise<Buffer>;
  readRange(key: string, start: number, length: number): Promise<Buffer>;
  sha256(key: string): Promise<string>;
  write(key: string, data: Buffer): Promise<void>;
  move(from: string, to: string): Promise<void>;
  remove(key: string): Promise<void>;
  publicUrl(key: string): string;
  /** Signed URL download (berlaku singkat). Driver local: terikat ke user; vercel-blob: link bearer 5 menit. */
  downloadUrl(key: string, opts: { filename: string; userId: string; ttlSec: number }): Promise<string>;
}

export class StorageError extends Error {
  constructor(
    public code: "TOO_LARGE" | "NOT_FOUND" | "INVALID_KEY",
    message?: string,
  ) {
    super(message ?? code);
  }
}
