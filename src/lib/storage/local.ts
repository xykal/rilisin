import "server-only";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { signToken } from "@/lib/tokens";
import { StorageError, type StorageDriver } from "./types";

export const LOCAL_ROOT = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.STORAGE_LOCAL_DIR || ".local/storage");

const KEY_RE = /^(tmp|public|private)\/[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/;

export function resolveLocalKey(key: string) {
  if (!KEY_RE.test(key) || key.includes("..") || key.includes("//")) {
    throw new StorageError("INVALID_KEY");
  }
  const full = path.resolve(/*turbopackIgnore: true*/ LOCAL_ROOT, key);
  if (!full.startsWith(LOCAL_ROOT + path.sep)) throw new StorageError("INVALID_KEY");
  return full;
}

/** Tulis body request (stream) ke disk sambil membatasi ukuran. Mengembalikan jumlah byte. */
export async function writeLocalStream(
  key: string,
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<number> {
  const full = resolveLocalKey(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  const partial = `${full}.part`;
  const handle = await fs.open(partial, "w");
  let total = 0;
  try {
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new StorageError("TOO_LARGE");
      }
      await handle.write(value);
    }
    await handle.close();
    await fs.rename(partial, full);
    return total;
  } catch (err) {
    await handle.close().catch(() => {});
    await fs.rm(partial, { force: true });
    throw err;
  }
}

/** Stream file untuk dikirim ke browser. */
export async function openLocalStream(key: string) {
  const full = resolveLocalKey(key);
  const info = await fs.stat(full).catch(() => null);
  if (!info?.isFile()) throw new StorageError("NOT_FOUND");
  const stream = Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>;
  return { stream, size: info.size };
}

export const localDriver: StorageDriver = {
  async uploadUrl(_key, token) {
    return `/api/storage/upload?token=${encodeURIComponent(token)}`;
  },

  async stat(key) {
    const info = await fs.stat(resolveLocalKey(key)).catch(() => null);
    return info?.isFile() ? { size: info.size } : null;
  },

  async read(key) {
    return fs.readFile(resolveLocalKey(key));
  },

  async readRange(key, start, length) {
    const handle = await fs.open(resolveLocalKey(key), "r");
    try {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buf, 0, length, start);
      return buf.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  },

  async sha256(key) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(resolveLocalKey(key))) hash.update(chunk as Buffer);
    return hash.digest("hex");
  },

  async write(key, data) {
    const full = resolveLocalKey(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  },

  async move(from, to) {
    const src = resolveLocalKey(from);
    const dest = resolveLocalKey(to);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.rename(src, dest);
  },

  async remove(key) {
    await fs.rm(resolveLocalKey(key), { force: true });
  },

  publicUrl(key) {
    return `/media/${key.replace(/^public\//, "")}`;
  },

  async downloadUrl(key, { filename, userId, ttlSec }) {
    const token = signToken("dl", { k: key, f: filename, u: userId }, ttlSec);
    return `/api/storage/file?token=${encodeURIComponent(token)}`;
  },
};
