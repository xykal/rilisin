import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { HideOnRoutes } from "@/components/route-visibility";
import { SiteHeader } from "@/components/site-header";
import { SITE } from "@/lib/config";
import "./globals.css";

// Semua halaman membaca session (cookie) & data terbaru dari database.
export const dynamic = "force-dynamic";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: `${SITE.name} — ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
};

export const viewport: Viewport = {
  themeColor: "#5b43f5",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android Chrome: layout ikut mengecil saat keyboard muncul (kolom chat tidak tertutup keyboard)
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={jakarta.variable}>
      <body className="min-h-screen font-sans antialiased">
        <div className="bg-ink px-4 py-2 text-center text-xs font-medium text-white/85">
          Prototype — semua produk, akun &amp; obrolan adalah data demo. Pembayaran belum aktif.
        </div>
        <SiteHeader />
        <main>{children}</main>
        <HideOnRoutes pattern="^/komunitas(/(?!aturan)[^/]+)?/?$">
          <SiteFooter />
        </HideOnRoutes>
      </body>
    </html>
  );
}
