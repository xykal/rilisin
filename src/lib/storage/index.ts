import "server-only";
import { localDriver } from "./local";
import type { StorageDriver } from "./types";

export function storage(): StorageDriver {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  switch (driver) {
    case "local":
      return localDriver;
    default:
      // Driver "r2" ditambahkan saat deploy (butuh akun Cloudflare + API key).
      throw new Error(`Storage driver "${driver}" belum tersedia`);
  }
}

export function mediaUrl(key: string | null | undefined): string | null {
  return key ? storage().publicUrl(key) : null;
}

export { StorageError } from "./types";
