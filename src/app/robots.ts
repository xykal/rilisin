import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  // Situs uji coba (dikunci password) tidak boleh diindeks mesin pencari sama sekali
  if (process.env.SITE_LOCK_PASSWORD) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api", "/akun", "/library", "/seller", "/masuk", "/daftar", "/media/chat", "/beli", "/pesanan"],
      },
    ],
  };
}
