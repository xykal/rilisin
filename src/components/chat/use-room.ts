"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChatActivity,
  ChatMessageDTO,
  ChatRoomDTO,
  ChatViewerDTO,
  ReportReason,
} from "@/lib/chat/shared";
import type { PendingImage } from "./composer";
import type { PendingAudio } from "./voice-recorder";
import { parseStickerKey } from "@/lib/chat/stickers";
import type { LocalMessage } from "./message-bubble";
import { chatApi, newClientId } from "./utils";

type Initial = { messages: ChatMessageDTO[]; hasMore: boolean; pinned: ChatMessageDTO | null };
export type ConnStatus = "guest" | "connecting" | "live" | "offline";

const maxIso = (a: string, b: string) => (a > b ? a : b);

/**
 * State & koneksi realtime satu ruang chat:
 * pesan (dengan optimistic update), paginasi ke atas, SSE + sinkron ulang saat tersambung
 * kembali, "sedang mengetik", jumlah online, pesan tersemat, dan semua aksi pesan.
 */
export function useRoom(opts: {
  room: ChatRoomDTO;
  viewer: ChatViewerDTO | null;
  initial: Initial;
  onActivity: (a: ChatActivity) => void;
  onError: (msg: string) => void;
  onSessionExpired: () => void;
}) {
  const { room, viewer } = opts;
  const [msgs, setMsgs] = useState<Record<string, LocalMessage>>(() =>
    Object.fromEntries(opts.initial.messages.map((m) => [m.id, m])),
  );
  const [hasMore, setHasMore] = useState(opts.initial.hasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pinned, setPinned] = useState<ChatMessageDTO | null>(opts.initial.pinned);
  const [online, setOnline] = useState(0);
  const [typing, setTyping] = useState<Record<string, { name: string; until: number; mode?: "recording" | "typing" }>>({});
  const [status, setStatus] = useState<ConnStatus>(viewer ? "connecting" : "guest");

  const hidden = useRef(new Set<string>());
  const lastSync = useRef(
    opts.initial.messages.reduce((acc, m) => maxIso(acc, m.updatedAt), "1970-01-01T00:00:00.000Z"),
  );
  const pendingSeq = useRef(0);
  const cbs = useRef(opts);
  useEffect(() => {
    cbs.current = opts;
  });

  const list = useMemo(() => Object.values(msgs).sort((a, b) => a.seq - b.seq), [msgs]);
  const listRef = useRef(list);
  useEffect(() => {
    listRef.current = list;
  }, [list]);

  /** Gabungkan pesan dari server. `mode`: new = boleh tambah pesan baru; known = hanya perbarui yang sudah ada. */
  const upsert = useCallback((incoming: ChatMessageDTO[], mode: "new" | "known" | "sync" = "new") => {
    if (!incoming?.length) return; // defensif: respons tanpa daftar pesan diabaikan
    setMsgs((prev) => {
      let next: Record<string, LocalMessage> | null = null;
      const values = Object.values(prev).filter((m) => !m.pending);
      const oldestSeq = values.length ? Math.min(...values.map((m) => m.seq)) : 0;
      for (const m of incoming) {
        lastSync.current = maxIso(lastSync.current, m.updatedAt);
        const existing = prev[m.id];
        if (hidden.current.has(m.id)) continue;
        if (!existing) {
          if (mode === "known") continue;
          if (mode === "sync" && m.seq < oldestSeq) continue; // jangan bikin "bolong" di riwayat
        } else if (existing.updatedAt > m.updatedAt) continue;
        next ??= { ...prev };
        if (m.clientId && next[`tmp:${m.clientId}`]) delete next[`tmp:${m.clientId}`];
        next[m.id] = m;
      }
      return next ?? prev;
    });
  }, []);

  const removeLocal = useCallback((id: string) => {
    setMsgs((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const patchLocal = useCallback((id: string, patch: Partial<LocalMessage>) => {
    setMsgs((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id]!, ...patch } } : prev));
  }, []);

  // ─── Sinkron ulang (setelah reconnect / tab aktif lagi) ───────────────────
  const syncing = useRef(false);
  const resync = useCallback(async () => {
    if (!viewer || syncing.current) return;
    syncing.current = true;
    const since = new Date(new Date(lastSync.current).getTime() - 5000).toISOString();
    const res = await chatApi<{ messages: ChatMessageDTO[] }>(
      `/api/chat/rooms/${room.slug}/messages?since=${encodeURIComponent(since)}`,
    );
    syncing.current = false;
    if (res.ok) upsert(res.data.messages, "sync");
    else if (res.status === 401) cbs.current.onSessionExpired();
  }, [room.slug, viewer, upsert]);

  // ─── Realtime (Server-Sent Events) ───────────────────────────────────────
  useEffect(() => {
    if (!viewer) return;
    // Timing navigasi (debug "stuck"): pasangkan stempel klik RoomList → console "[nav] slug: Xms".
    try {
      const raw = sessionStorage.getItem("nav-t0");
      if (raw) {
        sessionStorage.removeItem("nav-t0");
        const [t0, slug] = raw.split("|");
        if (slug === room.slug) console.info(`[nav] ${slug}: ${Math.round(performance.now() - Number(t0))}ms klik→konten`);
      }
    } catch {}
    let es: EventSource | null = null;
    let stopped = false;
    let retryTimer = 0;
    let attempt = 0;
    // Polling fallback: kalau SSE tidak/belum live (mis. proxy mematikan stream), ambil pesan
    // tiap 5 dtk supaya user TIDAK PERNAH perlu refresh manual.
    let live = false;
    let watchdog = 0;

    const connect = () => {
      if (stopped) return;
      live = false;
      es = new EventSource(`/api/chat/stream?room=${encodeURIComponent(room.slug)}`);
      // Watchdog: "ready" tak kunjung tiba dalam 12 dtk (server antre/LISTEN macet) →
      // paksa tutup + reconnect terjadwal, JANGAN gantung selamanya.
      window.clearTimeout(watchdog);
      watchdog = window.setTimeout(() => {
        if (stopped || live) return;
        try {
          es?.close();
        } catch {}
        es = null;
        attempt++;
        setStatus("connecting");
        retryTimer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)));
      }, 12_000);
      es.addEventListener("ready", (e) => {
        attempt = 0;
        live = true;
        window.clearTimeout(watchdog);
        setStatus("live");
        setOnline(JSON.parse((e as MessageEvent).data).online ?? 0);
        void resync();
      });
      es.addEventListener("msg", (e) => {
        const { message, created } = JSON.parse((e as MessageEvent).data) as { message: ChatMessageDTO; created: boolean };
        upsert([message], created ? "new" : "known");
        if (created) {
          setTyping((t) => {
            if (!t[message.author.id]) return t;
            const next = { ...t };
            delete next[message.author.id];
            return next;
          });
        }
      });
      es.addEventListener("typing", (e) => {
        const { userId, name, mode } = JSON.parse((e as MessageEvent).data) as { userId: string; name: string; mode?: "recording" | "typing" };
        setTyping((t) => ({ ...t, [userId]: { name, until: Date.now() + 5000, mode } }));
      });
      es.addEventListener("presence", (e) => setOnline(JSON.parse((e as MessageEvent).data).online ?? 0));
      es.addEventListener("pin", (e) => setPinned(JSON.parse((e as MessageEvent).data).message ?? null));
      es.addEventListener("activity", (e) => cbs.current.onActivity(JSON.parse((e as MessageEvent).data)));
      es.addEventListener("busy", () => {
        es?.close();
        window.clearTimeout(watchdog);
        attempt++;
        // Slot bisa bebas sendiri (tab latar dilepas setelah 45 dtk) → coba lagi dengan backoff,
        // baru menyerah setelah 5x (user benar-benar kebanyakan tab aktif).
        if (attempt > 5) {
          setStatus("offline");
          cbs.current.onError("Terlalu banyak tab chat terbuka. Tutup beberapa tab lalu muat ulang.");
          return;
        }
        setStatus("connecting");
        retryTimer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)));
      });
      es.onerror = () => {
        if (stopped) return;
        live = false;
        window.clearTimeout(watchdog);
        setStatus("connecting");
        if (es?.readyState === EventSource.CLOSED) {
          es.close();
          attempt++;
          // cek apakah session habis (EventSource tidak memberi tahu status HTTP)
          void chatApi(`/api/chat/rooms/${room.slug}/messages?since=${encodeURIComponent(new Date().toISOString())}`).then((r) => {
            if (!r.ok && r.status === 401) {
              stopped = true;
              setStatus("offline");
              cbs.current.onSessionExpired();
              return;
            }
            retryTimer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)));
          });
        }
      };
    };
    /*
     * Tab di latar belakang > 45 dtk → koneksi realtime dilepas; saat tab dibuka lagi → sambung ulang + ambil
     * pesan yang terlewat (event "ready" memanggil resync). Alasannya: di HTTP/1.1 browser cuma memberi ±6 koneksi
     * per situs untuk SEMUA tab — banyak tab chat yang menggantung bisa bikin halaman lain di situs ini macet.
     * Bonus: beban server & status "online" lebih jujur (seperti WhatsApp: online hanya saat aplikasi dibuka).
     */
    let paused = false;
    let pauseTimer = 0;
    const onVisible = () => {
      window.clearTimeout(pauseTimer);
      if (document.visibilityState === "visible") {
        if (paused) {
          paused = false;
          attempt = 0;
          window.clearTimeout(retryTimer);
          setStatus("connecting");
          connect();
        } else void resync();
        return;
      }
      pauseTimer = window.setTimeout(() => {
        if (stopped || document.visibilityState === "visible") return;
        paused = true;
        window.clearTimeout(retryTimer);
        es?.close();
        es = null;
      }, 45_000);
    };

    connect();
    const poll = window.setInterval(() => {
      if (!stopped && !live && document.visibilityState === "visible") void resync();
    }, 5000);
    if (document.visibilityState === "hidden") onVisible(); // dibuka langsung di tab belakang

    const onOnline = () => {
      if (paused) return; // disambung ulang saat tab terlihat lagi
      if (es?.readyState === EventSource.CLOSED) {
        window.clearTimeout(retryTimer);
        connect();
      } else void resync();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      stopped = true;
      window.clearInterval(poll);
      window.clearTimeout(watchdog);
      window.clearTimeout(retryTimer);
      window.clearTimeout(pauseTimer);
      es?.close();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [room.slug, viewer, upsert, resync]);

  // Bersihkan indikator mengetik yang kedaluwarsa
  const typingCount = Object.keys(typing).length;
  useEffect(() => {
    if (!typingCount) return;
    const t = window.setInterval(() => {
      setTyping((cur) => {
        const now = Date.now();
        const entries = Object.entries(cur).filter(([, v]) => v.until > now);
        return entries.length === Object.keys(cur).length ? cur : Object.fromEntries(entries);
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [typingCount]);

  // ─── Paginasi ke atas ────────────────────────────────────────────────────
  const loadingRef = useRef(false);
  const loadOlder = useCallback(async () => {
    if (!viewer || loadingRef.current) return false;
    const oldest = listRef.current.find((m) => !m.pending);
    if (!oldest) return false;
    loadingRef.current = true;
    setLoadingOlder(true);
    const res = await chatApi<{ messages: ChatMessageDTO[]; hasMore: boolean }>(
      `/api/chat/rooms/${room.slug}/messages?before=${oldest.seq}`,
    );
    loadingRef.current = false;
    setLoadingOlder(false);
    if (!res.ok) return false;
    upsert(res.data.messages, "new");
    setHasMore(res.data.hasMore);
    return res.data.messages.length > 0;
  }, [room.slug, viewer, upsert]);

  // ─── Tandai sudah dibaca ─────────────────────────────────────────────────
  const lastMarked = useRef(0);
  const markTimer = useRef(0);
  const markRead = useCallback(
    (seq: number) => {
      if (!viewer || seq <= lastMarked.current || seq >= Number.MAX_SAFE_INTEGER - 2e6) return;
      window.clearTimeout(markTimer.current);
      markTimer.current = window.setTimeout(() => {
        lastMarked.current = seq;
        void chatApi(`/api/chat/rooms/${room.slug}/read`, { seq });
      }, 700);
    },
    [room.slug, viewer],
  );

  // ─── Aksi ────────────────────────────────────────────────────────────────
  const send = useCallback(
    async (body: string, replyTo: LocalMessage | null, image: PendingImage | null, audio: PendingAudio | null) => {
      if (!viewer) return false;
      const clientId = newClientId();
      const tmpId = `tmp:${clientId}`;
      const now = new Date().toISOString();
      const optimistic: LocalMessage = {
        id: tmpId,
        seq: Number.MAX_SAFE_INTEGER - 1e6 + ++pendingSeq.current,
        roomId: room.id,
        clientId,
        author: { id: viewer.id, username: viewer.username, displayName: viewer.displayName, avatarUrl: viewer.avatarUrl, role: viewer.role, isSeller: false, isTrusted: false },
        body: body.trim(),
        image: image ? { url: image.url, w: image.w, h: image.h } : null,
        audio: audio ? { url: audio.url, secs: audio.secs } : null,
        sticker: null,
        replyTo: replyTo
          ? { id: replyTo.id, authorId: replyTo.author.id, authorName: replyTo.author.displayName, body: replyTo.body.slice(0, 140), hasImage: !!replyTo.image, hasAudio: !!replyTo.audio, hasSticker: !!replyTo.sticker, unavailable: false }
          : null,
        reactions: [],
        createdAt: now,
        updatedAt: now,
        editedAt: null,
        deleted: null,
        hiddenByReports: false,
        pending: "sending",
      };
      setMsgs((prev) => ({ ...prev, [tmpId]: optimistic }));
      const payload = { body, clientId, replyToId: replyTo?.id ?? null, uploadId: image?.uploadId ?? audio?.uploadId ?? null };
      const res = await chatApi<{ message: ChatMessageDTO }>(`/api/chat/rooms/${room.slug}/messages`, payload);
      if (res.ok) {
        upsert([res.data.message], "new");
        return true;
      }
      if (res.status === 401) cbs.current.onSessionExpired();
      if (res.status === 0) {
        setMsgs((prev) => (prev[tmpId] ? { ...prev, [tmpId]: { ...prev[tmpId]!, pending: "failed", error: "Tidak terkirim", retryPayload: payload } as LocalMessage } : prev));
      } else {
        // Ditolak server (filter, mode lambat, dibisukan, dll) → tarik balik & kembalikan teks ke pengguna
        removeLocal(tmpId);
        cbs.current.onError(res.error);
      }
      return false;
    },
    [room.id, room.slug, viewer, upsert, removeLocal],
  );

  // ─── Stiker (ketuk = langsung kirim, tanpa teks & tanpa balas) ─────────────
  const sendSticker = useCallback(
    async (stickerKey: string) => {
      if (!viewer) return false;
      const parsed = parseStickerKey(stickerKey);
      if (!parsed) {
        cbs.current.onError("Stiker tidak dikenal.");
        return false;
      }
      const clientId = newClientId();
      const tmpId = `local-${clientId}`;
      const now = new Date().toISOString();
      const optimistic: LocalMessage = {
        id: tmpId,
        seq: Number.MAX_SAFE_INTEGER - 1e6 + ++pendingSeq.current,
        roomId: room.id,
        clientId,
        author: { id: viewer.id, username: viewer.username, displayName: viewer.displayName, avatarUrl: viewer.avatarUrl, role: viewer.role, isSeller: false, isTrusted: false },
        body: "",
        image: null,
        audio: null,
        sticker: { url: parsed.url, label: parsed.label },
        replyTo: null,
        reactions: [],
        createdAt: now,
        updatedAt: now,
        editedAt: null,
        deleted: null,
        hiddenByReports: false,
        pending: "sending",
      };
      setMsgs((prev) => ({ ...prev, [tmpId]: optimistic }));
      const payload = { body: "", clientId, replyToId: null, uploadId: null, stickerKey };
      const res = await chatApi<{ message: ChatMessageDTO }>(`/api/chat/rooms/${room.slug}/messages`, payload);
      if (res.ok) {
        upsert([res.data.message], "new");
        return true;
      }
      if (res.status === 401) cbs.current.onSessionExpired();
      if (res.status === 0) {
        setMsgs((prev) => (prev[tmpId] ? { ...prev, [tmpId]: { ...prev[tmpId]!, pending: "failed", error: "Tidak terkirim", retryPayload: payload } as LocalMessage } : prev));
      } else {
        removeLocal(tmpId);
        cbs.current.onError(res.error);
      }
      return false;
    },
    [room.id, room.slug, viewer, upsert, removeLocal],
  );

  const retry = useCallback(
    async (msg: LocalMessage) => {
      const payload = (msg as LocalMessage & { retryPayload?: Record<string, unknown> }).retryPayload;
      if (!payload) return;
      patchLocal(msg.id, { pending: "sending", error: undefined });
      const res = await chatApi<{ message: ChatMessageDTO }>(`/api/chat/rooms/${room.slug}/messages`, payload);
      if (res.ok) upsert([res.data.message], "new");
      else if (res.status === 0) patchLocal(msg.id, { pending: "failed", error: "Tidak terkirim" });
      else {
        removeLocal(msg.id);
        cbs.current.onError(res.error);
      }
    },
    [room.slug, upsert, patchLocal, removeLocal],
  );

  const act = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      const res = await chatApi<{ message?: ChatMessageDTO; hidden?: boolean; already?: boolean; until?: string }>(`/api/chat/messages/${id}`, body);
      if (!res.ok) {
        if (res.status === 401) cbs.current.onSessionExpired();
        cbs.current.onError(res.error);
        void resync();
        return null;
      }
      if (res.data?.message) upsert([res.data.message], "known");
      return res.data;
    },
    [upsert, resync],
  );

  const edit = useCallback(
    async (id: string, body: string) => {
      const prevMsg = listRef.current.find((m) => m.id === id);
      if (!prevMsg) return false;
      patchLocal(id, { body: body.trim(), editedAt: new Date().toISOString() });
      const r = await act(id, { action: "edit", body });
      if (!r) patchLocal(id, { body: prevMsg.body, editedAt: prevMsg.editedAt });
      return !!r;
    },
    [act, patchLocal],
  );

  const deleteForMe = useCallback(
    async (msg: LocalMessage) => {
      if (msg.pending) return removeLocal(msg.id);
      hidden.current.add(msg.id);
      removeLocal(msg.id);
      const r = await act(msg.id, { action: "delete", scope: "me" });
      if (!r) {
        hidden.current.delete(msg.id);
        upsert([msg], "new");
      }
    },
    [act, removeLocal, upsert],
  );

  const deleteForEveryone = useCallback(
    async (msg: LocalMessage) => {
      patchLocal(msg.id, { deleted: msg.author.id === viewer?.id ? "author" : "moderator", body: "", image: null, audio: null, sticker: null, reactions: [] });
      const r = await act(msg.id, { action: "delete", scope: "everyone" });
      if (!r) upsert([{ ...msg, updatedAt: new Date().toISOString() }], "known");
    },
    [act, patchLocal, upsert, viewer?.id],
  );

  const react = useCallback(
    async (msg: LocalMessage, emoji: string) => {
      if (!viewer) return;
      // optimistic: satu reaksi per orang per pesan (ketuk emoji yang sama = hapus)
      const mine = msg.reactions.find((r) => r.users.some((u) => u.id === viewer.id));
      let reactions = msg.reactions
        .map((r) => (r === mine ? { ...r, count: r.count - 1, users: r.users.filter((u) => u.id !== viewer.id) } : r))
        .filter((r) => r.count > 0);
      if (mine?.emoji !== emoji) {
        const found = reactions.find((r) => r.emoji === emoji);
        reactions = found
          ? reactions.map((r) => (r === found ? { ...r, count: r.count + 1, users: [...r.users, { id: viewer.id, name: viewer.displayName }] } : r))
          : [...reactions, { emoji, count: 1, users: [{ id: viewer.id, name: viewer.displayName }] }];
      }
      patchLocal(msg.id, { reactions });
      const r = await act(msg.id, { action: "react", emoji });
      if (!r) patchLocal(msg.id, { reactions: msg.reactions });
    },
    [act, patchLocal, viewer],
  );

  const report = useCallback(
    async (msg: LocalMessage, reason: ReportReason, note: string) => {
      const r = await act(msg.id, { action: "report", reason, note: note || undefined });
      return r as { already?: boolean; hidden?: boolean } | null;
    },
    [act],
  );

  const setPin = useCallback(
    async (msg: LocalMessage, pin: boolean) => {
      const r = await act(msg.id, { action: pin ? "pin" : "unpin" });
      if (r) setPinned(pin ? msg : null);
      return !!r;
    },
    [act],
  );

  const muteAuthor = useCallback(
    async (msg: LocalMessage, minutes: number, reason: string) => {
      const r = await act(msg.id, { action: "mute_author", minutes, reason: reason || undefined });
      return r?.until ?? null;
    },
    [act],
  );

  const sendTyping = useCallback((mode?: "recording" | "typing") => {
    if (!viewer) return;
    void fetch(`/api/chat/rooms/${room.slug}/typing`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mode === "recording" ? { mode: "recording" } : {}),
      credentials: "same-origin",
    }).catch(() => {});
  }, [room.slug, viewer]);

  return {
    list,
    hasMore,
    loadingOlder,
    pinned,
    online,
    typing,
    status,
    loadOlder,
    markRead,
    send,
    sendSticker,
    retry,
    edit,
    deleteForMe,
    deleteForEveryone,
    react,
    report,
    setPin,
    muteAuthor,
    sendTyping,
    removeLocal,
  };
}
