// Persiapan build Cloudflare Workers (jalankan di checkout CI sekali pakai, SEBELUM `opennextjs-cloudflare build`).
// Membuang /api/og: next/og membawa resvg.wasm (~518 KiB gzip) dan membuat Worker melewati batas 3 MiB Free.
// Kartu Open Graph jatuh ke /og.png statis lewat OG_STATIC=1 (src/lib/og.ts).
import { rmSync } from "node:fs";

rmSync("src/app/api/og", { recursive: true, force: true });
console.log("dibuang: src/app/api/og (OG_STATIC=1 wajib di build dan runtime)");

// postgres.js: bundler memilih build Node (node:net + node:tls) yang di workerd gagal saat upgrade TLS
// ("Cannot call releaseLock() on a reader with outstanding read promises"). Build resmi untuk Workers ada di
// postgres/cf (cloudflare:sockets + startTls) tetapi (1) tidak diekspor lewat package exports dan (2) literal
// `import('cloudflare:sockets')` membuat esbuild OpenNext gagal ("Could not resolve"). Solusi KHUSUS build Workers
// (file ini hanya dijalankan di sana): salin cf/src ke src/lib/db/pg-cf, samarkan specifier agar tidak dianalisis
// bundler (workerd me-resolve-nya saat runtime), lalu arahkan impor di src/lib/db/index.ts ke salinan itu.
import { cpSync, readFileSync, writeFileSync } from "node:fs";

cpSync("node_modules/postgres/cf", "src/lib/db/pg-cf", { recursive: true });
const poly = "src/lib/db/pg-cf/polyfills.js";
const polySrc = readFileSync(poly, "utf8");
const needle = "await import('cloudflare:sockets')";
if (!polySrc.includes(needle)) throw new Error("prepare: pola cloudflare:sockets tidak ditemukan di polyfills.js");
writeFileSync(poly, polySrc.replace(needle, "await import(/* turbopackIgnore: true */ /* webpackIgnore: true */ ['cloudflare', 'sockets'].join(':'))"));

const dbFile = "src/lib/db/index.ts";
const src = readFileSync(dbFile, "utf8");
const from = 'import postgres, { type Sql } from "postgres";';
if (!src.includes(from)) throw new Error(`prepare: baris impor postgres tidak ditemukan di ${dbFile}`);
writeFileSync(
  dbFile,
  src.replace(
    from,
    '// @ts-ignore -- build cf tidak punya tipe; API sama dengan paket utama\nimport postgresCf from "./pg-cf/src/index.js";\nimport type PostgresFn from "postgres";\nimport type { Sql } from "postgres";\nconst postgres = postgresCf as unknown as typeof PostgresFn;',
  ),
);
console.log("dialihkan: postgres -> salinan postgres/cf (build Workers saja)");
