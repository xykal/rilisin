import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });

async function main() {
  // DDL paling aman lewat koneksi langsung (bukan pooler): sebagian statement DDL
  // bisa gagal lewat PgBouncer mode transaksi. Di Vercel keduanya tersedia;
  // lokal/CI biasanya cuma punya DATABASE_URL → pakai itu sebagai cadangan.
  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL belum diisi — migrasi dibatalkan");
  console.log(`Migrasi database via koneksi ${process.env.DATABASE_URL_UNPOOLED ? "langsung" : "pooler"}…`);
  const client = postgres(connectionString, { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  await client.end();
  console.log("✓ Migrasi database selesai");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
