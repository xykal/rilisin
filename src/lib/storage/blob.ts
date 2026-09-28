import "server-only";
import { BlobMissingError, blobDel, blobHead, blobList, blobMove, blobPut, blobRead, blobReadRange, blobSha256, blobUrl, presignGet, presignPut } from "./blob-core";
import { StorageError, type StorageDriver } from "./types";

const KEY_RE = /^(tmp|public|private)\/[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/;
function check(key: string) {
  if (!KEY_RE.test(key) || key.includes("..") || key.includes("//")) throw new StorageError("INVALID_KEY");
  return key;
}
const wrap = async <T>(fn: () => Promise<T>) => {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof BlobMissingError) throw new StorageError("NOT_FOUND");
    throw err;
  }
};

/** Driver produksi gratis: Vercel Blob (store publik untuk gambar, store privat untuk file aplikasi). */
export const blobDriver: StorageDriver = {
  async uploadUrl(key, _token, maxBytes) {
    return presignPut(check(key), maxBytes);
  },
  stat: (key) => blobHead(check(key)),
  read: (key) => wrap(() => blobRead(check(key))),
  readRange: (key, start, length) => wrap(() => blobReadRange(check(key), start, length)),
  sha256: (key) => wrap(() => blobSha256(check(key))),
  async write(key, data) {
    await blobPut(check(key), data, key.endsWith(".webp") ? "image/webp" : undefined);
  },
  move: (from, to) => wrap(() => blobMove(check(from), check(to))),
  remove: (key) => blobDel(check(key)),
  publicUrl(key) {
    return blobUrl(check(key));
  },
  async downloadUrl(key) {
    // Link bearer berumur pendek (5 menit). Nama file = bagian akhir key (…/<acak>/<nama-asli>).
    return presignGet(check(key), 5 * 60);
  },
  async list(prefix) {
    if (!/^(tmp|public|private)\/[a-zA-Z0-9/_.-]*$/.test(prefix) || prefix.includes("..")) throw new StorageError("INVALID_KEY");
    return blobList(prefix);
  },
};
