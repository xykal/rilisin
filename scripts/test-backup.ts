/**
 * Uji bolak-balik backup (dipakai CI): ekspor database hasil seed → enkripsi → dekripsi → pulihkan ke database baru
 * → bandingkan jumlah baris & beberapa angka penting (saldo, rating, skor forum). Backup yang tidak pernah diuji
 * pulih = bukan backup.
 *   DATABASE_URL=postgres://... npx tsx scripts/test-backup.ts
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { decryptBackup, encryptBackup, exportDatabase, generateBackupKeyPair, importDatabase } from "../src/lib/backup-core";

const CHECKS = [
  ["saldo ledger", "select coalesce(sum(amount_idr), 0)::bigint as v from ledger_entries"],
  ["rating produk", "select coalesce(sum(rating_sum), 0)::bigint * 1000 + coalesce(sum(rating_count), 0) as v from products"],
  ["skor forum", "select (select coalesce(sum(score), 0) from forum_threads) * 1000 + (select coalesce(sum(score), 0) from forum_replies) as v"],
  ["jawaban terbaik", "select count(*) as v from forum_threads where accepted_reply_id is not null"],
  ["balasan tampil", "select coalesce(sum(reply_count), 0) as v from forum_threads"],
  ["pesan chat", "select count(*) as v from chat_messages"],
];

async function main() {
  const url = process.env.DATABASE_URL!;
  const src = postgres(url, { max: 1, onnotice: () => {} });
  const { publicKey, privateKey } = generateBackupKeyPair();
  const { bundle, manifest } = await exportDatabase(src);
  const enc = encryptBackup(bundle, publicKey);
  let tampered = false;
  try {
    const bad = Buffer.from(enc);
    bad[bad.length - 5] ^= 0xff;
    decryptBackup(bad, privateKey);
  } catch {
    tampered = true;
  }
  if (!tampered) throw new Error("File backup yang diubah seharusnya ditolak (GCM)");
  const wrongKey = generateBackupKeyPair().privateKey;
  let wrongRejected = false;
  try {
    decryptBackup(enc, wrongKey);
  } catch {
    wrongRejected = true;
  }
  if (!wrongRejected) throw new Error("Kunci privat yang salah seharusnya gagal membuka backup");
  const plain = decryptBackup(enc, privateKey);
  console.log(`✓ Ekspor ${manifest.tables.length} tabel (${manifest.tables.reduce((s, t) => s + t.rows, 0)} baris) → ${(enc.length / 1024).toFixed(0)} KB terenkripsi; file rusak & kunci salah ditolak`);

  const target = "rilisin_restore_test";
  await src.unsafe(`drop database if exists ${target}`);
  await src.unsafe(`create database ${target}`);
  const u = new URL(url);
  u.pathname = `/${target}`;
  const dst = postgres(u.toString(), { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(dst), { migrationsFolder: "drizzle" });
    const r = await importDatabase(dst, plain);
    const diff = r.result.filter((t) => t.expected !== t.actual);
    if (diff.length) throw new Error(`Jumlah baris beda: ${diff.map((d) => `${d.table} ${d.actual}/${d.expected}`).join(", ")}`);
    console.log(`✓ Restore ${r.result.length} tabel, jumlah baris cocok`);
    for (const [label, q] of CHECKS) {
      const [[a], [b]] = await Promise.all([src.unsafe<{ v: string }[]>(q), dst.unsafe<{ v: string }[]>(q)]);
      if (String(a!.v) !== String(b!.v)) throw new Error(`${label} beda: asli ${a!.v}, hasil restore ${b!.v}`);
      console.log(`✓ ${label} sama (${a!.v})`);
    }
    const [{ next }] = await dst<{ next: string }[]>`select nextval(pg_get_serial_sequence('notifications', 'id'))::text as next`;
    const [{ max }] = await src<{ max: string }[]>`select coalesce(max(id), 0)::text as max from notifications`;
    if (BigInt(next) <= BigInt(max)) throw new Error("Sequence tidak dilanjutkan setelah restore");
    console.log("✓ Sequence id dilanjutkan dari nilai terbesar");
  } finally {
    await dst.end();
    await src.unsafe(`drop database if exists ${target}`);
    await src.end();
  }
  console.log("\nUji backup & restore lulus.");
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
