import { apiError, json, readJsonBody } from "@/lib/api";
import { clientIpFrom } from "@/lib/http";
import { handlePakasirWebhook } from "@/lib/payments/orders";
import { pakasirConfig, verifyPakasirWebhookSecret } from "@/lib/payments/provider";
import { rateLimit } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security/events";

/**
 * Webhook Pakasir v2 (dikirim saat transaksi berhasil).
 * Lapisan pengaman:
 *  1. Header X-Secret dibandingkan constant-time dengan PAKASIR_WEBHOOK_SECRET
 *  2. Body dibatasi 8 KB, di-parse sebagai JSON apa pun Content-Type-nya (contoh resmi mengirim tanpa header JSON)
 *  3. Status TIDAK dipercaya dari webhook: dikonfirmasi ulang ke API transaction-status (order_id, nominal, status)
 *  4. Nominal & txn_id harus sama dengan pesanan; transaksi sandbox tidak bisa melunasi pesanan live
 *  5. Idempoten: webhook yang sama dikirim ulang tidak menggandakan saldo/library
 */
export async function POST(req: Request) {
  const cfg = pakasirConfig();
  if (!cfg.webhookSecret || !cfg.apiKey || !cfg.slug) return apiError(404, "Tidak ditemukan");
  if (!rateLimit(`webhook:pakasir:${clientIpFrom(req.headers)}`, 120, 60_000).ok) return apiError(429, "Terlalu banyak permintaan");

  if (!verifyPakasirWebhookSecret(req.headers.get("x-secret"))) {
    await logSecurityEvent("payment_webhook_rejected", { req, meta: { provider: "pakasir", reason: "secret" } });
    return apiError(401, "Secret tidak valid");
  }
  const body = await readJsonBody<Record<string, unknown>>(req, 8 * 1024);
  if (!body || typeof body !== "object") return apiError(400, "Body tidak valid");

  try {
    const r = await handlePakasirWebhook(body);
    if (r.status >= 400) {
      await logSecurityEvent("payment_webhook_rejected", { req, meta: { provider: "pakasir", reason: r.result, order: String(body.order_id ?? "").slice(0, 40) } });
    }
    return json({ ok: r.status === 200, result: r.result }, r.status);
  } catch (err) {
    // API status gateway tidak bisa dihubungi → 502 supaya gateway mengirim ulang (polling di halaman pesanan tetap jalan)
    console.error("[webhook] pakasir gagal diproses", (err as Error).message);
    return apiError(502, "Konfirmasi status gagal, coba lagi");
  }
}
