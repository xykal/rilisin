import { isProxiedDriver, openStream } from "@/lib/storage/proxied";

/** Menyajikan gambar publik (ikon, cover, screenshot) dari storage lokal. Di production diganti CDN R2. */
export async function GET(_req: Request, ctx: RouteContext<"/media/[...path]">) {
  if (!isProxiedDriver()) return new Response("Tidak ditemukan", { status: 404 }); // khusus driver local
  const { path } = await ctx.params;
  const key = `public/${path.join("/")}`;
  if (!key.endsWith(".webp")) return new Response("Not found", { status: 404 });
  try {
    const { stream, size } = await openStream(key);
    return new Response(stream, {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(size),
        // nama file selalu unik (ada id acak) → aman di-cache selamanya
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
