/** true bila kode berjalan di Cloudflare Workers (workerd), false di Node (Vercel/Docker/lokal). */
export const IN_WORKERS = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
