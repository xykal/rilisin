import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

// Domain tambahan yang boleh memanggil endpoint kita (selain domain app itu sendiri).
// Default: domain preview sandbox. Di production isi ALLOWED_ORIGINS=domainkamu.com
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "*.e2b.app")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function matchHost(pattern: string, host: string) {
  if (pattern.startsWith("*.")) {
    const base = pattern.slice(2).toLowerCase();
    const h = host.toLowerCase();
    return h.endsWith(`.${base}`) && !h.slice(0, -(base.length + 1)).includes(".");
  }
  return pattern.toLowerCase() === host.toLowerCase();
}

/** Proteksi CSRF untuk route handler POST/PUT: Origin harus dari app ini sendiri. */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host && originHost.toLowerCase() === host.toLowerCase()) return true;
  return EXTRA_ORIGINS.some((p) => matchHost(p, originHost));
}

export function clientIpFrom(h: Headers) {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function getClientIp() {
  return clientIpFrom(await headers());
}

/** IP tidak disimpan mentah (UU PDP) — cukup hash-nya untuk deteksi penyalahgunaan. */
export function hashIp(ip: string) {
  return createHash("sha256").update(`${ip}:${process.env.APP_SECRET ?? ""}`).digest("hex").slice(0, 32);
}
