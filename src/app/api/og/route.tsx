import { ImageResponse } from "next/og";
import { SITE } from "@/lib/config";
import { BRAND } from "@/config/brand";

export const runtime = "edge";

/**
 * Gambar Open Graph generik 1200×630 (?t=judul&s=subjudul).
 * Dipakai semua halaman tanpa gambar khusus supaya link share selalu punya kartu bergaya.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get("t") || `${SITE.name} — ${SITE.tagline}`).slice(0, 90);
  const subtitle = (searchParams.get("s") || SITE.description).slice(0, 140);

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #1b1440 0%, #2b1d7a 45%, #5b43f5 100%)",
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 20,
              background: "white",
              color: "#5b43f5",
              fontSize: 48,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            R
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: 2 }}>{SITE.name.toUpperCase()}</div>
        </div>
        <div>
          <div style={{ fontSize: title.length > 48 ? 56 : 68, fontWeight: 800, lineHeight: 1.15 }}>{title}</div>
          {subtitle ? <div style={{ marginTop: 20, fontSize: 30, opacity: 0.85, lineHeight: 1.35 }}>{subtitle}</div> : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, opacity: 0.75 }}>
          <span>{SITE.tagline}</span>
          <span>{BRAND.company}</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
