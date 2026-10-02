import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { IN_WORKERS } from "@/lib/runtime";
import * as schema from "./schema";

type Handle = { client: Sql; db: PostgresJsDatabase<typeof schema> };

// Cloudflare Workers melarang soket/stream yang dibuat di satu request dipakai request lain
// ("Cannot perform I/O on behalf of a different request"), jadi di sana klien dibuat per request.

function create(url: string, max: number): Handle {
  // prepare:false agar kompatibel dengan connection pooler (PgBouncer / Hyperdrive)
  const client = postgres(url, { max, prepare: false, onnotice: () => {} });
  return { client, db: drizzle(client, { schema }) };
}

// Satu pool per proses di Node (Vercel/Docker). Disimpan di globalThis supaya tidak terduplikasi antar
// bundle route (Next.js bisa memuat modul yang sama lebih dari sekali) maupun saat hot reload.
const globalForDb = globalThis as unknown as { pgHandle?: Handle };
const perRequest = new WeakMap<object, Handle>();

function current(): Handle {
  if (!IN_WORKERS) {
    globalForDb.pgHandle ??= create(process.env.DATABASE_URL!, 10);
    return globalForDb.pgHandle;
  }
  const { env, ctx } = getCloudflareContext();
  let handle = perRequest.get(ctx);
  if (!handle) {
    const hyperdrive = (env as { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE;
    handle = create(hyperdrive?.connectionString ?? process.env.DATABASE_URL!, 5);
    perRequest.set(ctx, handle);
  }
  return handle;
}

function lazy<T extends object>(target: T, pick: () => object): T {
  const bindIfFn = (obj: object, prop: string | symbol) => {
    const v = Reflect.get(obj, prop);
    return typeof v === "function" ? v.bind(obj) : v;
  };
  return new Proxy(target, {
    get: (_t, prop) => bindIfFn(pick(), prop),
    apply: (_t, _this, args) => Reflect.apply(pick() as (...a: unknown[]) => unknown, undefined, args),
  });
}

export const pg = lazy((() => {}) as unknown as Sql, () => current().client);
export const db = lazy({} as PostgresJsDatabase<typeof schema>, () => current().db);
export { schema };
