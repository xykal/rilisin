import "server-only";
import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  chatHiddenMessages,
  chatMessageEdits,
  chatMessages,
  chatMutes,
  chatReactions,
  chatReads,
  chatRooms,
  chatUploads,
  moderationActions,
  reports,
  sellerProfiles,
  users,
  type ChatRoom,
} from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security/events";
import { mediaUrl, storage } from "@/lib/storage";
import { detectGamblingPromo, duplicateKey } from "./filter";
import { signal, signalMessage } from "./notify";
import {
  ALLOWED_REACTIONS,
  CHAT_LIMITS,
  isStaffRole,
  snippet,
  type ChatMessageDTO,
  type ChatMuteDTO,
  type ChatReactionDTO,
  type ChatRole,
  type ChatRoomDTO,
  type ReportReason,
} from "./shared";
import { countLinks, normalizeMessage } from "./text";

export type ChatActor = { id: string; role: ChatRole; displayName: string; createdAt: Date };

/** Error yang aman ditampilkan ke user (status HTTP + pesan bahasa Indonesia). */
export class ChatError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

const jam = (d: Date | string) =>
  new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(new Date(d));

// ─── Baca pesan ──────────────────────────────────────────────────────────────
const reply = alias(chatMessages, "reply");
const replyAuthor = alias(users, "reply_author");

function selectMessages() {
  return db
    .select({
      id: chatMessages.id,
      seq: chatMessages.seq,
      roomId: chatMessages.roomId,
      clientId: chatMessages.clientId,
      body: chatMessages.body,
      imageKey: chatMessages.imageKey,
      imageW: chatMessages.imageW,
      imageH: chatMessages.imageH,
      createdAt: chatMessages.createdAt,
      updatedAt: chatMessages.updatedAt,
      editedAt: chatMessages.editedAt,
      deletedAt: chatMessages.deletedAt,
      deleteReason: chatMessages.deleteReason,
      reportHiddenAt: chatMessages.reportHiddenAt,
      authorId: users.id,
      authorUsername: users.username,
      authorName: users.displayName,
      authorAvatar: users.avatarKey,
      authorRole: users.role,
      sellerId: sellerProfiles.userId,
      sellerTrusted: sellerProfiles.isTrusted,
      replyId: reply.id,
      replyAuthorId: reply.authorId,
      replyAuthorName: replyAuthor.displayName,
      replyBody: reply.body,
      replyImage: reply.imageKey,
      replyDeletedAt: reply.deletedAt,
      replyHiddenAt: reply.reportHiddenAt,
    })
    .from(chatMessages)
    .innerJoin(users, eq(users.id, chatMessages.authorId))
    .leftJoin(sellerProfiles, eq(sellerProfiles.userId, users.id))
    .leftJoin(reply, eq(reply.id, chatMessages.replyToId))
    .leftJoin(replyAuthor, eq(replyAuthor.id, reply.authorId));
}

type MessageRow = Awaited<ReturnType<ReturnType<typeof selectMessages>["execute"]>>[number];

const notHiddenFor = (viewerId: string) =>
  sql`not exists (select 1 from ${chatHiddenMessages} h where h.user_id = ${viewerId} and h.message_id = ${chatMessages.id})`;

async function reactionsFor(ids: string[]) {
  const map = new Map<string, ChatReactionDTO[]>();
  if (!ids.length) return map;
  const rows = await db
    .select({
      messageId: chatReactions.messageId,
      emoji: chatReactions.emoji,
      userId: chatReactions.userId,
      name: users.displayName,
    })
    .from(chatReactions)
    .innerJoin(users, eq(users.id, chatReactions.userId))
    .where(inArray(chatReactions.messageId, ids))
    .orderBy(asc(chatReactions.createdAt));
  for (const r of rows) {
    const list = map.get(r.messageId) ?? [];
    let entry = list.find((e) => e.emoji === r.emoji);
    if (!entry) {
      entry = { emoji: r.emoji, count: 0, users: [] };
      list.push(entry);
    }
    entry.count++;
    if (entry.users.length < 50) entry.users.push({ id: r.userId, name: r.name });
    map.set(r.messageId, list);
  }
  for (const list of map.values()) list.sort((a, b) => b.count - a.count);
  return map;
}

function toDTO(row: MessageRow, reactions: Map<string, ChatReactionDTO[]>): ChatMessageDTO {
  const deleted = row.deletedAt ? (row.deleteReason === "moderator" ? "moderator" : "author") : null;
  const hidden = !deleted && !!row.reportHiddenAt;
  const visible = !deleted && !hidden;
  const replyUnavailable = !!(row.replyDeletedAt || row.replyHiddenAt);
  return {
    id: row.id,
    seq: row.seq,
    roomId: row.roomId,
    clientId: row.clientId,
    author: {
      id: row.authorId,
      username: row.authorUsername,
      displayName: row.authorName,
      avatarUrl: mediaUrl(row.authorAvatar),
      role: row.authorRole,
      isSeller: !!row.sellerId,
      isTrusted: !!row.sellerTrusted,
    },
    body: visible ? row.body : "",
    image:
      visible && row.imageKey
        ? { url: mediaUrl(row.imageKey)!, w: row.imageW ?? 800, h: row.imageH ?? 600 }
        : null,
    replyTo: row.replyId
      ? {
          id: row.replyId,
          authorId: row.replyAuthorId!,
          authorName: row.replyAuthorName ?? "Anggota",
          body: replyUnavailable ? "" : snippet(row.replyBody ?? "", 140),
          hasImage: !replyUnavailable && !!row.replyImage,
          unavailable: replyUnavailable,
        }
      : null,
    reactions: visible ? (reactions.get(row.id) ?? []) : [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    deleted,
    hiddenByReports: hidden,
  };
}

async function hydrate(rows: MessageRow[]) {
  const reactions = await reactionsFor(rows.filter((r) => !r.deletedAt && !r.reportHiddenAt).map((r) => r.id));
  return rows.map((r) => toDTO(r, reactions));
}

export async function listMessages(opts: {
  roomId: string;
  viewerId: string | null;
  beforeSeq?: number;
  limit?: number;
}) {
  const limit = Math.min(opts.limit ?? CHAT_LIMITS.pageSize, 100);
  const rows = await selectMessages()
    .where(
      and(
        eq(chatMessages.roomId, opts.roomId),
        opts.beforeSeq ? lt(chatMessages.seq, opts.beforeSeq) : undefined,
        opts.viewerId ? notHiddenFor(opts.viewerId) : undefined,
      ),
    )
    .orderBy(desc(chatMessages.seq))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  return { messages: await hydrate(rows.slice(0, limit).reverse()), hasMore };
}

/** Semua pesan yang berubah sejak waktu tertentu (dipakai saat koneksi realtime tersambung ulang). */
export async function syncMessages(opts: { roomId: string; viewerId: string; since: Date }) {
  const rows = await selectMessages()
    .where(
      and(
        eq(chatMessages.roomId, opts.roomId),
        gt(chatMessages.updatedAt, opts.since),
        notHiddenFor(opts.viewerId),
      ),
    )
    .orderBy(asc(chatMessages.seq))
    .limit(300);
  return hydrate(rows);
}

export async function getMessageDTO(id: string) {
  const rows = await selectMessages().where(eq(chatMessages.id, id)).limit(1);
  if (!rows.length) return null;
  return (await hydrate(rows))[0]!;
}

// ─── Ruang ───────────────────────────────────────────────────────────────────
export async function getRoomBySlug(slug: string) {
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return null;
  const [room] = await db.select().from(chatRooms).where(eq(chatRooms.slug, slug)).limit(1);
  return room ?? null;
}

function previewOf(r: { body: string | null; image: string | null; deleted: Date | null; hidden: Date | null }) {
  if (r.deleted) return "🚫 Pesan dihapus";
  if (r.hidden) return "⚠️ Pesan disembunyikan";
  if (r.image) return r.body ? `📷 ${snippet(r.body, 60)}` : "📷 Foto";
  return snippet(r.body ?? "", 70);
}

export async function getRoomsForViewer(viewerId: string | null): Promise<ChatRoomDTO[]> {
  const unreadExpr = viewerId
    ? sql`case when cr.user_id is null then null else (
        select count(*)::int from ${chatMessages} m
        where m.room_id = r.id and m.seq > cr.last_read_seq and m.author_id <> ${viewerId} and m.deleted_at is null
      ) end`
    : sql`null::int`;
  const readJoin = viewerId
    ? sql`left join ${chatReads} cr on cr.room_id = r.id and cr.user_id = ${viewerId}`
    : sql``;
  const rows = await db.execute<{
    id: string;
    slug: string;
    name: string;
    emoji: string;
    description: string;
    kind: "public" | "announcement";
    slow_mode_sec: number;
    pinned_message_id: string | null;
    lm_body: string | null;
    lm_image: string | null;
    lm_deleted: Date | null;
    lm_hidden: Date | null;
    lm_at: Date | null;
    lm_author: string | null;
    unread: number | null;
  }>(sql`
    select r.id, r.slug, r.name, r.emoji, r.description, r.kind, r.slow_mode_sec, r.pinned_message_id,
      lm.body as lm_body, lm.image_key as lm_image, lm.deleted_at as lm_deleted,
      lm.report_hidden_at as lm_hidden, lm.created_at as lm_at, lu.display_name as lm_author,
      ${unreadExpr} as unread
    from ${chatRooms} r
    left join lateral (
      select m.body, m.image_key, m.deleted_at, m.report_hidden_at, m.created_at, m.author_id
      from ${chatMessages} m where m.room_id = r.id order by m.seq desc limit 1
    ) lm on true
    left join ${users} lu on lu.id = lm.author_id
    ${readJoin}
    order by r.sort asc, r.created_at asc
  `);
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    emoji: r.emoji,
    description: r.description,
    kind: r.kind,
    slowModeSec: r.slow_mode_sec,
    pinnedMessageId: r.pinned_message_id,
    lastMessage: r.lm_at
      ? {
          authorName: r.lm_author ?? "Anggota",
          preview: previewOf({ body: r.lm_body, image: r.lm_image, deleted: r.lm_deleted, hidden: r.lm_hidden }),
          at: new Date(r.lm_at).toISOString(),
        }
      : null,
    unread: r.unread == null ? null : Number(r.unread),
  }));
}

export async function getReadSeq(userId: string, roomId: string) {
  const [r] = await db
    .select({ seq: chatReads.lastReadSeq })
    .from(chatReads)
    .where(and(eq(chatReads.userId, userId), eq(chatReads.roomId, roomId)))
    .limit(1);
  return r?.seq ?? null;
}

export async function markRead(userId: string, roomId: string, seq: number) {
  await db
    .insert(chatReads)
    .values({ userId, roomId, lastReadSeq: seq })
    .onConflictDoUpdate({
      target: [chatReads.userId, chatReads.roomId],
      set: { lastReadSeq: sql`greatest(${chatReads.lastReadSeq}, ${seq})`, updatedAt: new Date() },
    });
}

export async function getActiveMute(userId: string, roomId: string | null): Promise<ChatMuteDTO> {
  const [m] = await db
    .select({ until: chatMutes.until, reason: chatMutes.reason })
    .from(chatMutes)
    .where(
      and(
        eq(chatMutes.userId, userId),
        gt(chatMutes.until, new Date()),
        roomId ? or(isNull(chatMutes.roomId), eq(chatMutes.roomId, roomId)) : isNull(chatMutes.roomId),
      ),
    )
    .orderBy(desc(chatMutes.until))
    .limit(1);
  return m ? { until: m.until.toISOString(), reason: m.reason } : null;
}

export async function countMembers() {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(isNull(users.bannedAt));
  return r?.n ?? 0;
}

// ─── Aturan konten ───────────────────────────────────────────────────────────
async function validateContent(actor: ChatActor, body: string, opts: { hasImage: boolean; roomSlug: string; req?: Request }) {
  if (!body && !opts.hasImage) throw new ChatError(400, "Pesan masih kosong.");
  if (body.length > CHAT_LIMITS.maxChars) {
    throw new ChatError(400, `Pesan terlalu panjang (maks. ${CHAT_LIMITS.maxChars.toLocaleString("id-ID")} karakter).`);
  }
  if (body && detectGamblingPromo(body)) {
    await logSecurityEvent("chat_blocked", {
      userId: actor.id,
      meta: { room: opts.roomSlug, reason: "judol", sample: body.slice(0, 200) },
      req: opts.req,
    });
    throw new ChatError(422, "Pesan diblokir: terdeteksi promosi judi online. Rilisin tidak menoleransi judol.", "judol");
  }
  const links = countLinks(body);
  if (links > 0 && !isStaffRole(actor.role)) {
    const ageHours = (Date.now() - actor.createdAt.getTime()) / 3_600_000;
    if (ageHours < CHAT_LIMITS.newAccountLinkHours) {
      throw new ChatError(
        422,
        `Akun baru belum bisa mengirim link (anti-spam). Coba lagi ${Math.ceil(CHAT_LIMITS.newAccountLinkHours - ageHours)} jam lagi.`,
        "new_account_link",
      );
    }
    if (links > CHAT_LIMITS.maxLinksPerMessage) {
      throw new ChatError(422, `Maksimal ${CHAT_LIMITS.maxLinksPerMessage} link per pesan.`, "too_many_links");
    }
  }
}

// ─── Kirim ───────────────────────────────────────────────────────────────────
export async function sendMessage(
  actor: ChatActor,
  room: ChatRoom,
  input: { body: string; clientId: string; replyToId?: string | null; uploadId?: string | null },
  req?: Request,
) {
  const staff = isStaffRole(actor.role);
  if (room.kind === "announcement" && !staff) {
    throw new ChatError(403, "Hanya admin & moderator yang bisa mengirim pesan di ruang pengumuman.", "announcement");
  }
  const mute = await getActiveMute(actor.id, room.id);
  if (mute) throw new ChatError(403, `Kamu sedang dibisukan moderator sampai ${jam(mute.until)} WIB.`, "muted");

  // Idempoten: kirim ulang dengan clientId yang sama → kembalikan pesan yang sudah ada.
  const [existing] = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(and(eq(chatMessages.authorId, actor.id), eq(chatMessages.clientId, input.clientId)))
    .limit(1);
  if (existing) return (await getMessageDTO(existing.id))!;

  const burst = rateLimit(`chat:burst:${actor.id}`, 6, 10_000);
  const perMin = rateLimit(`chat:min:${actor.id}`, 30, 60_000);
  if (!burst.ok || !perMin.ok) {
    throw new ChatError(429, "Pelan-pelan dulu ya, kamu mengirim terlalu cepat.", "rate", Math.max(burst.retryAfterSec, perMin.retryAfterSec));
  }

  const body = normalizeMessage(input.body);
  await validateContent(actor, body, { hasImage: !!input.uploadId, roomSlug: room.slug, req });

  if (room.slowModeSec > 0 && !staff) {
    const [last] = await db
      .select({ at: chatMessages.createdAt })
      .from(chatMessages)
      .where(and(eq(chatMessages.roomId, room.id), eq(chatMessages.authorId, actor.id)))
      .orderBy(desc(chatMessages.seq))
      .limit(1);
    const wait = last ? Math.ceil((last.at.getTime() + room.slowModeSec * 1000 - Date.now()) / 1000) : 0;
    if (wait > 0) throw new ChatError(429, `Mode lambat aktif di ruang ini — tunggu ${wait} detik lagi.`, "slow_mode", wait);
  }

  if (body.length >= 6) {
    const recent = await db
      .select({ body: chatMessages.body })
      .from(chatMessages)
      .where(and(eq(chatMessages.authorId, actor.id), gt(chatMessages.createdAt, new Date(Date.now() - 60_000))))
      .limit(10);
    const key = duplicateKey(body);
    if (recent.filter((r) => duplicateKey(r.body) === key).length >= 2) {
      throw new ChatError(429, "Pesan yang sama sudah kamu kirim barusan.", "duplicate");
    }
  }

  let replyToId: string | null = null;
  if (input.replyToId) {
    const [target] = await db
      .select({ id: chatMessages.id, roomId: chatMessages.roomId, deletedAt: chatMessages.deletedAt })
      .from(chatMessages)
      .where(eq(chatMessages.id, input.replyToId))
      .limit(1);
    if (!target || target.roomId !== room.id || target.deletedAt) {
      throw new ChatError(400, "Pesan yang mau dibalas sudah tidak tersedia.");
    }
    replyToId = target.id;
  }

  let image: { id: string; key: string; w: number; h: number } | null = null;
  if (input.uploadId) {
    const [u] = await db
      .select({ id: chatUploads.id, key: chatUploads.storageKey, w: chatUploads.width, h: chatUploads.height })
      .from(chatUploads)
      .where(and(eq(chatUploads.id, input.uploadId), eq(chatUploads.uploaderId, actor.id), isNull(chatUploads.usedAt)))
      .limit(1);
    if (!u) throw new ChatError(400, "Gambar tidak ditemukan atau sudah dipakai. Upload ulang ya.");
    image = u;
  }

  const [msg] = await db
    .insert(chatMessages)
    .values({
      roomId: room.id,
      authorId: actor.id,
      body,
      replyToId,
      clientId: input.clientId,
      imageKey: image?.key ?? null,
      imageW: image?.w ?? null,
      imageH: image?.h ?? null,
    })
    .onConflictDoNothing({ target: [chatMessages.authorId, chatMessages.clientId] })
    .returning({ id: chatMessages.id, seq: chatMessages.seq, createdAt: chatMessages.createdAt });

  if (!msg) {
    const [again] = await db
      .select({ id: chatMessages.id })
      .from(chatMessages)
      .where(and(eq(chatMessages.authorId, actor.id), eq(chatMessages.clientId, input.clientId)))
      .limit(1);
    return (await getMessageDTO(again!.id))!;
  }

  if (image) await db.update(chatUploads).set({ usedAt: new Date() }).where(eq(chatUploads.id, image.id));
  await db.update(chatRooms).set({ lastMessageAt: msg.createdAt }).where(eq(chatRooms.id, room.id));
  await markRead(actor.id, room.id, msg.seq);
  await signalMessage(room.id, msg.id, true);
  return (await getMessageDTO(msg.id))!;
}

// ─── Aksi pada pesan ────────────────────────────────────────────────────────
async function loadRaw(id: string) {
  const [m] = await db.select().from(chatMessages).where(eq(chatMessages.id, id)).limit(1);
  if (!m) throw new ChatError(404, "Pesan tidak ditemukan.");
  return m;
}

function limitActions(actor: ChatActor) {
  const rl = rateLimit(`chat:action:${actor.id}`, 40, 60_000);
  if (!rl.ok) throw new ChatError(429, "Terlalu banyak aksi, tunggu sebentar.", "rate", rl.retryAfterSec);
}

export async function editMessage(actor: ChatActor, id: string, rawBody: string, req?: Request) {
  limitActions(actor);
  const m = await loadRaw(id);
  if (m.authorId !== actor.id) throw new ChatError(403, "Kamu hanya bisa mengedit pesanmu sendiri.");
  if (m.deletedAt || m.reportHiddenAt) throw new ChatError(400, "Pesan ini sudah tidak bisa diedit.");
  if (Date.now() - m.createdAt.getTime() > CHAT_LIMITS.editWindowMs) {
    throw new ChatError(403, "Batas waktu edit (15 menit) sudah lewat.", "edit_window");
  }
  const mute = await getActiveMute(actor.id, m.roomId);
  if (mute) throw new ChatError(403, "Kamu sedang dibisukan moderator.", "muted");
  const body = normalizeMessage(rawBody);
  const [room] = await db.select({ slug: chatRooms.slug }).from(chatRooms).where(eq(chatRooms.id, m.roomId));
  await validateContent(actor, body, { hasImage: !!m.imageKey, roomSlug: room?.slug ?? "?", req });
  if (body !== m.body) {
    await db.insert(chatMessageEdits).values({ messageId: m.id, previousBody: m.body });
    await db.update(chatMessages).set({ body, editedAt: new Date(), updatedAt: new Date() }).where(eq(chatMessages.id, m.id));
    await signalMessage(m.roomId, m.id);
  }
  return (await getMessageDTO(m.id))!;
}

export async function hideMessageForMe(actor: ChatActor, id: string) {
  limitActions(actor);
  await loadRaw(id);
  await db.insert(chatHiddenMessages).values({ userId: actor.id, messageId: id }).onConflictDoNothing();
  return { hidden: true };
}

export async function deleteForEveryone(actor: ChatActor, id: string, req?: Request) {
  limitActions(actor);
  const m = await loadRaw(id);
  if (m.deletedAt) return (await getMessageDTO(m.id))!;
  const staff = isStaffRole(actor.role);
  const own = m.authorId === actor.id;
  if (!own && !staff) throw new ChatError(403, "Kamu tidak bisa menghapus pesan orang lain.");
  if (own && !staff && Date.now() - m.createdAt.getTime() > CHAT_LIMITS.deleteWindowMs) {
    throw new ChatError(403, "Batas waktu \"hapus untuk semua orang\" (48 jam) sudah lewat. Kamu masih bisa \"Hapus untuk saya\".", "delete_window");
  }
  const byModerator = !own;
  // Salinan disimpan maks. 30 hari khusus untuk penanganan laporan (lihat Aturan Komunitas).
  if (m.body) await db.insert(chatMessageEdits).values({ messageId: m.id, previousBody: m.body });
  await db
    .update(chatMessages)
    .set({
      deletedAt: new Date(),
      deletedBy: actor.id,
      deleteReason: byModerator ? "moderator" : "author",
      body: "",
      imageKey: null,
      imageW: null,
      imageH: null,
      updatedAt: new Date(),
    })
    .where(eq(chatMessages.id, m.id));
  await db.delete(chatReactions).where(eq(chatReactions.messageId, m.id));
  if (m.imageKey) storage().remove(m.imageKey).catch(() => {});

  const [room] = await db.select({ pinned: chatRooms.pinnedMessageId }).from(chatRooms).where(eq(chatRooms.id, m.roomId));
  if (room?.pinned === m.id) {
    await db.update(chatRooms).set({ pinnedMessageId: null }).where(eq(chatRooms.id, m.roomId));
    await signal({ t: "pin", r: m.roomId, id: null });
  }
  if (byModerator) {
    await db.insert(moderationActions).values({ moderatorId: actor.id, targetType: "chat_message", targetId: m.id, action: "delete_message" });
    await logSecurityEvent("admin_delete_message", { userId: actor.id, meta: { messageId: m.id, authorId: m.authorId }, req });
    await resolveReportsFor(m.id, actor.id, "message_deleted");
  }
  await signalMessage(m.roomId, m.id);
  return (await getMessageDTO(m.id))!;
}

export async function toggleReaction(actor: ChatActor, id: string, emoji: string) {
  if (!ALLOWED_REACTIONS.has(emoji)) throw new ChatError(400, "Emoji tidak didukung.");
  const rl = rateLimit(`chat:react:${actor.id}`, 40, 30_000);
  if (!rl.ok) throw new ChatError(429, "Terlalu banyak reaksi, tunggu sebentar.", "rate", rl.retryAfterSec);
  const m = await loadRaw(id);
  if (m.deletedAt || m.reportHiddenAt) throw new ChatError(400, "Pesan ini tidak bisa diberi reaksi.");
  if (await getActiveMute(actor.id, m.roomId)) throw new ChatError(403, "Kamu sedang dibisukan moderator.", "muted");

  const [current] = await db
    .select({ emoji: chatReactions.emoji })
    .from(chatReactions)
    .where(and(eq(chatReactions.messageId, id), eq(chatReactions.userId, actor.id)))
    .limit(1);
  if (current?.emoji === emoji) {
    await db.delete(chatReactions).where(and(eq(chatReactions.messageId, id), eq(chatReactions.userId, actor.id)));
  } else {
    await db
      .insert(chatReactions)
      .values({ messageId: id, userId: actor.id, emoji })
      .onConflictDoUpdate({
        target: [chatReactions.messageId, chatReactions.userId],
        set: { emoji, createdAt: new Date() },
      });
  }
  await db.update(chatMessages).set({ updatedAt: new Date() }).where(eq(chatMessages.id, id));
  await signalMessage(m.roomId, id);
  return (await getMessageDTO(id))!;
}

export async function reportMessage(actor: ChatActor, id: string, reason: ReportReason, note: string | undefined, req?: Request) {
  const rl = rateLimit(`chat:report:${actor.id}`, 10, 60 * 60_000);
  if (!rl.ok) throw new ChatError(429, "Kamu sudah banyak melapor dalam 1 jam terakhir. Coba lagi nanti.", "rate", rl.retryAfterSec);
  const m = await loadRaw(id);
  if (m.authorId === actor.id) throw new ChatError(400, "Tidak bisa melaporkan pesan sendiri.");
  if (m.deletedAt) throw new ChatError(400, "Pesan ini sudah dihapus.");

  const [author] = await db.select({ name: users.displayName, username: users.username }).from(users).where(eq(users.id, m.authorId));
  const [room] = await db.select({ slug: chatRooms.slug, name: chatRooms.name }).from(chatRooms).where(eq(chatRooms.id, m.roomId));
  const inserted = await db
    .insert(reports)
    .values({
      reporterId: actor.id,
      targetType: "chat_message",
      targetId: m.id,
      reason,
      note: note?.trim().slice(0, 500) || null,
      snapshot: {
        body: m.body,
        imageKey: m.imageKey,
        authorId: m.authorId,
        authorName: author?.name,
        authorUsername: author?.username,
        roomSlug: room?.slug,
        roomName: room?.name,
        sentAt: m.createdAt.toISOString(),
      },
    })
    .onConflictDoNothing()
    .returning({ id: reports.id });
  if (!inserted.length) return { already: true, hidden: !!m.reportHiddenAt };

  await logSecurityEvent("chat_report", { userId: actor.id, meta: { messageId: m.id, reason }, req });

  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(distinct ${reports.reporterId})::int` })
    .from(reports)
    .where(and(eq(reports.targetType, "chat_message"), eq(reports.targetId, m.id), eq(reports.status, "open")));
  let hidden = !!m.reportHiddenAt;
  if (!hidden && n >= CHAT_LIMITS.reportHideThreshold) {
    await db.update(chatMessages).set({ reportHiddenAt: new Date(), updatedAt: new Date() }).where(eq(chatMessages.id, m.id));
    await logSecurityEvent("chat_auto_hidden", { userId: m.authorId, meta: { messageId: m.id, reports: n }, req });
    await signalMessage(m.roomId, m.id);
    hidden = true;
  }
  return { already: false, hidden };
}

export async function setPinned(actor: ChatActor, id: string, pin: boolean) {
  if (!isStaffRole(actor.role)) throw new ChatError(403, "Hanya moderator yang bisa menyematkan pesan.");
  const m = await loadRaw(id);
  if (pin && (m.deletedAt || m.reportHiddenAt)) throw new ChatError(400, "Pesan ini tidak bisa disematkan.");
  await db.update(chatRooms).set({ pinnedMessageId: pin ? m.id : null }).where(eq(chatRooms.id, m.roomId));
  await db.insert(moderationActions).values({ moderatorId: actor.id, targetType: "chat_message", targetId: m.id, action: pin ? "pin" : "unpin" });
  await signal({ t: "pin", r: m.roomId, id: pin ? m.id : null });
  return { pinned: pin };
}

export async function muteAuthor(actor: ChatActor, id: string, minutes: number, reason: string | undefined, req?: Request) {
  if (!isStaffRole(actor.role)) throw new ChatError(403, "Hanya moderator yang bisa membisukan anggota.");
  const m = await loadRaw(id);
  return muteUser(actor, m.authorId, minutes, reason, req);
}

export async function muteUser(actor: ChatActor, userId: string, minutes: number, reason: string | undefined, req?: Request) {
  if (!isStaffRole(actor.role)) throw new ChatError(403, "Hanya moderator yang bisa membisukan anggota.");
  const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  if (!target) throw new ChatError(404, "Anggota tidak ditemukan.");
  if (isStaffRole(target.role)) throw new ChatError(403, "Moderator/admin tidak bisa dibisukan.");
  const until = new Date(Date.now() + minutes * 60_000);
  await db.insert(chatMutes).values({ userId, until, reason: reason?.slice(0, 200) || null, createdBy: actor.id });
  await db.insert(moderationActions).values({ moderatorId: actor.id, targetType: "user", targetId: userId, action: `mute_${minutes}m`, note: reason ?? null });
  await logSecurityEvent("admin_mute", { userId: actor.id, meta: { target: userId, minutes }, req });
  return { until: until.toISOString() };
}

export async function resolveReportsFor(messageId: string, moderatorId: string, resolution: string, status: "resolved" | "dismissed" = "resolved") {
  await db
    .update(reports)
    .set({ status, resolvedBy: moderatorId, resolvedAt: new Date(), resolution })
    .where(and(eq(reports.targetType, "chat_message"), eq(reports.targetId, messageId), eq(reports.status, "open")));
}

export async function restoreReportedMessage(moderatorId: string, messageId: string) {
  const m = await loadRaw(messageId);
  await db.update(chatMessages).set({ reportHiddenAt: null, updatedAt: new Date() }).where(eq(chatMessages.id, messageId));
  await resolveReportsFor(messageId, moderatorId, "restored", "dismissed");
  await signalMessage(m.roomId, messageId);
}

export function publishTyping(roomId: string, userId: string, name: string) {
  return signal({ t: "ty", r: roomId, u: userId, n: name.slice(0, 40) });
}
