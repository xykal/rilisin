import "server-only";
import { createHash } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { signToken } from "@/lib/tokens";
import { StorageError, type StorageDriver } from "./types";

// Subset antarmuka R2 yang dipakai (tanpa menambah dependensi tipe workers).
type R2Object = { key: string; size: number; uploaded: Date };
type R2ObjectBody = R2Object & { body: ReadableStream<Uint8Array>; arrayBuffer(): Promise<ArrayBuffer> };
type R2Bucket = {
  head(key: string): Promise<R2Object | null>;
  get(key: string, opts?: { range?: { offset: number; length: number } }): Promise<R2ObjectBody | null>;
  put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView): Promise<R2Object>;
  delete(key: string): Promise<void>;
  list(opts: { prefix: string; cursor?: string; limit?: number }): Promise<{ objects: R2Object[]; truncated: boolean; cursor?: string }>;
};

const KEY_RE = /^(tmp|public|private)\/[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/;

function checkKey(key: string) {
  if (!KEY_RE.test(key) || key.includes("..") || key.includes("//")) throw new StorageError("INVALID_KEY");
  return key;
}

function bucket(): R2Bucket {
  const b = (getCloudflareContext().env as { BUCKET?: R2Bucket }).BUCKET;
  if (!b) throw new Error("Binding R2 BUCKET tidak dikonfigurasi (wrangler.jsonc r2_buckets)");
  return b;
}

/** Simpan body request ke R2. `length` = Content-Length bila ada (R2 butuh panjang stream yang diketahui). */
export async function writeR2Stream(key: string, body: ReadableStream<Uint8Array>, maxBytes: number, length?: number): Promise<number> {
  checkKey(key);
  let size: number;
  if (length !== undefined && Number.isFinite(length)) {
    if (length > maxBytes) throw new StorageError("TOO_LARGE");
    // Next membungkus req.body sehingga panjangnya tak lagi "dikenal" R2; FixedLengthStream memulihkannya
    // sekaligus menolak body yang panjang sebenarnya beda dari Content-Length.
    const FixedLengthStream = (globalThis as unknown as { FixedLengthStream: new (n: number) => { readable: ReadableStream; writable: WritableStream } }).FixedLengthStream;
    const fixed = new FixedLengthStream(length);
    await Promise.all([bucket().put(key, fixed.readable), body.pipeTo(fixed.writable)]);
    size = (await bucket().head(key))?.size ?? length;
  } else {
    // Tanpa Content-Length: kumpulkan di memori dengan batas ketat.
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new StorageError("TOO_LARGE");
      }
      chunks.push(value);
    }
    await bucket().put(key, Buffer.concat(chunks));
    size = total;
  }
  if (size > maxBytes) {
    await bucket().delete(key);
    throw new StorageError("TOO_LARGE");
  }
  return size;
}

export async function openR2Stream(key: string) {
  const obj = await bucket().get(checkKey(key));
  if (!obj) throw new StorageError("NOT_FOUND");
  return { stream: obj.body, size: obj.size };
}

export const r2Driver: StorageDriver = {
  async uploadUrl(_key, token) {
    return `/api/storage/upload?token=${encodeURIComponent(token)}`;
  },

  async stat(key) {
    const head = await bucket().head(checkKey(key));
    return head ? { size: head.size } : null;
  },

  async read(key) {
    const obj = await bucket().get(checkKey(key));
    if (!obj) throw new StorageError("NOT_FOUND");
    return Buffer.from(await obj.arrayBuffer());
  },

  async readRange(key, start, length) {
    const obj = await bucket().get(checkKey(key), { range: { offset: start, length } });
    if (!obj) throw new StorageError("NOT_FOUND");
    return Buffer.from(await obj.arrayBuffer());
  },

  async sha256(key) {
    const obj = await bucket().get(checkKey(key));
    if (!obj) throw new StorageError("NOT_FOUND");
    const hash = createHash("sha256");
    const reader = obj.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
    }
    return hash.digest("hex");
  },

  async write(key, data) {
    await bucket().put(checkKey(key), data);
  },

  async move(from, to) {
    // R2 tidak punya rename: salin lalu hapus sumber.
    const src = await bucket().get(checkKey(from));
    if (!src) throw new StorageError("NOT_FOUND");
    await bucket().put(checkKey(to), src.body);
    await bucket().delete(from);
  },

  async remove(key) {
    await bucket().delete(checkKey(key));
  },

  publicUrl(key) {
    return `/media/${key.replace(/^public\//, "")}`;
  },

  async downloadUrl(key, { filename, userId, ttlSec }) {
    const token = signToken("dl", { k: key, f: filename, u: userId }, ttlSec);
    return `/api/storage/file?token=${encodeURIComponent(token)}`;
  },

  async list(prefix) {
    if (!/^(tmp|public|private)\/[a-zA-Z0-9/_.-]*$/.test(prefix) || prefix.includes("..")) throw new StorageError("INVALID_KEY");
    const out: { key: string; size: number; uploadedAt: Date }[] = [];
    let cursor: string | undefined;
    do {
      const page = await bucket().list({ prefix, cursor, limit: 1000 });
      for (const o of page.objects) out.push({ key: o.key, size: o.size, uploadedAt: o.uploaded });
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return out;
  },
};
