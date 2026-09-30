import { and, eq } from "drizzle-orm";
import { apiError } from "@/lib/api";
import { authBearer, bearerScopeError, type ApiScope, type BearerAuth } from "@/lib/api-keys";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { sharedLimit } from "@/lib/rate-limit";

/**
 * Auth khusus API v1 (mesin-ke-mesin): HANYA Bearer API key, tanpa session cookie.
 * Tanpa cookie = tidak ada permukaan CSRF → cek origin dilewati dengan aman.
 */
export async function v1auth(req: Request, scope: ApiScope): Promise<{ auth: BearerAuth } | { error: Response }> {
  const auth = await authBearer(req);
  if (!auth) return { error: apiError(401, "API key tidak valid. Pakai header Authorization: Bearer rsk_...") };
  const scopeErr = bearerScopeError(auth, scope);
  if (scopeErr) return { error: apiError(403, scopeErr) };
  const rl = await sharedLimit(`v1:${auth.keyId}`, 300, 60_000);
  if (!rl.ok) return { error: apiError(429, "Terlalu banyak permintaan API.", { retryAfter: rl.retryAfterSec }) };
  return { auth };
}

/** Produk milik seller (dipakai endpoint v1 produk + rilis). */
export async function ownedProduct(productId: string, sellerId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return null;
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.sellerId, sellerId)))
    .limit(1);
  return product ?? null;
}
