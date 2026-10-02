import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { IN_WORKERS } from "@/lib/runtime";

export type WebpOptions = {
  width: number;
  height: number;
  /** cover: isi penuh lalu potong tengah. inside: muat di dalam kotak, tidak diperbesar. */
  fit: "cover" | "inside";
  quality: number;
  /** batas piksel input (anti decompression bomb) */
  maxPixels: number;
};

export type WebpResult = { data: Buffer; info: { width: number; height: number } };

// Subset antarmuka binding Cloudflare Images yang dipakai di sini (tanpa menambah dependensi tipe).
type ImagesBinding = {
  info(stream: ReadableStream): Promise<{ width?: number; height?: number }>;
  input(stream: ReadableStream): {
    transform(o: { width: number; height: number; fit: string }): {
      output(o: { format: string; quality: number }): Promise<{ response(): Response }>;
    };
  };
};

const stream = (b: Buffer) => new Blob([new Uint8Array(b)]).stream() as ReadableStream;

/**
 * Normalisasi gambar upload: putar sesuai EXIF, ubah ukuran, simpan sebagai WebP (metadata dibuang).
 * Node memakai sharp; Workers memakai binding Cloudflare Images (sharp tidak jalan di workerd).
 * Melempar error bila gambar rusak / terlalu besar; pemanggil menerjemahkannya jadi 415.
 */
export async function toWebp(buf: Buffer, o: WebpOptions): Promise<WebpResult> {
  if (!IN_WORKERS) {
    const { default: sharp } = await import("sharp");
    return sharp(buf, { failOn: "error", limitInputPixels: o.maxPixels })
      .rotate()
      .resize(o.width, o.height, { fit: o.fit, withoutEnlargement: o.fit === "inside" })
      .webp({ quality: o.quality })
      .toBuffer({ resolveWithObject: true });
  }
  const images = (getCloudflareContext().env as { IMAGES?: ImagesBinding }).IMAGES;
  if (!images) throw new Error("Binding IMAGES tidak dikonfigurasi");
  const src = await images.info(stream(buf));
  if (!src.width || !src.height || src.width * src.height > o.maxPixels) throw new Error("Dimensi gambar tidak valid");
  const result = await images
    .input(stream(buf))
    .transform({ width: o.width, height: o.height, fit: o.fit === "cover" ? "cover" : "scale-down" })
    .output({ format: "image/webp", quality: o.quality });
  const data = Buffer.from(await result.response().arrayBuffer());
  const out = await images.info(stream(data));
  if (!out.width || !out.height) throw new Error("Hasil gambar tidak terbaca");
  return { data, info: { width: out.width, height: out.height } };
}
