import { timingSafeEqual } from "node:crypto";
import { apiError, json } from "@/lib/api";
import { runDaily } from "@/lib/maintenance";

export const maxDuration = 300;

/**
 * Tugas harian (pembersihan + backup terenkripsi). Dipanggil Vercel Cron sekali sehari — Vercel mengirim
 * header Authorization: Bearer <CRON_SECRET>. Tanpa CRON_SECRET endpoint ini mati (tidak bisa dipicu orang lain).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) return apiError(503, "CRON_SECRET belum diisi");
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return apiError(401, "Tidak diizinkan");
  return json(await runDaily());
}
