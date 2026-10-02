// Laporan ukuran output build Worker: file terbesar + estimasi per paket.
// Pemakaian: node scripts/qa/bundle-report.mjs [direktori ...]  (default: .open-next .wrangler/out)
// Estimasi per paket: Turbopack menaruh tiap modul sebagai entri `"[project]/<path>": ...` di chunk,
// jadi ukuran satu modul = jarak ke penanda modul berikutnya. Angka pendekatan, bukan akuntansi persis.
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dirs = process.argv.slice(2).length ? process.argv.slice(2) : [".open-next", ".wrangler/out"];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) yield* walk(p);
    else yield [p, st.size];
  }
}

const files = [];
for (const d of dirs) if (existsSync(d)) files.push(...walk(d));
files.sort((a, b) => b[1] - a[1]);
console.log("## 30 file terbesar (KiB)");
for (const [p, s] of files.slice(0, 30)) console.log(`${(s / 1024).toFixed(0).padStart(7)}  ${p}`);

const MARK = /"\[project\]\/([^"]+)"\s*:\s*/g;
function groupOf(path) {
  const i = path.lastIndexOf("node_modules/");
  if (i === -1) return `[app] ${path.split("/").slice(0, 3).join("/")}`;
  const rest = path.slice(i + "node_modules/".length).split("/");
  return rest[0].startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
}

const totals = new Map();
for (const [p, size] of files) {
  if (!/\.(m?js)$/.test(p) || size < 20_000) continue;
  const text = readFileSync(p, "utf8");
  const marks = [...text.matchAll(MARK)];
  marks.forEach((m, k) => {
    const end = k + 1 < marks.length ? marks[k + 1].index : text.length;
    const g = groupOf(m[1]);
    totals.set(g, (totals.get(g) ?? 0) + (end - m.index));
  });
}
console.log("\n## Estimasi per paket/folder (KiB, sebelum gzip; duplikat antar file ikut terhitung)");
for (const [name, bytes] of [...totals].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
  console.log(`${(bytes / 1024).toFixed(0).padStart(7)}  ${name}`);
}
