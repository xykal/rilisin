import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Satu pool koneksi per proses. Disimpan di globalThis supaya tidak terduplikasi antar bundle
// route (Next.js bisa memuat modul yang sama lebih dari sekali) maupun saat hot reload.
const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };

export const pg =
  globalForDb.pgClient ??
  postgres(process.env.DATABASE_URL!, {
    max: 10,
    // prepare:false agar kompatibel dengan connection pooler (Supabase transaction mode / PgBouncer)
    prepare: false,
    onnotice: () => {},
  });

globalForDb.pgClient = pg;

export const db = drizzle(pg, { schema });
export { schema };
