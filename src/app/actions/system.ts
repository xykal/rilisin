"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { runDaily } from "@/lib/maintenance";
import { sharedLimit } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security/events";

/** Jalankan pemeliharaan harian sekarang (pembersihan + backup) tanpa menunggu cron. Khusus admin. */
export async function runMaintenanceNowAction() {
  const admin = await requireAdmin("/admin/sistem");
  if (!(await sharedLimit(`maintenance:${admin.id}`, 3, 60 * 60_000)).ok) return;
  await logSecurityEvent("admin_maintenance", { userId: admin.id });
  await runDaily();
  revalidatePath("/admin/sistem");
}
