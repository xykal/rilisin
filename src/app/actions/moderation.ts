"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireStaff } from "@/lib/auth/guards";
import { actorFrom } from "@/lib/chat/api-helpers";
import { ChatError, deleteForEveryone, muteUser, resolveReportsFor, restoreReportedMessage } from "@/lib/chat/server";
import { MUTE_OPTIONS } from "@/lib/chat/shared";
import { dismissContentReports, hideContent, loadTarget, restoreContent } from "@/lib/community/reports";
import { CONTENT_TARGET_TYPES } from "@/lib/community/shared";
import { db } from "@/lib/db";
import { chatMessages, moderationActions, sessions, users } from "@/lib/db/schema";
import { logSecurityEvent } from "@/lib/security/events";

const uuid = z.string().uuid();

function done() {
  revalidatePath("/admin", "layout");
}

async function safely(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    if (!(err instanceof ChatError)) throw err;
  }
}

export async function deleteReportedMessageAction(formData: FormData) {
  const staff = await requireStaff("/admin/laporan");
  const id = uuid.parse(formData.get("messageId"));
  await safely(() => deleteForEveryone(actorFrom(staff), id));
  done();
}

export async function restoreReportedMessageAction(formData: FormData) {
  const staff = await requireStaff("/admin/laporan");
  const id = uuid.parse(formData.get("messageId"));
  await restoreReportedMessage(staff.id, id);
  await db.insert(moderationActions).values({ moderatorId: staff.id, targetType: "chat_message", targetId: id, action: "restore_message" });
  await logSecurityEvent("admin_restore_message", { userId: staff.id, meta: { messageId: id } });
  done();
}

export async function dismissReportsAction(formData: FormData) {
  const staff = await requireStaff("/admin/laporan");
  const id = uuid.parse(formData.get("messageId"));
  await resolveReportsFor(id, staff.id, "dismissed", "dismissed");
  await db.insert(moderationActions).values({ moderatorId: staff.id, targetType: "chat_message", targetId: id, action: "dismiss_reports" });
  await logSecurityEvent("admin_dismiss_report", { userId: staff.id, meta: { messageId: id } });
  done();
}

export async function muteAuthorFromReportAction(formData: FormData) {
  const staff = await requireStaff("/admin/laporan");
  const id = uuid.parse(formData.get("messageId"));
  const minutes = Number(formData.get("minutes"));
  if (!MUTE_OPTIONS.some((o) => o.minutes === minutes)) return;
  const [m] = await db.select({ authorId: chatMessages.authorId }).from(chatMessages).where(eq(chatMessages.id, id));
  if (!m) return;
  await safely(() => muteUser(actorFrom(staff), m.authorId, minutes, "Dari laporan anggota"));
  await resolveReportsFor(id, staff.id, `author_muted_${minutes}m`);
  done();
}

/** Blokir akun: tidak bisa login, semua sesi dicabut, pesan yang dilaporkan dihapus. Khusus admin. */
export async function banUserAction(formData: FormData) {
  const admin = await requireAdmin("/admin/laporan");
  const userId = uuid.parse(formData.get("userId"));
  const reason = String(formData.get("reason") ?? "").slice(0, 200) || "Pelanggaran aturan komunitas";
  const messageId = formData.get("messageId");
  if (userId === admin.id) return;
  const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  if (!target || target.role !== "user") return;
  await db.update(users).set({ bannedAt: new Date(), banReason: reason }).where(eq(users.id, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.insert(moderationActions).values({ moderatorId: admin.id, targetType: "user", targetId: userId, action: "ban", note: reason });
  await logSecurityEvent("admin_ban", { userId: admin.id, meta: { target: userId, reason } });
  if (typeof messageId === "string" && uuid.safeParse(messageId).success) {
    await safely(() => deleteForEveryone(actorFrom(admin), messageId));
    await resolveReportsFor(messageId, admin.id, "author_banned");
  }
  done();
}

export async function unbanUserAction(formData: FormData) {
  const admin = await requireAdmin("/admin/keamanan");
  const userId = uuid.parse(formData.get("userId"));
  await db.update(users).set({ bannedAt: null, banReason: null }).where(eq(users.id, userId));
  await db.insert(moderationActions).values({ moderatorId: admin.id, targetType: "user", targetId: userId, action: "unban" });
  await logSecurityEvent("admin_unban", { userId: admin.id, meta: { target: userId } });
  done();
}

// ─── Laporan forum & ulasan ─────────────────────────────────────────────────
const contentTarget = z.object({ targetType: z.enum(CONTENT_TARGET_TYPES), targetId: z.string().uuid() });

function readTarget(formData: FormData) {
  return contentTarget.parse({ targetType: formData.get("targetType"), targetId: formData.get("targetId") });
}

export async function hideContentAction(formData: FormData) {
  const staff = await requireStaff("/admin/laporan/konten");
  const t = readTarget(formData);
  await hideContent(staff.id, t.targetType, t.targetId, String(formData.get("reason") ?? ""));
  done();
}

export async function restoreContentAction(formData: FormData) {
  const staff = await requireStaff("/admin/laporan/konten");
  const t = readTarget(formData);
  await restoreContent(staff.id, t.targetType, t.targetId);
  done();
}

export async function dismissContentReportsAction(formData: FormData) {
  const staff = await requireStaff("/admin/laporan/konten");
  const t = readTarget(formData);
  await dismissContentReports(staff.id, t.targetType, t.targetId);
  done();
}

/** Blokir penulis konten yang dilaporkan + sembunyikan kontennya. Khusus admin. */
export async function banContentAuthorAction(formData: FormData) {
  const admin = await requireAdmin("/admin/laporan/konten");
  const t = readTarget(formData);
  const target = await loadTarget(t.targetType, t.targetId);
  if (!target || target.authorId === admin.id) return;
  const [author] = await db.select({ role: users.role }).from(users).where(eq(users.id, target.authorId));
  if (!author || author.role !== "user") return;
  const reason = String(formData.get("reason") ?? "").slice(0, 200) || "Pelanggaran aturan komunitas";
  await db.update(users).set({ bannedAt: new Date(), banReason: reason }).where(eq(users.id, target.authorId));
  await db.delete(sessions).where(eq(sessions.userId, target.authorId));
  await db.insert(moderationActions).values({ moderatorId: admin.id, targetType: "user", targetId: target.authorId, action: "ban", note: reason });
  await logSecurityEvent("admin_ban", { userId: admin.id, meta: { target: target.authorId, reason, from: t.targetType } });
  await hideContent(admin.id, t.targetType, t.targetId, reason);
  done();
}
