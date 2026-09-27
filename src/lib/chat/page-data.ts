import "server-only";
import type { CurrentUser } from "@/lib/auth/current-user";
import { mediaUrl } from "@/lib/storage";
import type { ChatViewerDTO } from "./shared";

export function viewerDTO(user: CurrentUser | null): ChatViewerDTO | null {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: mediaUrl(user.avatarKey),
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}
