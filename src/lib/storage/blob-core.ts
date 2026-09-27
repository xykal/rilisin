/**
 * Inti driver Vercel Blob (tanpa "server-only" supaya bisa dipakai script seed).
 * Dua store:
 *  - media (PUBLIC)  → key `public/...`  (ikon, cover, screenshot, gambar chat) — URL langsung dari CDN
 *  - files (PRIVATE) → key `tmp/...` & `private/...` (upload mentah yang belum divalidasi + file aplikasi)
 *    Tidak bisa diakses tanpa tanda tangan; download lewat presigned GET berumur pendek.
 * Env: BLOB_READ_WRITE_TOKEN (store media) · FILES_READ_WRITE_TOKEN (store files).
 */
import { createHash } from "node:crypto";
import { BlobNotFoundError, copy, del, head, issueSignedToken, list, presignUrl, put } from "@vercel/blob";

type Store = { token: string; access: "public" | "private"; host: string };

/** Token rw berformat vercel_blob_rw_<storeId>_<rahasia> → host store = <storeId lowercase>.<access>.blob.vercel-storage.com */
function hostFromToken(token: string, access: "public" | "private") {
  const id = token.split("_")[3];
  if (!id) throw new Error("Token Vercel Blob tidak valid");
  return `${id.toLowerCase()}.${access}.blob.vercel-storage.com`;
}

let cached: { media: Store; files: Store } | null = null;
export function blobStores() {
  if (cached) return cached;
  const media = process.env.BLOB_READ_WRITE_TOKEN;
  const files = process.env.FILES_READ_WRITE_TOKEN;
  if (!media || !files) throw new Error("STORAGE_DRIVER=vercel-blob butuh BLOB_READ_WRITE_TOKEN (store publik) & FILES_READ_WRITE_TOKEN (store privat)");
  cached = {
    media: { token: media, access: "public", host: hostFromToken(media, "public") },
    files: { token: files, access: "private", host: hostFromToken(files, "private") },
  };
  return cached;
}

export function storeForKey(key: string): Store {
  return key.startsWith("public/") ? blobStores().media : blobStores().files;
}

export function blobUrl(key: string) {
  return `https://${storeForKey(key).host}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export class BlobMissingError extends Error {}

export async function blobPut(key: string, data: Buffer, contentType?: string) {
  const s = storeForKey(key);
  await put(key, data, {
    access: s.access,
    token: s.token,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
    multipart: data.length > 32 * 1024 * 1024,
  });
}

export async function blobHead(key: string) {
  try {
    const h = await head(key, { token: storeForKey(key).token });
    return { size: h.size };
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    throw err;
  }
}

async function blobFetch(key: string, range?: [number, number]) {
  const s = storeForKey(key);
  const headers: Record<string, string> = {};
  if (s.access === "private") headers.Authorization = `Bearer ${s.token}`;
  if (range) headers.Range = `bytes=${range[0]}-${range[1]}`;
  const res = await fetch(blobUrl(key), { headers, cache: "no-store" });
  if (res.status === 404) throw new BlobMissingError(key);
  if (!res.ok) throw new Error(`Vercel Blob GET ${res.status}`);
  return res;
}

export async function blobRead(key: string) {
  return Buffer.from(await (await blobFetch(key)).arrayBuffer());
}

export async function blobReadRange(key: string, start: number, length: number) {
  if (length <= 0) return Buffer.alloc(0);
  return Buffer.from(await (await blobFetch(key, [start, start + length - 1])).arrayBuffer());
}

/** SHA-256 secara streaming (file besar tidak dimuat utuh ke memori). */
export async function blobSha256(key: string) {
  const res = await blobFetch(key);
  const hash = createHash("sha256");
  const reader = res.body!.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
  }
  return hash.digest("hex");
}

export async function blobDel(key: string) {
  await del(blobUrl(key), { token: storeForKey(key).token }).catch(() => {});
}

/** Pindah: dalam store yang sama pakai copy di sisi server (tanpa download); beda store → baca lalu tulis. */
export async function blobMove(from: string, to: string) {
  const a = storeForKey(from);
  const b = storeForKey(to);
  if (a.token === b.token) {
    await copy(blobUrl(from), to, { access: b.access, token: b.token, addRandomSuffix: false, allowOverwrite: true });
  } else {
    await blobPut(to, await blobRead(from));
  }
  await blobDel(from);
}

/** URL PUT presigned: browser upload langsung ke Blob (lewat batas body 4,5 MB Vercel Functions), ukuran dikunci di tanda tangan. */
export async function presignPut(key: string, maxBytes: number, ttlSec = 15 * 60) {
  const s = storeForKey(key);
  const validUntil = Date.now() + ttlSec * 1000;
  const t = await issueSignedToken({ pathname: key, operations: ["put"], maximumSizeInBytes: maxBytes, validUntil, token: s.token });
  const { presignedUrl } = await presignUrl(t, {
    operation: "put",
    pathname: key,
    access: s.access,
    maximumSizeInBytes: maxBytes,
    addRandomSuffix: false,
    allowOverwrite: true,
    validUntil,
  });
  return presignedUrl;
}

/** URL GET presigned (file privat). CDN mengirim Content-Disposition: attachment dengan nama = bagian akhir key. */
export async function presignGet(key: string, ttlSec: number) {
  const s = storeForKey(key);
  const validUntil = Date.now() + ttlSec * 1000;
  const t = await issueSignedToken({ pathname: key, operations: ["get"], validUntil, token: s.token });
  const { presignedUrl } = await presignUrl(t, { operation: "get", pathname: key, access: s.access, validUntil });
  return presignedUrl;
}

/** Kosongkan kedua store (dipakai seed staging). */
export async function blobWipe() {
  const { media, files } = blobStores();
  let removed = 0;
  for (const s of [media, files]) {
    let cursor: string | undefined;
    do {
      const r = await list({ token: s.token, cursor, limit: 1000 });
      if (r.blobs.length) {
        await del(r.blobs.map((b) => b.url), { token: s.token });
        removed += r.blobs.length;
      }
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
  }
  return removed;
}
