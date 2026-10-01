import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Plus_Jakarta_Sans } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { HideOnRoutes } from "@/components/route-visibility";
import { SiteHeader } from "@/components/site-header";
import { isSimulationMode } from "@/lib/payments/provider";
import { SITE } from "@/lib/config";
import { appUrl } from "@/lib/email";
import { BRAND } from "@/config/brand";
import { getCurrentUser } from "@/lib/auth/current-user";
import { PushInit } from "@/components/push-init";
import { SwRegister } from "@/components/sw-register";
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
  authors: [{ name: `${BRAND.author} — ${BRAND.company}`, url: "https://github.com/xykal" }],
  creator: `${BRAND.author} — ${BRAND.company}`,
  publisher: BRAND.company,
  manifest: "/manifest.webmanifest",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://rilisin.xyverse.my.id"),
  appleWebApp: { capable: true, title: SITE.name, statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: SITE.name }],
  },
  twitter: { card: "summary_large_image", title: `${SITE.name} — ${SITE.tagline}`, description: SITE.description, images: ["/og.png"] },
};

export const viewport: Viewport = {
  themeColor: "#3D7AF0",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android Chrome: layout ikut mengecil saat keyboard muncul (kolom chat tidak tertutup keyboard)
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser().catch(() => null);
  const pushAppId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID?.trim() ?? "";
  const savedScale = (await cookies()).get("ui-scale")?.value;
  const uiScale = savedScale === "kecil" || savedScale === "besar" ? savedScale : "normal";
  return (
    <html lang="id" data-uiscale={uiScale} className={jakarta.variable}>
      <body className="min-h-screen font-sans antialiased">
        {/* Chat komunitas tampil fullscreen ala WA: banner + header situs disembunyikan di /komunitas & ruang chat. Form "baru" & aturan tetap pakai header. */}
        <HideOnRoutes pattern="^/komunitas(/(?!aturan|baru)[^/]+)?/?$">
          <div className="bg-ink px-4 py-2 text-center text-xs font-medium text-white/85">
            {isSimulationMode()
              ? "Prototype — produk, akun & obrolan adalah data demo. Pembayaran mode simulasi (tanpa uang sungguhan)."
              : "Versi uji — pembayaran lewat gateway Pakasir. Jangan membeli kalau tidak diminta tim."}
          </div>
          <SiteHeader />
        </HideOnRoutes>
        <main>{children}</main>
        <HideOnRoutes pattern="^/komunitas(/(?!aturan)[^/]+)?/?$">
          <SiteFooter />
        </HideOnRoutes>
        <PushInit userId={user?.id ?? null} appId={pushAppId} />
        <SwRegister />
      </body>
    </html>
  );
}
