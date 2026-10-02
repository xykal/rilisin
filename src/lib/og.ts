import type { Metadata } from "next";
import { SITE } from "@/lib/config";
import { appUrl } from "@/lib/email";

/**
 * Kartu Open Graph bermerek. Gambar selalu di-render /api/og ( konsisten & bisa di-fetch crawler).
 * Cover produk TIDAK dipakai: URL media bertanda tangan / butuh login tidak bisa dibaca crawler WA/X/Discord.
 */
export function ogImageUrl(title: string, subtitle?: string): string {
  // Build Cloudflare Workers membuang /api/og (next/og = resvg.wasm, ~518 KiB gzip dari batas Worker 3 MiB)
  // dan memakai kartu statis. Lihat docs/CLOUDFLARE.md.
  if (process.env.OG_STATIC === "1") return `${appUrl()}/og.png`;
  const q = new URLSearchParams({ t: title.slice(0, 90) });
  if (subtitle?.trim()) q.set("s", subtitle.trim().slice(0, 140));
  return `${appUrl()}/api/og?${q.toString()}`;
}

/** openGraph + twitter card siap-spread ke return value generateMetadata. */
export function pageOg(title: string, description: string | undefined, path: string): Pick<Metadata, "openGraph" | "twitter"> {
  const desc = description?.trim() || SITE.description;
  const image = ogImageUrl(title, desc);
  return {
    openGraph: {
      title,
      description: desc,
      url: `${appUrl()}${path}`,
      siteName: SITE.name,
      locale: "id_ID",
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description: desc, images: [image] },
  };
}
