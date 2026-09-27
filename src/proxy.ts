import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (dulu "middleware"): pasang Content-Security-Policy dengan nonce acak per request.
 * Hanya script ber-nonce (dari Next.js sendiri) yang boleh jalan → XSS jauh lebih sulit
 * dieksploitasi walaupun ada celah injeksi HTML.
 *
 * FRAME_ANCESTORS: siapa yang boleh menampilkan situs ini di dalam iframe.
 *   production  → 'none' (default, anti clickjacking)
 *   preview demo → * (preview sandbox menampilkan app di dalam iframe)
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const frameAncestors = process.env.FRAME_ANCESTORS?.trim() || "'none'";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // atribut style={...} dari React butuh 'unsafe-inline' (CSS tidak bisa menjalankan script)
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  if (request.headers.get("x-forwarded-proto") === "https" || request.nextUrl.protocol === "https:") {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|media|favicon.ico|icon.svg|robots.txt|\\.well-known).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
