import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Preview sandbox diakses lewat domain *.e2b.app (proxy). Di production, ganti dengan domain asli.
  allowedDevOrigins: ["*.e2b.app"],
  experimental: {
    serverActions: {
      allowedOrigins: ["*.e2b.app"],
      bodySizeLimit: "2mb",
    },
  },
  async rewrites() {
    // URL profil cantik: /@username -> /u/username
    return [{ source: "/@:username", destination: "/u/:username" }];
  },
};

export default nextConfig;
