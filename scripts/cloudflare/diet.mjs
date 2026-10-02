// Diet bundle Worker: kosongkan file besar yang ikut ter-inline wrangler tapi tidak dipakai jalur App Router.
// Dijalankan SESUDAH `opennextjs-cloudflare build` dan SEBELUM `wrangler deploy`.
// capsize-font-metrics.json (~4 MiB): tabel metrik font untuk optimasi font Pages Router.
// App ini hanya memakai App Router + next/font yang di-resolve saat build.
import { existsSync, statSync, writeFileSync } from "node:fs";

const TARGETS = [
  { file: ".open-next/server-functions/default/node_modules/next/dist/server/capsize-font-metrics.json", stub: "{}" },
];

for (const { file, stub } of TARGETS) {
  if (!existsSync(file)) {
    console.log(`lewati (tidak ada): ${file}`);
    continue;
  }
  const before = statSync(file).size;
  writeFileSync(file, stub);
  console.log(`dikosongkan ${file}: ${(before / 1024).toFixed(0)} KiB -> ${stub.length} B`);
}
