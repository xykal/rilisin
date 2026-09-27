import { storageDriverName } from "@/lib/storage";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isSameOrigin } from "@/lib/http";
import { writeLocalStream } from "@/lib/storage/local";
import { StorageError } from "@/lib/storage/types";
import { readUploadToken } from "@/lib/uploads";

/**
 * Endpoint upload khusus driver "local" (pengganti presigned URL R2 saat development).
 * Body di-stream langsung ke disk dengan batas ukuran sesuai token.
 */
export async function PUT(req: NextRequest) {
  if (storageDriverName() !== "local") return new Response("Tidak ditemukan", { status: 404 }); // khusus driver local
  if ((process.env.STORAGE_DRIVER ?? "local") !== "local") return new Response("Not found", { status: 404 });
  if (!isSameOrigin(req)) return Response.json({ error: "Origin tidak diizinkan" }, { status: 403 });

  const token = readUploadToken(req.nextUrl.searchParams.get("token"));
  if (!token) return Response.json({ error: "Token upload tidak valid / kedaluwarsa" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user || user.id !== token.u) return Response.json({ error: "Sesi tidak cocok" }, { status: 403 });
  if (!req.body) return Response.json({ error: "File kosong" }, { status: 400 });

  const declared = Number(req.headers.get("content-length") ?? token.s);
  if (declared > token.s) return Response.json({ error: "File lebih besar dari yang dideklarasikan" }, { status: 413 });

  try {
    const size = await writeLocalStream(token.k, req.body, token.s);
    return Response.json({ ok: true, size });
  } catch (err) {
    if (err instanceof StorageError && err.code === "TOO_LARGE") {
      return Response.json({ error: "File melebihi batas ukuran" }, { status: 413 });
    }
    console.error("local upload error", err);
    return Response.json({ error: "Gagal menyimpan file" }, { status: 500 });
  }
}
