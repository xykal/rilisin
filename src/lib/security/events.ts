import "server-only";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { securityEvents } from "@/lib/db/schema";
import { clientIpFrom, hashIp } from "@/lib/http";
import type { SecurityEventType } from "./labels";

/**
 * Catat kejadian penting keamanan (login, gagal login, 2FA, ganti password, pesan diblokir,
 * aksi moderator). IP disimpan sebagai hash. Gagal mencatat tidak boleh menggagalkan aksi utama.
 */
export async function logSecurityEvent(
  type: SecurityEventType,
  opts: { userId?: string | null; meta?: Record<string, unknown>; req?: Request } = {},
) {
  try {
    const h = opts.req ? opts.req.headers : await headers();
    await db.insert(securityEvents).values({
      type,
      userId: opts.userId ?? null,
      ipHash: hashIp(clientIpFrom(h)),
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
      meta: opts.meta ?? null,
    });
  } catch (err) {
    console.error("[security] gagal mencatat event", type, err);
  }
}
