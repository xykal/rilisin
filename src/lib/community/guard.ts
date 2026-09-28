import "server-only";
import { isStaffRole } from "@/lib/chat/shared";
import { detectGamblingPromo, duplicateKey } from "@/lib/chat/filter";
import { countLinks, normalizeMessage } from "@/lib/chat/text";
import { logSecurityEvent } from "@/lib/security/events";

/** Error validasi konten yang aman ditampilkan ke user (field = nama input yang salah). */
export class ContentError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

export type ContentActor = { id: string; role: "user" | "moderator" | "admin"; createdAt: Date };

const NEW_ACCOUNT_LINK_HOURS = 24;

/** Rapikan teks masukan (karakter tak terlihat, bidi override, zalgo, baris kosong berlebihan). */
export const cleanText = normalizeMessage;

/**
 * Aturan konten forum & ulasan (sama semangatnya dengan chat):
 *  - promosi judi online diblokir & dicatat;
 *  - akun < 24 jam belum boleh menaruh link; batas jumlah link per postingan;
 *  - `allowLinks: false` = link tidak diizinkan sama sekali (mis. ulasan).
 */
export async function guardContent(
  actor: ContentActor,
  text: string,
  opts: { context: string; field: string; allowLinks: boolean; maxLinks?: number },
) {
  if (detectGamblingPromo(text)) {
    await logSecurityEvent("content_blocked", { userId: actor.id, meta: { context: opts.context, reason: "judol", sample: text.slice(0, 200) } });
    throw new ContentError("Diblokir: terdeteksi promosi judi online. Rilisin tidak menoleransi judol.", opts.field);
  }
  if (isStaffRole(actor.role)) return;
  const links = countLinks(text);
  if (!links) return;
  if (!opts.allowLinks) throw new ContentError("Link tidak diizinkan di sini (anti-spam).", opts.field);
  const ageHours = (Date.now() - actor.createdAt.getTime()) / 3_600_000;
  if (ageHours < NEW_ACCOUNT_LINK_HOURS) {
    throw new ContentError(
      `Akun baru belum bisa menaruh link (anti-spam). Coba lagi ${Math.ceil(NEW_ACCOUNT_LINK_HOURS - ageHours)} jam lagi.`,
      opts.field,
    );
  }
  if (opts.maxLinks !== undefined && links > opts.maxLinks) {
    throw new ContentError(`Maksimal ${opts.maxLinks} link per postingan.`, opts.field);
  }
}

export function sameText(a: string, b: string) {
  return duplicateKey(a) === duplicateKey(b);
}
