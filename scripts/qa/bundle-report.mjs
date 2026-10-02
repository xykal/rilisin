// Laporan isi bundle Worker per paket (dari esbuild metafile milik OpenNext).
// Pemakaian: node scripts/qa/bundle-report.mjs [.open-next] [jumlah-baris]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? ".open-next";
const top = Number(process.argv[3] ?? 30);

function* metaFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* metaFiles(p);
    else if (name.endsWith(".meta.json")) yield p;
  }
}

function groupOf(path) {
  const i = path.lastIndexOf("node_modules/");
  if (i === -1) return `[app] ${path.split("/").slice(0, 3).join("/")}`;
  const rest = path.slice(i + "node_modules/".length).split("/");
  return rest[0].startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
}

for (const file of metaFiles(root)) {
  const meta = JSON.parse(readFileSync(file, "utf8"));
  const totals = new Map();
  let sum = 0;
  for (const out of Object.values(meta.outputs ?? {})) {
    for (const [input, info] of Object.entries(out.inputs ?? {})) {
      const g = groupOf(input);
      totals.set(g, (totals.get(g) ?? 0) + info.bytesInOutput);
      sum += info.bytesInOutput;
    }
  }
  console.log(`\n## ${file} (total ${(sum / 1024).toFixed(0)} KiB sebelum gzip)`);
  const rows = [...totals].sort((a, b) => b[1] - a[1]).slice(0, top);
  for (const [name, bytes] of rows) console.log(`${(bytes / 1024).toFixed(0).padStart(7)} KiB  ${name}`);
}
