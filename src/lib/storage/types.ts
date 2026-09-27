/**
 * Kontrak penyimpanan file. Sekarang ada driver "local" (folder di server).
 * Saat deploy, tinggal tambah driver "r2" (Cloudflare R2, S3-compatible) dengan
 * kontrak yang sama — kode fitur lain tidak perlu diubah.
 *
 * Konvensi key:
 *   tmp/...      → upload yang belum difinalisasi
 *   public/...   → gambar (ikon, cover, screenshot) — boleh diakses publik
 *   private/...  → file aplikasi — hanya lewat signed URL berumur pendek
 */
export interface StorageDriver {
  /** URL tujuan upload langsung dari browser (method PUT). */
  uploadUrl(key: string, token: string): string;
  stat(key: string): Promise<{ size: number } | null>;
  read(key: string): Promise<Buffer>;
  readRange(key: string, start: number, length: number): Promise<Buffer>;
  sha256(key: string): Promise<string>;
  write(key: string, data: Buffer): Promise<void>;
  move(from: string, to: string): Promise<void>;
  remove(key: string): Promise<void>;
  publicUrl(key: string): string;
  /** Signed URL download (berlaku singkat, terikat ke user). */
  downloadUrl(key: string, opts: { filename: string; userId: string; ttlSec: number }): string;
}

export class StorageError extends Error {
  constructor(
    public code: "TOO_LARGE" | "NOT_FOUND" | "INVALID_KEY",
    message?: string,
  ) {
    super(message ?? code);
  }
}
