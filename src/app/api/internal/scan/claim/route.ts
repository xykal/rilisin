import { apiError, json, readJsonBody } from "@/lib/api";
import { claimFiles, isWorkerRequest, scanWorkerToken } from "@/lib/scan";

/** Worker antivirus mengambil antrean file (sewa 15 menit). Otorisasi: Authorization: Bearer <SCAN_WORKER_TOKEN>. */
export async function POST(req: Request) {
  if (!scanWorkerToken()) return apiError(503, "Scan worker belum dikonfigurasi (SCAN_WORKER_TOKEN)");
  if (!isWorkerRequest(req)) return apiError(401, "Token worker salah");
  const body = await readJsonBody<{ limit?: number; worker?: string; engine?: string }>(req, 2048);
  const files = await claimFiles({ limit: Number(body?.limit) || 3, worker: String(body?.worker ?? "worker"), engine: String(body?.engine ?? "tidak diketahui") });
  return json({ files });
}
