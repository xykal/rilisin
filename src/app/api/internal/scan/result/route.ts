import { z } from "zod";
import { apiError, json, readJsonBody } from "@/lib/api";
import { isWorkerRequest, recordScanResult, scanWorkerToken } from "@/lib/scan";

const schema = z.object({
  fileId: z.string().uuid(),
  status: z.enum(["clean", "infected", "error"]),
  engine: z.string().min(1).max(200),
  signature: z.string().max(300).nullish(),
});

/** Worker melaporkan hasil pindai satu file. */
export async function POST(req: Request) {
  if (!scanWorkerToken()) return apiError(503, "Scan worker belum dikonfigurasi (SCAN_WORKER_TOKEN)");
  if (!isWorkerRequest(req)) return apiError(401, "Token worker salah");
  const parsed = schema.safeParse(await readJsonBody(req, 4096));
  if (!parsed.success) return apiError(400, "Data hasil scan tidak valid");
  const r = await recordScanResult(parsed.data);
  return r.found ? json(r) : apiError(404, "File tidak ditemukan");
}
