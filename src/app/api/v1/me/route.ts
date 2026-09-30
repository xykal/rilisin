import { apiError, json } from "@/lib/api";
import { authBearer } from "@/lib/api-keys";
import { sharedLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Identitas di balik API key (cek key valid + scope apa saja yang menempel). Scope apa pun boleh. */
export async function GET(req: Request) {
  const auth = await authBearer(req);
  if (!auth) return apiError(401, "API key tidak valid. Pakai header Authorization: Bearer rsk_...");
  const rl = await sharedLimit(`v1:${auth.keyId}`, 300, 60_000);
  if (!rl.ok) return apiError(429, "Terlalu banyak permintaan API.", { retryAfter: rl.retryAfterSec });
  return json({
    user: { id: auth.user.id, username: auth.user.username, role: auth.user.role, seller: auth.user.seller?.status ?? null },
    scopes: auth.scopes,
    key: { name: auth.keyName },
  });
}
