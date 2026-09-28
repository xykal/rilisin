import "server-only";
import { randomUUID } from "node:crypto";
import { and, count, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { securityEvents } from "@/lib/db/schema";
import { hashIp } from "@/lib/http";

/**
 * Cloudflare Turnstile (captcha tanpa teka-teki). Aktif kalau TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY diisi.
 *  - strict (default): token wajib & diverifikasi ke Cloudflare.
 *  - soft (TURNSTILE_MODE=soft, khusus staging yang sudah dikunci Basic Auth): token diverifikasi kalau ada,
 *    tanpa token tetap lolos — supaya uji otomatis tanpa browser tetap jalan. JANGAN dipakai di produksi.
 * Uji otomatis (CI) memakai kunci uji resmi Cloudflare + token dummy XXXX.DUMMY.TOKEN.XXXX.
 */
export const TURNSTILE_FIELD = "cf-turnstile-response";

export function turnstileConfig() {
  const siteKey = process.env.TURNSTILE_SITE_KEY?.trim();
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!siteKey || !secret) return null;
  return { siteKey, secret, mode: process.env.TURNSTILE_MODE === "soft" ? ("soft" as const) : ("strict" as const) };
}

/** Yang boleh dikirim ke browser. */
export function turnstilePublic() {
  const cfg = turnstileConfig();
  return cfg ? { siteKey: cfg.siteKey } : null;
}

const TEST_SECRETS = /^[123]x0{31}AA$/;

export async function verifyTurnstile(formData: FormData, opts: { action: string; ip?: string | null }): Promise<{ ok: true } | { ok: false; reason: string }> {
  const cfg = turnstileConfig();
  if (!cfg) return { ok: true };
  const token = String(formData.get(TURNSTILE_FIELD) ?? "").trim();
  if (!token) {
    return cfg.mode === "soft" ? { ok: true } : { ok: false, reason: "Selesaikan verifikasi keamanan (kotak Cloudflare) dulu, lalu kirim lagi." };
  }
  if (token.length > 2048) return { ok: false, reason: "Verifikasi keamanan tidak valid. Muat ulang halaman." };
  try {
    const body = new URLSearchParams({ secret: cfg.secret, response: token, idempotency_key: randomUUID() });
    if (opts.ip && opts.ip !== "unknown") body.set("remoteip", opts.ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(8000) });
    const data = (await res.json()) as { success?: boolean; action?: string; hostname?: string; "error-codes"?: string[] };
    if (!data.success) {
      const expired = data["error-codes"]?.includes("timeout-or-duplicate");
      return { ok: false, reason: expired ? "Verifikasi keamanan kedaluwarsa. Centang ulang lalu kirim lagi." : "Verifikasi keamanan gagal. Coba lagi." };
    }
    // Kunci asli: pastikan token memang dibuat untuk aksi & domain ini (token dari form/situs lain ditolak).
    if (!TEST_SECRETS.test(cfg.secret)) {
      if (data.action && data.action !== opts.action) return { ok: false, reason: "Verifikasi keamanan tidak cocok untuk form ini. Muat ulang halaman." };
      const expectedHost = process.env.APP_URL ? new URL(process.env.APP_URL).hostname : null;
      if (expectedHost && data.hostname && data.hostname !== expectedHost) return { ok: false, reason: "Verifikasi keamanan dari domain lain ditolak." };
    }
    return { ok: true };
  } catch (err) {
    console.error("[turnstile] siteverify gagal", (err as Error).message);
    // Gagal tertutup: lebih baik pendaftaran tertunda daripada dibanjiri bot saat verifikasi tidak bisa dicek.
    return { ok: false, reason: "Verifikasi keamanan sedang bermasalah. Coba lagi sebentar lagi." };
  }
}

/** Login butuh Turnstile kalau dari IP ini sudah ≥ 3 kali salah password dalam 15 menit (pengguna normal tidak terganggu). */
export async function loginNeedsChallenge(ip: string) {
  if (!turnstileConfig()) return false;
  const [r] = await db
    .select({ n: count() })
    .from(securityEvents)
    .where(and(eq(securityEvents.type, "login_failed"), eq(securityEvents.ipHash, hashIp(ip)), gt(securityEvents.createdAt, new Date(Date.now() - 15 * 60_000))));
  return (r?.n ?? 0) >= 3;
}
