import "server-only";
import { signToken, verifyToken } from "@/lib/tokens";

/**
 * Anti-bot ringan tanpa captcha (Turnstile menyusul di Fase 4):
 *  1. Honeypot: input "website" tersembunyi — manusia tidak mengisinya, bot biasanya mengisi.
 *  2. Token waktu bertanda tangan: form yang dikirim < 1,5 detik setelah dibuka = bot.
 */
export const HONEYPOT_FIELD = "website";

export function issueFormToken() {
  return signToken("form", { t: Date.now() }, 60 * 60 * 24);
}

export function checkFormGuard(formData: FormData, opts: { minMs?: number; requireToken?: boolean } = {}) {
  if (String(formData.get(HONEYPOT_FIELD) ?? "").trim() !== "") return false;
  if (opts.requireToken === false) return true;
  const tok = verifyToken<{ t: number }>("form", String(formData.get("ft") ?? ""));
  if (!tok) return false;
  return Date.now() - tok.t >= (opts.minMs ?? 1500);
}
