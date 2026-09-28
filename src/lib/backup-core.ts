/**
 * Inti backup database (tanpa "server-only" supaya bisa dipakai script restore/keygen).
 *
 * Format file .rlsbak:
 *   "RLSBAK01" | u16 panjang kunci efemeral | kunci publik X25519 efemeral (DER) | IV 12 byte | tag GCM 16 byte | ciphertext
 * Isi (setelah didekripsi): gzip dari JSON-lines — baris 1 = manifest, baris berikutnya = {"table": ..., "rows": [...]}.
 *
 * Enkripsi: X25519 (ECDH) + HKDF-SHA256 + AES-256-GCM. Server hanya memegang KUNCI PUBLIK, jadi backup yang
 * tersimpan tidak bisa dibaca walau server/penyimpanan bocor. Kunci privat disimpan pemilik (bukan di server).
 */
import { createCipheriv, createDecipheriv, createHash, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import type { Sql } from "postgres";

const MAGIC = Buffer.from("RLSBAK01");
const INFO = "rilisin-backup-v1";

/**
 * Urutan tabel = urutan aman untuk restore (induk sebelum anak).
 * Tidak di-backup: sessions, auth_challenges, password_resets (token sensitif & berumur pendek), rate_limits (sementara).
 */
export const BACKUP_TABLES = [
  "users",
  "recovery_codes",
  "security_events",
  "seller_profiles",
  "products",
  "product_media",
  "releases",
  "release_files",
  "blocked_hashes",
  "entitlements",
  "download_logs",
  "moderation_actions",
  "chat_rooms",
  "chat_messages",
  "chat_reactions",
  "chat_hidden_messages",
  "chat_reads",
  "chat_message_edits",
  "chat_mutes",
  "chat_uploads",
  "reports",
  "orders",
  "payment_events",
  "payout_accounts",
  "payouts",
  "ledger_entries",
  "product_reviews",
  "forum_categories",
  "forum_threads",
  "forum_replies",
  "forum_votes",
  "follows",
  "notifications",
  "job_runs",
  "system_kv",
] as const;

export type BackupManifest = {
  format: "rilisin-backup";
  version: 1;
  createdAt: string;
  migrations: number;
  tables: { name: string; rows: number; bytes: number }[];
};

// ─── Kunci ───────────────────────────────────────────────────────────────────
export function generateBackupKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("x25519");
  return {
    publicKey: (publicKey.export({ format: "der", type: "spki" }) as Buffer).toString("base64"),
    privateKey: (privateKey.export({ format: "der", type: "pkcs8" }) as Buffer).toString("base64"),
  };
}

export function keyFingerprint(publicKeyB64: string) {
  return createHash("sha256").update(Buffer.from(publicKeyB64.trim(), "base64")).digest("hex").slice(0, 16);
}

export function encryptBackup(plain: Buffer, publicKeyB64: string) {
  const recipient = createPublicKey({ key: Buffer.from(publicKeyB64.trim(), "base64"), format: "der", type: "spki" });
  const eph = generateKeyPairSync("x25519");
  const ephDer = eph.publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const shared = diffieHellman({ privateKey: eph.privateKey, publicKey: recipient });
  const key = Buffer.from(hkdfSync("sha256", shared, ephDer, INFO, 32));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const len = Buffer.alloc(2);
  len.writeUInt16BE(ephDer.length);
  return Buffer.concat([MAGIC, len, ephDer, iv, cipher.getAuthTag(), ct]);
}

export function decryptBackup(file: Buffer, privateKeyB64: string) {
  if (!file.subarray(0, 8).equals(MAGIC)) throw new Error("Bukan file backup Rilisin (.rlsbak)");
  const len = file.readUInt16BE(8);
  const ephDer = file.subarray(10, 10 + len);
  const iv = file.subarray(10 + len, 22 + len);
  const tag = file.subarray(22 + len, 38 + len);
  const ct = file.subarray(38 + len);
  const priv = createPrivateKey({ key: Buffer.from(privateKeyB64.trim(), "base64"), format: "der", type: "pkcs8" });
  const shared = diffieHellman({ privateKey: priv, publicKey: createPublicKey({ key: ephDer, format: "der", type: "spki" }) });
  const key = Buffer.from(hkdfSync("sha256", shared, ephDer, INFO, 32));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

// ─── Ekspor / impor ─────────────────────────────────────────────────────────
// Data tiap tabel diubah jadi JSON OLEH POSTGRES (json_agg) dan dipulihkan dengan jsonb_populate_recordset:
// kolom dicocokkan per nama, tipe (enum, array, jsonb, timestamptz) dikonversi server, angka tidak pernah
// di-parse JavaScript (bigint aman). Tanpa COPY stream (postgres.js bisa macet memakai ulang koneksi setelah COPY besar).
const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
const CHUNK = 10_000;

/** Ekspor seluruh data penting jadi satu bundle (gzip, belum dienkripsi) dari SATU snapshot konsisten. */
export async function exportDatabase(sql: Sql) {
  const lines: string[] = [];
  const tables: BackupManifest["tables"] = [];
  let migrations = 0;
  await sql.begin("isolation level repeatable read read only", async (tx) => {
    for (const table of BACKUP_TABLES) {
      const [{ n }] = await tx.unsafe<{ n: number }[]>(`select count(*)::int as n from ${ident(table)}`);
      let bytes = 0;
      for (let offset = 0; offset < Math.max(n, 1); offset += CHUNK) {
        const [{ data }] = await tx.unsafe<{ data: string }[]>(
          `select coalesce(jsonb_agg(t), '[]'::jsonb)::text as data from (select * from ${ident(table)} order by ctid limit ${CHUNK} offset ${offset}) t`,
        );
        bytes += data.length;
        lines.push(`{"table":${JSON.stringify(table)},"rows":${data}}`);
      }
      tables.push({ name: table, rows: n, bytes });
    }
    try {
      const [{ n }] = await tx.unsafe<{ n: number }[]>("select count(*)::int as n from drizzle.__drizzle_migrations");
      migrations = n;
    } catch {
      migrations = 0;
    }
  });
  const manifest: BackupManifest = { format: "rilisin-backup", version: 1, createdAt: new Date().toISOString(), migrations, tables };
  const bundle = gzipSync(Buffer.from([JSON.stringify(manifest), ...lines].join("\n")), { level: 9 });
  return { bundle, manifest };
}

/** Pecah bundle tanpa mem-parse isi data (teks JSON diteruskan apa adanya ke Postgres). */
export function parseBundle(bundle: Buffer) {
  const text = gunzipSync(bundle).toString("utf8");
  const [head, ...rest] = text.split("\n");
  const manifest = JSON.parse(head!) as BackupManifest;
  if (manifest.format !== "rilisin-backup" || manifest.version !== 1) throw new Error("Versi backup tidak dikenal");
  const data = new Map<string, string[]>();
  for (const line of rest) {
    if (!line) continue;
    const m = line.match(/^\{"table":"([a-z_]+)","rows":/);
    if (!m) throw new Error("Baris backup rusak");
    const json = line.slice(m[0].length, -1);
    data.set(m[1]!, [...(data.get(m[1]!) ?? []), json]);
  }
  return { manifest, data };
}

/**
 * Pulihkan bundle ke database yang SUDAH dimigrasi dan KOSONG (satu transaksi — gagal = tidak ada yang berubah).
 * Trigger penghitung ikut berjalan; skor vote (trigger inkremental) dihitung ulang di akhir supaya tidak dobel.
 */
export async function importDatabase(sql: Sql, bundle: Buffer) {
  const { manifest, data } = parseBundle(bundle);
  const result: { table: string; expected: number; actual: number }[] = [];
  await sql.begin(async (tx) => {
    for (const t of manifest.tables) {
      const chunks = data.get(t.name);
      if (!chunks) throw new Error(`Data tabel ${t.name} tidak ada di backup`);
      for (const json of chunks) {
        if (json === "[]") continue;
        // forum_threads ↔ forum_replies saling mereferensi: jawaban terbaik dipasang setelah balasan dipulihkan
        const rows = t.name === "forum_threads" ? `(select jsonb_agg(e - 'accepted_reply_id') from jsonb_array_elements($1::jsonb) e)` : "$1::jsonb";
        await tx.unsafe(`insert into ${ident(t.name)} select * from jsonb_populate_recordset(null::${ident(t.name)}, ${rows})`, [json]);
      }
    }
    for (const json of data.get("forum_threads") ?? []) {
      await tx.unsafe(
        `update forum_threads t set accepted_reply_id = (e->>'accepted_reply_id')::uuid
         from jsonb_array_elements($1::jsonb) e where t.id = (e->>'id')::uuid and e->>'accepted_reply_id' is not null`,
        [json],
      );
    }
    await tx.unsafe(`update forum_threads t set score = (select count(*) from forum_votes v where v.target_type = 'thread' and v.target_id = t.id)`);
    await tx.unsafe(`update forum_replies r set score = (select count(*) from forum_votes v where v.target_type = 'reply' and v.target_id = r.id)`);
    // Sequence bigserial dilanjutkan dari id terbesar
    const serials = await tx<{ table_name: string; column_name: string }[]>`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and column_default like 'nextval(%'`;
    for (const s of serials) {
      await tx.unsafe(
        `select setval(pg_get_serial_sequence('${s.table_name}', '${s.column_name}'), coalesce((select max(${ident(s.column_name)}) from ${ident(s.table_name)}), 1), (select count(*) > 0 from ${ident(s.table_name)}))`,
      );
    }
    for (const t of manifest.tables) {
      const [{ n }] = await tx.unsafe<{ n: number }[]>(`select count(*)::int as n from ${ident(t.name)}`);
      result.push({ table: t.name, expected: t.rows, actual: n });
    }
  });
  return { manifest, result, ok: result.every((r) => r.expected === r.actual) };
}
