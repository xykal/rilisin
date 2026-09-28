"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ContentError } from "@/lib/community/guard";
import { reportContent } from "@/lib/community/reports";
import { CONTENT_REPORT_REASON_IDS, CONTENT_TARGET_TYPES } from "@/lib/community/shared";
import type { FormState } from "./form-state";

const schema = z.object({
  targetType: z.enum(CONTENT_TARGET_TYPES),
  targetId: z.string().uuid(),
  reason: z.enum(CONTENT_REPORT_REASON_IDS, { message: "Pilih alasan laporan." }),
  note: z.string().max(500).optional(),
});

/** Lapor thread / balasan forum / ulasan. */
export async function reportContentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Masuk dulu untuk melapor." };
  const parsed = schema.safeParse({
    targetType: formData.get("targetType"),
    targetId: formData.get("targetId"),
    reason: formData.get("reason") ?? undefined,
    note: String(formData.get("note") ?? "") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Laporan tidak valid." };
  try {
    const r = await reportContent(user, parsed.data.targetType, parsed.data.targetId, parsed.data.reason, parsed.data.note);
    if (r.already) return { success: "Kamu sudah melaporkan ini sebelumnya. Moderator akan meninjaunya." };
    return { success: r.hidden ? "Terima kasih. Konten ini disembunyikan sementara sambil ditinjau moderator." : "Terima kasih, laporan terkirim ke moderator." };
  } catch (e) {
    if (e instanceof ContentError) return { error: e.message };
    throw e;
  }
}
