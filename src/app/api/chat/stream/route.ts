import { apiError, guardRead } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { chatBus, type BusEvent } from "@/lib/chat/bus";
import { getRoomBySlug } from "@/lib/chat/server";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
// Vercel Hobby (Fluid compute): durasi fungsi maks 300 dtk → stream ditutup sebelum itu (SSE_MAX_SECONDS) lalu browser
// menyambung ulang otomatis (retry 3 dtk) dan mengambil pesan yang terlewat.
export const maxDuration = 300;

const KEEPALIVE_MS = 20_000;
/** Koneksi ditutup berkala → browser otomatis menyambung ulang & session dicek ulang. */
const MAX_LIFETIME_MS = Math.max(30, Number(process.env.SSE_MAX_SECONDS ?? 20 * 60)) * 1000;

/**
 * Server-Sent Events untuk chat realtime: pesan baru/berubah, reaksi, "sedang mengetik",
 * jumlah online, pesan tersemat, dan aktivitas ruang lain (badge belum dibaca).
 */
export async function GET(req: Request) {
  const blocked = guardRead(req);
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Silakan masuk dulu.");
  const rl = rateLimit(`chat:stream:${user.id}`, 30, 60_000);
  if (!rl.ok) return apiError(429, "Terlalu sering menyambung ulang.", { retryAfter: rl.retryAfterSec });

  const room = await getRoomBySlug(new URL(req.url).searchParams.get("room") ?? "");
  if (!room) return apiError(404, "Ruang tidak ditemukan.");

  const bus = chatBus();
  try {
    await bus.ensureListening();
  } catch {
    return apiError(503, "Layanan realtime sedang bermasalah.");
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const write = (chunk: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      const onRoom = (e: BusEvent) => {
        if (e.type === "msg") send("msg", { message: e.message, created: e.created });
        else if (e.type === "typing") {
          if (e.userId !== user.id) send("typing", { userId: e.userId, name: e.name });
        } else if (e.type === "presence") send("presence", { online: e.online });
        else if (e.type === "pin") send("pin", { message: e.message });
      };
      const onActivity = (e: BusEvent) => {
        if (e.type === "activity" && e.activity.roomId !== room.id) send("activity", e.activity);
      };

      const close = bus.open(user.id, room.id, onRoom, onActivity);
      if (!close) {
        write(`event: busy\ndata: {}\n\n`);
        open = false;
        controller.close();
        return;
      }
      write(`retry: 3000\n\n`);
      send("ready", { online: bus.online(room.id), serverTime: new Date().toISOString() });

      const ping = setInterval(() => write(`: ping\n\n`), KEEPALIVE_MS);
      const lifetime = setTimeout(() => {
        cleanup();
        try {
          controller.close();
        } catch {}
      }, MAX_LIFETIME_MS);

      cleanup = () => {
        if (!open) return;
        open = false;
        clearInterval(ping);
        clearTimeout(lifetime);
        close();
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform: cegah kompresi/buffering oleh server & proxy (SSE harus mengalir)
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
