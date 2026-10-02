import "server-only";
import { blobDriver } from "./blob";
import { isCloudinaryEnabled, withCloudinaryPublic } from "./cloudinary";
import { localDriver } from "./local";
import { r2Driver } from "./r2";
import type { StorageDriver } from "./types";

export const storageDriverName = () => (process.env.STORAGE_DRIVER ?? "local") as "local" | "vercel-blob" | "r2";

export function storage(): StorageDriver {
  const driver = storageDriverName();
  let inner: StorageDriver;
  switch (driver) {
    case "local":
      inner = localDriver;
      break;
    case "vercel-blob":
      inner = blobDriver;
      break;
    case "r2":
      inner = r2Driver;
      break;
    default:
      throw new Error(`Storage driver "${driver}" belum tersedia`);
  }
  // Hibrida: gambar publik ke Cloudinary kalau env-nya terisi, tanpa itu 100% perilaku lama.
  return isCloudinaryEnabled() ? withCloudinaryPublic(inner) : inner;
}

export function mediaUrl(key: string | null | undefined): string | null {
  return key ? storage().publicUrl(key) : null;
}

export { StorageError } from "./types";
