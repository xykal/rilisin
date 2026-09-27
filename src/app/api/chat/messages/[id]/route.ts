import { z } from "zod";
import { apiError, guardMutation, json, readJsonBody, UUID_RE } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { actorFrom, chatErrorResponse } from "@/lib/chat/api-helpers";
import {
  deleteForEveryone,
  editMessage,
  hideMessageForMe,
  muteAuthor,
  reportMessage,
  setPinned,
  toggleReaction,
} from "@/lib/chat/server";
import { MUTE_OPTIONS, REPORT_REASON_IDS } from "@/lib/chat/shared";

export const dynamic = "force-dynamic";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), body: z.string().max(8000) }),
  z.object({ action: z.literal("delete"), scope: z.enum(["me", "everyone"]) }),
  z.object({ action: z.literal("react"), emoji: z.string().min(1).max(16) }),
  z.object({ action: z.literal("report"), reason: z.enum(REPORT_REASON_IDS), note: z.string().max(500).optional() }),
  z.object({ action: z.literal("pin") }),
  z.object({ action: z.literal("unpin") }),
  z.object({
    action: z.literal("mute_author"),
    minutes: z.number().int().refine((m) => MUTE_OPTIONS.some((o) => o.minutes === m)),
    reason: z.string().max(200).optional(),
  }),
]);

/** Semua aksi pada satu pesan: edit, hapus (untuk saya / semua), reaksi, lapor, sematkan, bisukan. */
export async function POST(req: Request, ctx: RouteContext<"/api/chat/messages/[id]">) {
  const blocked = guardMutation(req);
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Silakan masuk dulu.");
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return apiError(404, "Pesan tidak ditemukan.");

  const parsed = actionSchema.safeParse(await readJsonBody(req));
  if (!parsed.success) return apiError(400, "Aksi tidak valid.");
  const actor = actorFrom(user);
  const a = parsed.data;
  try {
    switch (a.action) {
      case "edit":
        return json({ message: await editMessage(actor, id, a.body, req) });
      case "delete":
        return a.scope === "me"
          ? json(await hideMessageForMe(actor, id))
          : json({ message: await deleteForEveryone(actor, id, req) });
      case "react":
        return json({ message: await toggleReaction(actor, id, a.emoji) });
      case "report":
        return json(await reportMessage(actor, id, a.reason, a.note, req));
      case "pin":
      case "unpin":
        return json(await setPinned(actor, id, a.action === "pin"));
      case "mute_author":
        return json(await muteAuthor(actor, id, a.minutes, a.reason, req));
    }
  } catch (err) {
    return chatErrorResponse(err);
  }
}
