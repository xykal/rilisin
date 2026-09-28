#!/usr/bin/env node
/**
 * Sinkronkan dokumen hukum (docs/legal/*.md) → modul konten untuk situs
 * (src/content/legal/*.ts).
 *
 * Kenapa perlu: dokumen hukum direview sebagai Markdown (mudah dibaca pengacara),
 * tapi halaman publik tidak boleh membaca file dari disk saat runtime (fungsi
 * serverless Vercel tidak selalu membawa file di luar jalur build). Jadi Markdown
 * tetap menjadi SATU sumber kebenaran, dan file TS di src/ adalah salinan hasil
 * generate yang wajib selalu sama — CI menjalankan `npm run legal:check` untuk
 * memastikan keduanya tidak berbeda.
 *
 * Pakai:  node scripts/sync-legal.mjs          (tulis)
 *         node scripts/sync-legal.mjs --check  (hanya periksa, exit 1 kalau beda)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "docs/legal");
const OUT = join(ROOT, "src/content/legal");
const CHECK = process.argv.includes("--check");

/** Escape isi markdown supaya aman ditaruh di template literal TypeScript. */
function toTemplateLiteral(text) {
  return text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

const files = readdirSync(SRC).filter((f) => f.endsWith(".md") && f !== "README.md").sort();
if (!files.length) {
  console.error("Tidak ada dokumen .md di docs/legal");
  process.exit(1);
}

let drift = 0;
if (!CHECK && !existsSync(OUT)) mkdirSync(OUT, { recursive: true });

for (const file of files) {
  const slug = file.replace(/\.md$/, "");
  const md = readFileSync(join(SRC, file), "utf8");
  const title = md.split("\n").find((l) => l.startsWith("# "))?.replace(/^#\s+/, "") ?? slug;
  const ts = `/**\n * ${title}\n *\n * DIBUAT OTOMATIS dari docs/legal/${file} — JANGAN diedit manual.\n * Perbarui dokumen Markdown-nya lalu jalankan: npm run legal:sync\n */\nexport const LEGAL_${slug.toUpperCase().replace(/[^A-Z0-9]/g, "_")} = \`\n${toTemplateLiteral(md)}\`;\n`;
  const target = join(OUT, `${slug}.ts`);
  const current = existsSync(target) ? readFileSync(target, "utf8") : null;
  if (CHECK) {
    if (current !== ts) {
      console.error(`BEDA: ${target} tidak sinkron dengan docs/legal/${file} (jalankan npm run legal:sync)`);
      drift++;
    }
  } else {
    writeFileSync(target, ts);
    console.log(`tulis ${target} (${md.length} karakter)`);
  }
}

if (CHECK && drift === 0) console.log(`Dokumen hukum sinkron (${files.length} berkas).`);
process.exit(drift ? 1 : 0);
