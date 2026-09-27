import "server-only";
import { pg } from "@/lib/db";

/**
 * Sinyal realtime lewat PostgreSQL LISTEN/NOTIFY. Semua instance server yang LISTEN ikut
 * menerima (jalan juga kalau nanti server-nya lebih dari satu). Payload dibuat kecil
 * (maks 8000 byte) — isi pesan diambil ulang dari database oleh penerima.
 */
export const CHAT_CHANNEL = "rilisin_chat";

export type ChatSignal =
  | { t: "m"; r: string; id: string; c?: 1 }
  | { t: "ty"; r: string; u: string; n: string }
  | { t: "pin"; r: string; id: string | null };

export async function signal(evt: ChatSignal) {
  try {
    await pg.notify(CHAT_CHANNEL, JSON.stringify(evt));
  } catch (err) {
    console.error("[chat] NOTIFY gagal", err);
  }
}

export const signalMessage = (roomId: string, id: string, created = false) =>
  signal(created ? { t: "m", r: roomId, id, c: 1 } : { t: "m", r: roomId, id });
