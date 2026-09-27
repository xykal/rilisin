import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Satu koneksi pool per proses (di mode dev, simpan di globalThis supaya tidak bocor saat hot reload).
const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };

const client =
  globalForDb.pgClient ??
  postgres(process.env.DATABASE_URL!, {
    max: 10,
    // prepare:false agar kompatibel dengan connection pooler (Supabase transaction mode / PgBouncer)
    prepare: false,
    onnotice: () => {},
  });

if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
export { schema };
