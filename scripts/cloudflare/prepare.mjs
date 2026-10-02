// Persiapan build Cloudflare Workers (jalankan di checkout CI sekali pakai, SEBELUM `opennextjs-cloudflare build`).
// Membuang /api/og: next/og membawa resvg.wasm (~518 KiB gzip) dan membuat Worker melewati batas 3 MiB Free.
// Kartu Open Graph jatuh ke /og.png statis lewat OG_STATIC=1 (src/lib/og.ts).
import { rmSync } from "node:fs";

rmSync("src/app/api/og", { recursive: true, force: true });
console.log("dibuang: src/app/api/og (OG_STATIC=1 wajib di build dan runtime)");
