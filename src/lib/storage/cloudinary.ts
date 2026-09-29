import "server-only";
import type { StorageDriver } from "./types";

/**
 * Hibrida Cloudinary: key `public/...` (avatar, ikon, cover, screenshot, gambar
 * chat) disimpan di Cloudinary; sisanya (`tmp/...`, `private/...`) tetap di
 * driver dalam (local / vercel-blob). Aktif hanya kalau ketiga env terisi:
 * CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.
 *
 * Tanpa dependency baru: Upload API dipanggil langsung via fetch dengan HTTP
 * Basic Auth (api_key:api_secret). Key storage TIDAK berubah, jadi semua kode
 * pemanggil (avatarKey, iconKey, ...) bekerja tanpa modifikasi.
 */

type CloudEnv = { cloud: string; key: string; secret: string };

function cloudinaryEnv(): CloudEnv | null {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  return cloud && key && secret ? { cloud, key, secret } : null;
}

export function isCloudinaryEnabled() {
  return cloudinaryEnv() !== null;
}

const PUBLIC_RE = /^public\/[A-Za-z0-9/_-]+\.[A-Za-z0-9]+$/;

/** `public/avatars/<id>/<id>.webp` → public_id `public/avatars/<id>/<id>` (+ ekstensi asli). */
export function cloudinarySplit(key: string): { id: string; ext: string } {
  if (!PUBLIC_RE.test(key)) throw new Error(`Key publik tidak valid: ${key}`);
  const dot = key.lastIndexOf(".");
  return { id: key.slice(0, dot), ext: key.slice(dot + 1).toLowerCase() };
}

export function cloudinaryUrl(key: string): string {
  const env = cloudinaryEnv();
  if (!env) throw new Error("Cloudinary belum dikonfigurasi");
  const { id, ext } = cloudinarySplit(key);
  return `https://res.cloudinary.com/${env.cloud}/image/upload/${id}.${ext}`;
}

function basicAuth(env: CloudEnv) {
  return `Basic ${Buffer.from(`${env.key}:${env.secret}`).toString("base64")}`;
}

async function cloudinaryUpload(key: string, data: Buffer) {
  const env = cloudinaryEnv();
  if (!env) throw new Error("Cloudinary belum dikonfigurasi");
  const { id } = cloudinarySplit(key);
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(data)], { type: "application/octet-stream" }), "upload.bin");
  form.set("public_id", id);
  form.set("overwrite", "true");
  form.set("invalidate", "true");
  const res = await fetch(`https://api.cloudinary.com/v1_1/${env.cloud}/image/upload`, {
    method: "POST",
    headers: { Authorization: basicAuth(env) },
    body: form,
  });
  if (!res.ok) throw new Error(`Cloudinary upload gagal (${res.status})`);
  const json = (await res.json().catch(() => ({}))) as { secure_url?: string };
  if (!json.secure_url) throw new Error("Cloudinary upload tanpa secure_url");
}

async function cloudinaryDestroy(key: string) {
  const env = cloudinaryEnv();
  if (!env) throw new Error("Cloudinary belum dikonfigurasi");
  const { id } = cloudinarySplit(key);
  const form = new FormData();
  form.set("public_id", id);
  form.set("invalidate", "true");
  const res = await fetch(`https://api.cloudinary.com/v1_1/${env.cloud}/image/destroy`, {
    method: "POST",
    headers: { Authorization: basicAuth(env) },
    body: form,
  });
  if (!res.ok) throw new Error(`Cloudinary destroy gagal (${res.status})`);
}

async function cloudinaryFetch(key: string, range?: [number, number]) {
  const headers: Record<string, string> = {};
  if (range) headers.Range = `bytes=${range[0]}-${range[1]}`;
  const res = await fetch(cloudinaryUrl(key), { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`Cloudinary baca gagal (${res.status})`);
  return res;
}

/** Decorator: alihkan operasi key `public/...` ke Cloudinary, sisanya ke driver dalam. */
export function withCloudinaryPublic(inner: StorageDriver): StorageDriver {
  const isPublic = (key: string) => key.startsWith("public/");
  return {
    uploadUrl: (key, token, maxBytes) => inner.uploadUrl(key, token, maxBytes),
    async stat(key) {
      if (!isPublic(key)) return inner.stat(key);
      const res = await cloudinaryFetch(key, [0, 0]);
      const len = res.headers.get("content-range")?.split("/")[1] ?? res.headers.get("content-length");
      const size = Number(len);
      return Number.isSafeInteger(size) ? { size } : null;
    },
    async read(key) {
      if (!isPublic(key)) return inner.read(key);
      return Buffer.from(await (await cloudinaryFetch(key)).arrayBuffer());
    },
    async readRange(key, start, length) {
      if (!isPublic(key)) return inner.readRange(key, start, length);
      if (length <= 0) return Buffer.alloc(0);
      return Buffer.from(await (await cloudinaryFetch(key, [start, start + length - 1])).arrayBuffer());
    },
    async sha256(key) {
      if (!isPublic(key)) return inner.sha256(key);
      const { createHash } = await import("node:crypto");
      const res = await cloudinaryFetch(key);
      const hash = createHash("sha256");
      const reader = res.body!.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value);
      }
      return hash.digest("hex");
    },
    async write(key, data) {
      if (!isPublic(key)) return inner.write(key, data);
      await cloudinaryUpload(key, data);
    },
    async move(from, to) {
      const fromPublic = isPublic(from);
      const toPublic = isPublic(to);
      if (!fromPublic && !toPublic) return inner.move(from, to);
      const data = fromPublic ? Buffer.from(await (await cloudinaryFetch(from)).arrayBuffer()) : await inner.read(from);
      if (toPublic) await cloudinaryUpload(to, data);
      else await inner.write(to, data);
      if (fromPublic) await cloudinaryDestroy(from).catch(() => {});
      else await inner.remove(from).catch(() => {});
    },
    async remove(key) {
      // Coba dua-duanya: file lama (sebelum migrasi) mungkin masih di driver dalam.
      if (!isPublic(key)) return inner.remove(key);
      await cloudinaryDestroy(key).catch(() => {});
      await inner.remove(key).catch(() => {});
    },
    publicUrl: (key) => (isPublic(key) ? cloudinaryUrl(key) : inner.publicUrl(key)),
    list: (prefix) => inner.list(prefix),
    downloadUrl: (key, opts) => (isPublic(key) ? Promise.resolve(cloudinaryUrl(key)) : inner.downloadUrl(key, opts)),
  };
}
