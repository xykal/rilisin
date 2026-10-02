// Diet bundle Worker: kosongkan file besar yang ikut ter-inline wrangler tapi tidak dipakai jalur App Router.
// Dijalankan SESUDAH `opennextjs-cloudflare build` dan SEBELUM `wrangler deploy`.
// capsize-font-metrics.json (~4 MiB mentah, ~256 KiB gzip): tabel metrik font untuk optimasi font
// Pages Router. App ini hanya memakai App Router + next/font yang di-resolve saat build.
// Ada satu salinan per bundle (server function dan middleware), jadi semua salinan dicari.
import { lstatSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STUBS = { "capsize-font-metrics.json": "{}" };

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) yield* walk(p);
    else yield [p, st.size];
  }
}

let saved = 0;
for (const [p, size] of walk(".open-next")) {
  const base = p.split("/").pop();
  if (!(base in STUBS)) continue;
  writeFileSync(p, STUBS[base]);
  saved += size;
  console.log(`dikosongkan ${p}: ${(size / 1024).toFixed(0)} KiB`);
}
console.log(`total mentah dihemat: ${(saved / 1024).toFixed(0)} KiB`);
