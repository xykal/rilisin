import "server-only";
import { blobDriver } from "./blob";
import { localDriver } from "./local";
import type { StorageDriver } from "./types";

export const storageDriverName = () => (process.env.STORAGE_DRIVER ?? "local") as "local" | "vercel-blob";

export function storage(): StorageDriver {
  const driver = storageDriverName();
  switch (driver) {
    case "local":
      return localDriver;
    case "vercel-blob":
      return blobDriver;
    default:
      throw new Error(`Storage driver "${driver}" belum tersedia`);
  }
}

export function mediaUrl(key: string | null | undefined): string | null {
  return key ? storage().publicUrl(key) : null;
}

export { StorageError } from "./types";
