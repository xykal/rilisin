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

function groupOf(path) {
  const i = path.lastIndexOf("node_modules/");
  if (i === -1) return `[app] ${path.replace(/^(\.\.\/)+/, "").split("/").slice(0, 3).join("/")}`;
  const rest = path.slice(i + "node_modules/".length).split("/");
  return rest[0].startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
}

// Output final wrangler (tidak di-minify) memuat komentar esbuild `// <path>` sebelum tiap modul.
// Ukuran modul = jarak ke komentar path berikutnya. Pendekatan, bukan akuntansi persis.
const PATH_COMMENT = /^\/\/ ((?:\.\.?\/|[\w@.[-]+\/)[^\n]*\.(?:m?js|cjs|json|tsx?|wasm|txt))$/gm;
const bundle = files.find(([p]) => /\.wrangler\/out\/worker\.js$/.test(p));
if (bundle) {
  const text = readFileSync(bundle[0], "utf8");
  const marks = [...text.matchAll(PATH_COMMENT)];
  const perPkg = new Map();
  const perFile = [];
  marks.forEach((m, k) => {
    const end = k + 1 < marks.length ? marks[k + 1].index : text.length;
    const size = end - m.index;
    perPkg.set(groupOf(m[1]), (perPkg.get(groupOf(m[1])) ?? 0) + size);
    perFile.push([m[1], size]);
  });
  console.log(`\n## worker.js: ${marks.length} modul berkomentar. Per paket/folder (KiB mentah)`);
  for (const [n, b] of [...perPkg].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`${(b / 1024).toFixed(0).padStart(7)}  ${n}`);
  console.log("\n## worker.js: 20 modul terbesar (KiB mentah)");
  for (const [n, b] of perFile.sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`${(b / 1024).toFixed(0).padStart(7)}  ${n.slice(-110)}`);
}
