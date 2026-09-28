/**
 * Uji worker antivirus dengan ClamAV SUNGGUHAN (workflow scanner.yml):
 *  - sisipkan file uji EICAR (standar industri, bukan malware sungguhan) ke antrean;
 *  - jalankan scanner/worker.mjs sekali (ONCE=1) terhadap app yang sedang berjalan;
 *  - pastikan EICAR terdeteksi → hash diblokir, file dihapus, rilis ditolak; file lain ditandai bersih.
 * Butuh: app di APP_URL (driver storage local), clamd di CLAMD_HOST:3310, DATABASE_URL, SCAN_WORKER_TOKEN.
 */
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

// Dirangkai saat jalan supaya file sumber ini sendiri tidak ditandai antivirus.
const EICAR = ["X5O!P%@AP[4\\PZX54(P^)7CC)7}$", "EICAR-STANDARD-ANTI", "VIRUS-TEST-FILE!$H+H*"].join("");

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  const root = path.resolve(process.env.STORAGE_LOCAL_DIR || ".local/storage");
  try {
    const [rel] = await sql<{ id: string }[]>`select id from releases where status = 'review' order by created_at limit 1`;
    if (!rel) throw new Error("Tidak ada rilis berstatus review di data seed");
    const key = `private/releases/${rel.id}/${randomBytes(6).toString("hex")}/uji-eicar.apk`;
    const data = Buffer.from(EICAR);
    mkdirSync(path.dirname(path.join(root, key)), { recursive: true });
    writeFileSync(path.join(root, key), data);
    const sha = createHash("sha256").update(data).digest("hex");
    const [file] = await sql<{ id: string }[]>`
      insert into release_files (release_id, platform, filename, storage_key, size_bytes, sha256, detected_type)
      values (${rel.id}, 'android', 'uji-eicar.apk', ${key}, ${data.length}, ${sha}, 'Uji EICAR') returning id`;
    const pendingBefore = await sql<{ id: string }[]>`select id from release_files where scan_status = 'pending' and id <> ${file!.id}`;
    console.log(`» ${pendingBefore.length + 1} file di antrean (termasuk file uji EICAR)`);

    const run = spawnSync("node", ["scanner/worker.mjs"], {
      env: { ...process.env, RILISIN_URL: process.env.APP_URL ?? "http://localhost:3000", ONCE: "1", WORKER_NAME: "ci-clamav" },
      stdio: "inherit",
      timeout: 20 * 60_000,
    });
    if (run.status !== 0) throw new Error(`worker keluar dengan kode ${run.status}`);

    const [eicar] = await sql<{ scan_status: string; scan_signature: string | null; scan_engine: string | null }[]>`select scan_status, scan_signature, scan_engine from release_files where id = ${file!.id}`;
    if (eicar?.scan_status !== "infected" || !/eicar/i.test(eicar.scan_signature ?? "")) throw new Error(`EICAR tidak terdeteksi: ${JSON.stringify(eicar)}`);
    console.log(`✓ EICAR terdeteksi: ${eicar.scan_signature} (${eicar.scan_engine})`);
    const [blocked] = await sql`select 1 from blocked_hashes where sha256 = ${sha}`;
    if (!blocked) throw new Error("Hash file terinfeksi tidak masuk daftar blokir");
    console.log("✓ Hash file terinfeksi diblokir (upload ulang otomatis ditolak)");
    if (existsSync(path.join(root, key))) throw new Error("File terinfeksi masih ada di penyimpanan");
    console.log("✓ File terinfeksi dihapus dari penyimpanan");
    const [r] = await sql<{ status: string }[]>`select status from releases where id = ${rel.id}`;
    if (r?.status !== "rejected") throw new Error(`Rilis seharusnya ditolak, sekarang: ${r?.status}`);
    console.log("✓ Rilis berisi malware otomatis ditolak");
    const ids = pendingBefore.map((p) => p.id);
    if (ids.length) {
      const rows = await sql<{ scan_status: string }[]>`select scan_status from release_files where id in ${sql(ids)}`;
      const notClean = rows.filter((x) => x.scan_status !== "clean");
      if (notClean.length) throw new Error(`${notClean.length} file bersih belum ditandai clean`);
      console.log(`✓ ${rows.length} file lain dipindai & ditandai bersih`);
    }
    const [kv] = await sql<{ value: { engine?: string } }[]>`select value from system_kv where key = 'scan_worker'`;
    if (!/clamav/i.test(kv?.value.engine ?? "")) throw new Error("Detak jantung worker tidak tercatat");
    console.log(`✓ Worker tercatat di halaman Sistem (${kv!.value.engine})`);
    console.log("\nUji antivirus lulus.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
