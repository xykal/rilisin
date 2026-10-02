import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isProxiedDriver, openStream } from "@/lib/storage/proxied";
import { verifyToken } from "@/lib/tokens";

function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function errorPage(message: string, status: number) {
  const html = `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Download gagal</title>
<body style="font-family:system-ui,sans-serif;background:#f6f7fb;color:#0f1222;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="background:#fff;border:1px solid #e2e5ee;border-radius:16px;padding:32px;max-width:420px;text-align:center">
<h1 style="font-size:20px;margin:0 0 8px">Download tidak bisa dilanjutkan</h1><p style="color:#475069;margin:0 0 20px">${message}</p>
<a href="javascript:history.back()" style="color:#4b34d9;font-weight:600">&larr; Kembali</a></div></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/**
 * Pengganti signed URL R2 untuk driver "local".
 * Token berlaku 10 menit & terikat ke user yang meminta (link tidak bisa dibagikan).
 */
export async function GET(req: NextRequest) {
  if (!isProxiedDriver()) return new Response("Tidak ditemukan", { status: 404 }); // khusus driver local / r2
  const payload = verifyToken<{ k: string; f: string; u: string }>("dl", req.nextUrl.searchParams.get("token"));
  if (!payload) return errorPage("Link download sudah kedaluwarsa. Silakan klik tombol Download lagi.", 403);

  const user = await getCurrentUser();
  if (!user || user.id !== payload.u) return errorPage("Link download ini milik akun lain / kamu belum masuk.", 403);

  try {
    const { stream, size } = await openStream(payload.k);
    return new Response(stream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(size),
        "Content-Disposition": contentDisposition(payload.f),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return errorPage("File tidak ditemukan di server.", 404);
  }
}
