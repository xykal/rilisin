import type { NextConfig } from "next";

// Lihat src/proxy.ts untuk Content-Security-Policy (butuh nonce per request).
const frameAncestors = process.env.FRAME_ANCESTORS?.trim() || "'none'";
const frameOptions = frameAncestors === "'none'" ? "DENY" : frameAncestors === "'self'" ? "SAMEORIGIN" : null;

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // microphone=(self): pesan suara butuh getUserMedia; "()" bikin browser menolak TANPA dialog izin.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Origin-Agent-Cluster", value: "?1" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  ...(frameOptions ? [{ key: "X-Frame-Options", value: frameOptions }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Self-host (Docker): hasilkan server mandiri di .next/standalone. Vercel &
  // `next start` tetap jalan normal (dibuktikan CI tiap run).
  output: "standalone",
  // Preview sandbox diakses lewat domain *.e2b.app (proxy). Di production, ganti dengan domain asli.
  allowedDevOrigins: ["*.e2b.app"],
  experimental: {
    serverActions: {
      allowedOrigins: ["*.e2b.app"],
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // File unduhan & gambar: tidak boleh dieksekusi sebagai halaman (anti XSS lewat file upload)
      {
        source: "/api/storage/file",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; sandbox" }],
      },
      {
        source: "/media/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'; sandbox" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
  async rewrites() {
    // URL profil cantik: /@username -> /u/username
    return [{ source: "/@:username", destination: "/u/:username" }];
  },
};

export default nextConfig;
