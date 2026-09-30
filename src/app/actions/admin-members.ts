"use server";

import { count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { moderationActions, users } from "@/lib/db/schema";

const ROLES = ["user", "moderator", "admin"] as const;
type Role = (typeof ROLES)[number];

/** Ubah peran user. Hanya admin; tidak bisa ubah diri sendiri; admin terakhir tidak bisa diturunkan. Tercatat di audit. */
export async function setRoleAction(formData: FormData) {
  const me = await requireAdmin("/admin/anggota");
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !(ROLES as readonly string[]).includes(role)) redirect("/admin/anggota?error=nilai");
  if (userId === me.id) redirect("/admin/anggota?error=self");
  const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target) redirect("/admin/anggota?error=hilang");
  if (target.role === role) redirect("/admin/anggota");
  if (target.role === "admin" && role !== "admin") {
    const [{ n }] = await db.select({ n: count() }).from(users).where(eq(users.role, "admin"));
    if ((n ?? 0) <= 1) redirect("/admin/anggota?error=terakhir");
  }
  await db.update(users).set({ role: role as Role }).where(eq(users.id, userId));
  await db.insert(moderationActions).values({ moderatorId: me.id, targetType: "user", targetId: userId, action: "set_role", note: `${target.role} → ${role}` });
  redirect("/admin/anggota?hasil=peran");
}
