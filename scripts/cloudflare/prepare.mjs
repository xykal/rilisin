// Persiapan build Cloudflare Workers (jalankan di checkout CI sekali pakai, SEBELUM `opennextjs-cloudflare build`).
// Membuang /api/og: next/og membawa resvg.wasm (~518 KiB gzip) dan membuat Worker melewati batas 3 MiB Free.
// Kartu Open Graph jatuh ke /og.png statis lewat OG_STATIC=1 (src/lib/og.ts).
import { rmSync } from "node:fs";

rmSync("src/app/api/og", { recursive: true, force: true });
console.log("dibuang: src/app/api/og (OG_STATIC=1 wajib di build dan runtime)");

// postgres.js: bundler memilih build Node (node:net + node:tls) yang di workerd gagal saat upgrade TLS
// ("Cannot call releaseLock() on a reader with outstanding read promises"). Build resmi untuk Workers ada di
// postgres/cf (cloudflare:sockets + startTls) tetapi tidak diekspor lewat package exports, jadi diimpor via path
// relatif KHUSUS di build Workers. Build Node/Vercel/Docker tidak tersentuh (file ini hanya dijalankan di sini).
import { readFileSync, writeFileSync } from "node:fs";

const dbFile = "src/lib/db/index.ts";
const src = readFileSync(dbFile, "utf8");
const from = 'import postgres, { type Sql } from "postgres";';
if (!src.includes(from)) throw new Error(`prepare: baris impor postgres tidak ditemukan di ${dbFile}`);
writeFileSync(
  dbFile,
  src.replace(
    from,
    '// @ts-ignore -- build cf tidak punya tipe; bentuk API sama dengan paket utama\nimport postgres from "../../../node_modules/postgres/cf/src/index.js";\nimport type { Sql } from "postgres";',
  ),
);
console.log("dialihkan: postgres -> postgres/cf (build Workers saja)");
