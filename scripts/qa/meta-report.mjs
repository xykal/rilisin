// Laporan metafile esbuild (akurat): 20 input terbesar + total per paket.
// Pemakaian: node scripts/qa/meta-report.mjs meta.json
import { readFileSync } from "node:fs";

const meta = JSON.parse(readFileSync(process.argv[2], "utf8"));
const inputs = new Map();
for (const out of Object.values(meta.outputs)) {
  for (const [path, info] of Object.entries(out.inputs ?? {})) {
    inputs.set(path, (inputs.get(path) ?? 0) + info.bytesInOutput);
  }
}
function groupOf(path) {
  const i = path.lastIndexOf("node_modules/");
  if (i === -1) return `[app] ${path.split("/").slice(0, 3).join("/")}`;
  const rest = path.slice(i + "node_modules/".length).split("/");
  return rest[0].startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
}
const pkgs = new Map();
let total = 0;
for (const [p, b] of inputs) {
  pkgs.set(groupOf(p), (pkgs.get(groupOf(p)) ?? 0) + b);
  total += b;
}
const kib = (b) => `${(b / 1024).toFixed(0).padStart(7)} KiB`;
console.log(`total terhitung: ${kib(total)}`);
console.log("\n## 20 input terbesar");
for (const [p, b] of [...inputs].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`${kib(b)}  ${p.slice(-120)}`);
console.log("\n## 20 paket/folder terbesar");
for (const [p, b] of [...pkgs].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`${kib(b)}  ${p}`);
