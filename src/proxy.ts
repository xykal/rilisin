import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (dulu "middleware"), jalan untuk SEMUA request kecuali aset statis:
 *
 * 1. Kunci situs (opsional, untuk staging): kalau SITE_LOCK_PASSWORD diisi, setiap request wajib HTTP Basic Auth —
 *    termasuk /api/* dan request prefetch (supaya kunci tidak bisa dilewati dengan header next-router-prefetch).
 *    Pengecualian: webhook payment gateway (dipanggil server gateway), berhenti-langganan satu klik dari email
 *    (dipanggil server Gmail/Yahoo, diotorisasi token HMAC), cron harian (CRON_SECRET), worker antivirus
 *    (SCAN_WORKER_TOKEN) & /.well-known/*.
 * 2. Content-Security-Policy dengan nonce acak per request untuk halaman (bukan API/prefetch).
 *    Hanya script ber-nonce (dari Next.js sendiri) yang boleh jalan → XSS jauh lebih sulit dieksploitasi.
 *
 * FRAME_ANCESTORS: siapa yang boleh menampilkan situs ini di dalam iframe.
 *   production → 'none' (default, anti clickjacking) · preview demo → *
 */
const LOCK_EXEMPT = /^\/(api\/payments\/[a-z]+\/webhook|api\/notifications\/unsubscribe$|api\/cron\/|api\/internal\/scan\/|\.well-known\/|robots\.txt$)/;

function sameSecret(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function siteLockOk(request: NextRequest) {
  const password = process.env.SITE_LOCK_PASSWORD;
  if (!password || LOCK_EXEMPT.test(request.nextUrl.pathname)) return true;
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const sep = decoded.indexOf(":");
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  return sep > 0 && sameSecret(user, process.env.SITE_LOCK_USER || "rilisin") && sameSecret(pass, password);
}

export function proxy(request: NextRequest) {
  if (!siteLockOk(request)) {
    // Rewrite ke route handler yang mengirim 401 + WWW-Authenticate (header ini dibuang Vercel kalau dikirim dari proxy)
    return NextResponse.rewrite(new URL("/api/site-lock", request.url));
  }

  const locked = Boolean(process.env.SITE_LOCK_PASSWORD);
  const path = request.nextUrl.pathname;
  const isPrefetch = request.headers.has("next-router-prefetch") || request.headers.get("purpose") === "prefetch";
  if (path.startsWith("/api/") || path.startsWith("/media/") || isPrefetch) {
    const res = NextResponse.next();
    if (locked) res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const frameAncestors = process.env.FRAME_ANCESTORS?.trim() || "'none'";
  const blob = process.env.STORAGE_DRIVER === "vercel-blob";
  const cloudinary = Boolean(process.env.CLOUDINARY_CLOUD_NAME);
  // Hibrida Cloudinary: gambar publik dari res.cloudinary.com (kalau env-nya terisi)
  // Cloudflare Turnstile: script (dimuat dengan nonce) + iframe tantangan dari challenges.cloudflare.com
  const cf = Boolean(process.env.TURNSTILE_SITE_KEY) ? " https://challenges.cloudflare.com" : "";
  // OneSignal push: SDK dari CDN + API (hanya kalau app id terisi; kalau tidak, push mati-aman)
  const pushCdn = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID?.trim() ? " https://cdn.onesignal.com" : "";
  const pushApi = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID?.trim() ? " https://onesignal.com https://*.onesignal.com" : "";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${cf}${pushCdn}${dev ? " 'unsafe-eval'" : ""}`,
    // atribut style={...} dari React butuh 'unsafe-inline' (CSS tidak bisa menjalankan script)
    "style-src 'self' 'unsafe-inline'",
    // Vercel Blob: gambar dari store publik, upload presigned ke vercel.com/api/blob, download = redirect ke store privat
    `img-src 'self' blob: data:${blob ? " https://*.public.blob.vercel-storage.com" : ""}${cloudinary ? " https://res.cloudinary.com" : ""}${pushCdn}`,
    "font-src 'self'",
    `connect-src 'self'${blob ? " https://vercel.com" : ""}${cf}${pushApi}`,
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self'${blob ? " https://*.private.blob.vercel-storage.com" : ""}`,
    `frame-ancestors ${frameAncestors}`,
    cf ? `frame-src${cf}` : "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  if (locked) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  if (request.headers.get("x-forwarded-proto") === "https" || request.nextUrl.protocol === "https:") {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
  return response;
}

export const config = {
  // Semua request kecuali aset statis build & ikon. Logika CSP/nonce hanya untuk halaman (dicek di dalam fungsi).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
