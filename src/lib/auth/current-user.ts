import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/lib/db";
import { sellerProfiles, sessions, users } from "@/lib/db/schema";
import { hashToken, readSessionToken } from "./session";

export type CurrentUser = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: "user" | "moderator" | "admin";
  avatarKey: string | null;
  bio: string | null;
  createdAt: Date;
  mfaEnabled: boolean;
  /** Email sudah diverifikasi? (dibutuhkan untuk jual/unduh, dipakai untuk banner di /akun). */
  emailVerifiedAt: Date | null;
  /** Hash token session yang sedang dipakai (untuk label "perangkat ini"). */
  sessionId: string;
  seller: { storeName: string; tagline: string | null; isTrusted: boolean; status: "pending" | "approved" | "rejected"; rejectionReason: string | null } | null;
};

const TOUCH_EVERY_MS = 5 * 60 * 1000;

/** User yang sedang login (di-cache per request). null kalau belum login / session habis / diblokir. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = await readSessionToken();
  if (!token) return null;
  const sessionId = hashToken(token);

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      avatarKey: users.avatarKey,
      bio: users.bio,
      createdAt: users.createdAt,
      emailVerifiedAt: users.emailVerifiedAt,
      bannedAt: users.bannedAt,
      totpEnabledAt: users.totpEnabledAt,
      lastSeenAt: sessions.lastSeenAt,
      storeName: sellerProfiles.storeName,
      tagline: sellerProfiles.tagline,
      isTrusted: sellerProfiles.isTrusted,
      sellerStatus: sellerProfiles.status,
      rejectionReason: sellerProfiles.rejectionReason,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(sellerProfiles, eq(sellerProfiles.userId, users.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row || row.bannedAt) return null;

  // Catat "terakhir aktif" paling sering tiap 5 menit (untuk daftar perangkat), tanpa menunggu.
  if (!row.lastSeenAt || Date.now() - row.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    db.update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.id, sessionId))
      .catch(() => {});
  }

  return toCurrentUser(row, sessionId);
});

type UserRow = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: "user" | "moderator" | "admin";
  avatarKey: string | null;
  bio: string | null;
  createdAt: Date;
  emailVerifiedAt: Date | null;
  totpEnabledAt: Date | null;
  storeName: string | null;
  tagline: string | null;
  isTrusted: boolean | null;
  sellerStatus: "pending" | "approved" | "rejected" | null;
  rejectionReason: string | null;
};

function toCurrentUser(row: UserRow, sessionId: string): CurrentUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    avatarKey: row.avatarKey,
    bio: row.bio,
    createdAt: row.createdAt,
    mfaEnabled: !!row.totpEnabledAt,
    emailVerifiedAt: row.emailVerifiedAt ?? null,
    sessionId,
    seller: row.storeName
      ? { storeName: row.storeName, tagline: row.tagline, isTrusted: row.isTrusted ?? false, status: row.sellerStatus ?? "pending", rejectionReason: row.rejectionReason ?? null }
      : null,
  };
}

/** User dari ID (untuk auth API key — tanpa session, tanpa touch lastSeen). null kalau diblokir. */
export async function getUserById(userId: string): Promise<CurrentUser | null> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      avatarKey: users.avatarKey,
      bio: users.bio,
      createdAt: users.createdAt,
      emailVerifiedAt: users.emailVerifiedAt,
      bannedAt: users.bannedAt,
      totpEnabledAt: users.totpEnabledAt,
      storeName: sellerProfiles.storeName,
      tagline: sellerProfiles.tagline,
      isTrusted: sellerProfiles.isTrusted,
      sellerStatus: sellerProfiles.status,
      rejectionReason: sellerProfiles.rejectionReason,
    })
    .from(users)
    .leftJoin(sellerProfiles, eq(sellerProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row || row.bannedAt) return null;
  return toCurrentUser(row, "api");
}

export function isStaff(user: Pick<CurrentUser, "role"> | null | undefined) {
  return user?.role === "admin" || user?.role === "moderator";
}
