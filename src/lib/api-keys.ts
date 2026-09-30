import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, or, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { getUserById, type CurrentUser } from "@/lib/auth/current-user";
import { API_SCOPES, type ApiScope } from "./api-key-scopes";

export { API_SCOPES, SCOPE_LABELS } from "./api-key-scopes";
export type { ApiScope } from "./api-key-scopes";

/**
 * API key buat integrasi & AI agent (dipakai di header `Authorization: Bearer rsk_...`).
 * Hanya hash yang disimpan; scope menempel di key (bukan di user) supaya bisa dibatasi per agen.
 * SERVER SAJA (import db/session) — komponen browser butuh scope? import dari @/lib/api-key-scopes.
 */

export function hashKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function newSecret(): { secret: string; prefix: string } {
  const rand = randomBytes(24).toString("base64url");
  return { secret: `rsk_${rand}`, prefix: `rsk_${rand.slice(0, 6)}` };
}

export async function createApiKey(
  userId: string,
  opts: { name: string; scopes: ApiScope[]; expiresAt: Date | null },
): Promise<{ id: string; secret: string; prefix: string }> {
  const { secret, prefix } = newSecret();
  const [row] = await db
    .insert(apiKeys)
    .values({ userId, name: opts.name, keyHash: hashKey(secret), prefix, scopes: [...opts.scopes], expiresAt: opts.expiresAt })
    .returning({ id: apiKeys.id });
  return { id: row!.id, secret, prefix };
}

export async function revokeApiKey(userId: string, keyId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(keyId)) return false;
  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  return Boolean(row);
}

export type BearerAuth = { user: CurrentUser; scopes: ApiScope[]; keyId: string; keyName: string };

/** Validasi `Authorization: Bearer rsk_...`. null = tidak ada / tidak valid / kedaluwarsa / dicabut. */
export async function authBearer(req: Request): Promise<BearerAuth | null> {
  const m = /^Bearer (rsk_[A-Za-z0-9_-]{16,64})$/.exec(req.headers.get("authorization")?.trim() ?? "");
  if (!m) return null;
  const now = new Date();
  const [key] = await db
    .select({ id: apiKeys.id, userId: apiKeys.userId, name: apiKeys.name, scopes: apiKeys.scopes })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashKey(m[1]!)), isNull(apiKeys.revokedAt), or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now))))
    .limit(1);
  if (!key) return null;
  const user = await getUserById(key.userId);
  if (!user) return null;
  db.update(apiKeys).set({ lastUsedAt: now }).where(eq(apiKeys.id, key.id)).catch(() => {});
  return { user, scopes: (key.scopes ?? []).filter((s): s is ApiScope => (API_SCOPES as readonly string[]).includes(s)), keyId: key.id, keyName: key.name };
}

/** Cek scope key. Seller:write/read butuh toko approved; admin:read butuh peran staf. */
export function bearerScopeError(auth: BearerAuth, scope: ApiScope): string | null {
  if (!auth.scopes.includes(scope)) return `API key tidak punya scope ${scope}.`;
  if (scope.startsWith("seller:") && auth.user.seller?.status !== "approved") return "Butuh toko yang sudah disetujui.";
  if (scope.startsWith("admin:") && auth.user.role !== "admin" && auth.user.role !== "moderator") return "Butuh peran moderator/admin.";
  return null;
}
