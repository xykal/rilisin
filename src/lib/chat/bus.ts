import "server-only";
import postgres from "postgres";
import { CHAT_CHANNEL, type ChatSignal } from "./notify";
import { getMessageDTO } from "./server";
import { attachmentPreview, type ChatActivity, type ChatMessageDTO } from "./shared";

/**
 * "Pos" realtime per proses server: satu koneksi LISTEN ke PostgreSQL, lalu event dibagikan
 * ke semua koneksi SSE (browser) yang sedang membuka ruang terkait. Isi pesan diambil dari
 * database SEKALI per event per proses, bukan sekali per penonton.
 *
 * Catatan skala: presence ("N online") dihitung per proses. Kalau nanti jalan di banyak
 * instance, pindahkan presence ke Redis / layanan realtime (Supabase Realtime, Ably, dll).
 */
export type BusEvent =
  | { type: "msg"; message: ChatMessageDTO; created: boolean }
  | { type: "typing"; userId: string; name: string }
  | { type: "pin"; message: ChatMessageDTO | null }
  | { type: "presence"; online: number }
  | { type: "activity"; activity: ChatActivity }
  | { type: "notif" };

type Handler = (e: BusEvent) => void;

export const MAX_STREAMS_PER_USER = 6;
/** Bel notifikasi: satu stream per tab, dihitung terpisah supaya tidak memakan jatah chat. */
export const MAX_NOTIF_STREAMS_PER_USER = 12;
const MAX_STREAMS_TOTAL = 2000;

class ChatBus {
  private rooms = new Map<string, Set<Handler>>();
  private everywhere = new Set<Handler>();
  private users = new Map<string, Set<Handler>>();
  private presence = new Map<string, Map<string, number>>();
  private streamsByUser = new Map<string, number>();
  private streamsByUserNotif = new Map<string, number>();
  private totalStreams = 0;
  private ready: Promise<void> | null = null;

  ensureListening() {
    if (!this.ready) {
      // LISTEN butuh koneksi langsung (bukan pooler transaksi). Neon via Vercel: DATABASE_URL_UNPOOLED
      const listener = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!, {
        max: 1,
        prepare: false,
        onnotice: () => {},
      });
      this.ready = listener
        .listen(CHAT_CHANNEL, (payload) => void this.onSignal(payload))
        .then(() => undefined)
        .catch((err) => {
          console.error("[chat] LISTEN gagal", err);
          this.ready = null;
          throw err;
        });
    }
    return this.ready;
  }

  private async onSignal(payload: string) {
    let s: ChatSignal;
    try {
      s = JSON.parse(payload) as ChatSignal;
    } catch {
      return;
    }
    if (s.t === "nt") {
      this.emit(this.users.get(s.u), { type: "notif" });
      return;
    }
    const roomHandlers = this.rooms.get(s.r);
    if (s.t === "ty") {
      this.emit(roomHandlers, { type: "typing", userId: s.u, name: s.n });
      return;
    }
    if (s.t === "pin") {
      if (!roomHandlers?.size) return;
      this.emit(roomHandlers, { type: "pin", message: s.id ? await getMessageDTO(s.id) : null });
      return;
    }
    const wantsActivity = s.c === 1 && this.everywhere.size > 0;
    if (!roomHandlers?.size && !wantsActivity) return;
    const message = await getMessageDTO(s.id);
    if (!message) return;
    this.emit(roomHandlers, { type: "msg", message, created: s.c === 1 });
    if (wantsActivity) {
      const preview = attachmentPreview(message.body, message.image ? "image" : message.audio ? "audio" : null);
      this.emit(this.everywhere, {
        type: "activity",
        activity: {
          roomId: message.roomId,
          seq: message.seq,
          authorId: message.author.id,
          authorName: message.author.displayName,
          preview,
          at: message.createdAt,
        },
      });
    }
  }

  private emit(handlers: Set<Handler> | undefined, e: BusEvent) {
    if (!handlers) return;
    for (const h of handlers) {
      try {
        h(e);
      } catch {
        /* koneksi yang error dibersihkan oleh pemiliknya */
      }
    }
  }

  /** Daftar koneksi SSE baru. Return null kalau batas koneksi tercapai. */
  open(userId: string, roomId: string, onRoom: Handler, onActivity: Handler) {
    const mine = this.streamsByUser.get(userId) ?? 0;
    if (mine >= MAX_STREAMS_PER_USER || this.totalStreams >= MAX_STREAMS_TOTAL) return null;
    this.streamsByUser.set(userId, mine + 1);
    this.totalStreams++;

    const set = this.rooms.get(roomId) ?? new Set<Handler>();
    set.add(onRoom);
    this.rooms.set(roomId, set);
    this.everywhere.add(onActivity);

    const people = this.presence.get(roomId) ?? new Map<string, number>();
    people.set(userId, (people.get(userId) ?? 0) + 1);
    this.presence.set(roomId, people);
    this.broadcastPresence(roomId);

    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      set.delete(onRoom);
      if (!set.size) this.rooms.delete(roomId);
      this.everywhere.delete(onActivity);
      const left = (people.get(userId) ?? 1) - 1;
      if (left <= 0) people.delete(userId);
      else people.set(userId, left);
      if (!people.size) this.presence.delete(roomId);
      const s = (this.streamsByUser.get(userId) ?? 1) - 1;
      if (s <= 0) this.streamsByUser.delete(userId);
      else this.streamsByUser.set(userId, s);
      this.totalStreams--;
      this.broadcastPresence(roomId);
    };
  }

  /** Daftar koneksi SSE bel notifikasi (per user, tanpa presence). Return null kalau batas tercapai. */
  openUser(userId: string, handler: Handler) {
    const mine = this.streamsByUserNotif.get(userId) ?? 0;
    if (mine >= MAX_NOTIF_STREAMS_PER_USER || this.totalStreams >= MAX_STREAMS_TOTAL) return null;
    this.streamsByUserNotif.set(userId, mine + 1);
    this.totalStreams++;
    const set = this.users.get(userId) ?? new Set<Handler>();
    set.add(handler);
    this.users.set(userId, set);
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      set.delete(handler);
      if (!set.size) this.users.delete(userId);
      const s = (this.streamsByUserNotif.get(userId) ?? 1) - 1;
      if (s <= 0) this.streamsByUserNotif.delete(userId);
      else this.streamsByUserNotif.set(userId, s);
      this.totalStreams--;
    };
  }

  online(roomId: string) {
    return this.presence.get(roomId)?.size ?? 0;
  }

  private broadcastPresence(roomId: string) {
    this.emit(this.rooms.get(roomId), { type: "presence", online: this.online(roomId) });
  }
}

const g = globalThis as unknown as { __rilisinChatBus?: ChatBus };
export function chatBus() {
  g.__rilisinChatBus ??= new ChatBus();
  return g.__rilisinChatBus;
}
