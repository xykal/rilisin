import { apiError, guardRead } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/current-user";
import { chatBus } from "@/lib/chat/bus";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
// Sama seperti stream chat: ditutup berkala (Fluid compute maks 300 dtk), browser menyambung ulang otomatis.
export const maxDuration = 300;

const KEEPALIVE_MS = 20_000;
const MAX_LIFETIME_MS = Math.max(30, Number(process.env.SSE_MAX_SECONDS ?? 20 * 60)) * 1000;

/**
 * Server-Sent Events untuk bel notifikasi: event "notif" = ada notifikasi in-app baru
 * untuk user ini. Client lalu mengambil ulang jumlah dari /api/notifications/unread
 * (satu query murah, angka selalu konsisten walau ada event hantu).
 */
export async function GET(req: Request) {
  const blocked = guardRead(req);
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return apiError(401, "Silakan masuk dulu.");
  const rl = rateLimit(`notif:stream:${user.id}`, 30, 60_000);
  if (!rl.ok) return apiError(429, "Terlalu sering menyambung ulang.", { retryAfter: rl.retryAfterSec });

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

      const close = bus.openUser(user.id, (e) => {
        if (e.type === "notif") send("notif", {});
      });
      if (!close) {
        write(`event: busy\ndata: {}\n\n`);
        open = false;
        controller.close();
        return;
      }
      write(`retry: 3000\n\n`);
      send("ready", { serverTime: new Date().toISOString() });

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
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
