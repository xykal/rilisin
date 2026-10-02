import { isWorkerRequest } from "@/lib/scan";
import { getFileForWorker } from "@/lib/scan";
import { isProxiedDriver, openStream } from "@/lib/storage/proxied";

/** Unduhan file untuk worker (khusus driver local — driver Blob memakai link bertanda tangan langsung dari CDN). */
export async function GET(req: Request, ctx: RouteContext<"/api/internal/scan/file/[fileId]">) {
  if (!isProxiedDriver()) return new Response("Tidak ditemukan", { status: 404 });
  if (!isWorkerRequest(req)) return new Response("Token worker salah", { status: 401 });
  const { fileId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return new Response("Tidak ditemukan", { status: 404 });
  const f = await getFileForWorker(fileId);
  if (!f) return new Response("Tidak ditemukan", { status: 404 });
  try {
    const { stream, size } = await openStream(f.key);
    return new Response(stream, { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(size), "Cache-Control": "no-store" } });
  } catch {
    return new Response("File sudah tidak ada", { status: 410 });
  }
}
