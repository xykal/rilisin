/**
 * Pulihkan backup .rlsbak ke database KOSONG.
 *   BACKUP_PRIVATE_KEY=... DATABASE_URL=postgres://... npx tsx scripts/backup-restore.ts rilisin-20260929-020000.rlsbak
 * Pengaman:
 *  - database tujuan harus kosong (tabel users tidak berisi), kecuali --ganti (hapus semua isi dulu);
 *  - database non-lokal ditolak kecuali RESTORE_ALLOW_REMOTE=hapus-semua-data.
 * Langkah: dekripsi → migrasi skema → COPY data → pasang jawaban terbaik → hitung ulang skor → lanjutkan sequence → cocokkan jumlah baris.
 */
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { decryptBackup, importDatabase, parseBundle } from "../src/lib/backup-core";

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const replace = process.argv.includes("--ganti");
  const key = process.env.BACKUP_PRIVATE_KEY;
  if (!file || !key || !process.env.DATABASE_URL) {
    console.error("Pakai: BACKUP_PRIVATE_KEY=... DATABASE_URL=... npx tsx scripts/backup-restore.ts <file.rlsbak> [--ganti]");
    process.exit(1);
  }
  const host = new URL(process.env.DATABASE_URL).hostname;
  if (!["localhost", "127.0.0.1", "::1", "postgres"].includes(host) && process.env.RESTORE_ALLOW_REMOTE !== "hapus-semua-data") {
    console.error(`✗ Ditolak: DATABASE_URL mengarah ke "${host}". Restore ke database non-lokal butuh RESTORE_ALLOW_REMOTE=hapus-semua-data.`);
    process.exit(1);
  }
  const bundle = decryptBackup(readFileSync(file), key);
  const { manifest } = parseBundle(bundle);
  console.log(`» Backup ${manifest.createdAt} · ${manifest.tables.length} tabel · ${manifest.tables.reduce((s, t) => s + t.rows, 0)} baris`);

  const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    if (replace) {
      console.log("» Menghapus isi database tujuan (--ganti)…");
      await sql.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
    }
    console.log("» Migrasi skema…");
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from users`;
    if (n > 0) throw new Error("Database tujuan tidak kosong. Pakai --ganti kalau memang ingin menimpa.");
    const [{ m }] = await sql<{ m: number }[]>`select count(*)::int as m from drizzle.__drizzle_migrations`;
    if (manifest.migrations && m < manifest.migrations) throw new Error(`Skema tujuan lebih lama (${m} migrasi) dari backup (${manifest.migrations}). Update kode dulu.`);
    console.log("» Memulihkan data…");
    const r = await importDatabase(sql, bundle);
    for (const t of r.result) if (t.expected !== t.actual) console.error(`  ✗ ${t.table}: ${t.actual}/${t.expected} baris`);
    console.log(r.ok ? `✓ Restore selesai — ${r.result.length} tabel cocok dengan backup.` : "✗ Restore selesai dengan selisih jumlah baris (lihat di atas).");
    if (!r.ok) process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
