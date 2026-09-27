import "server-only";
import { apiError } from "@/lib/api";
import type { CurrentUser } from "@/lib/auth/current-user";
import { ChatError, type ChatActor } from "./server";

export function actorFrom(user: CurrentUser): ChatActor {
  return { id: user.id, role: user.role, displayName: user.displayName, createdAt: user.createdAt };
}

export function chatErrorResponse(err: unknown) {
  if (err instanceof ChatError) {
    return apiError(err.status, err.message, { code: err.code, retryAfter: err.retryAfter });
  }
  console.error("[chat] error tak terduga", err);
  return apiError(500, "Terjadi kesalahan di server. Coba lagi sebentar.");
}
