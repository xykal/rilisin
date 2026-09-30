"use client";

import {
  ArrowDown,
  ArrowLeft,
  Copy,
  Flag,
  Home,
  Info,
  Lightbulb,
  Lock,
  MessagesSquare,
  MicOff,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Reply,
  Search,
  Share2,
  ShieldCheck,
  Timer,
  Trash2,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  canDeleteForEveryone,
  canEdit,
  isStaffRole,
  attachmentPreview,
  snippet,
  type ChatActivity,
  type ChatMessageDTO,
  type ChatMuteDTO,
  type ChatRoomDTO,
  type ChatViewerDTO,
} from "@/lib/chat/shared";
import { cn } from "../ui";
import { Composer } from "./composer";
import { ExternalLinkContext } from "./format";
import { MessageBubble, type LocalMessage } from "./message-bubble";
import { MessageFocus, type FocusMenuItem } from "./message-focus";
import { ActionSheet, EmojiSheet, Lightbox, LinkSheet, MuteSheet, ReactionsSheet, ReportSheet, Sheet } from "./sheets";
import { useRoom } from "./use-room";
import { copyText, dayKey, dayLabel, listTimeLabel, roomTint, timeLabel, TzContext, useDeviceTz, useMediaQuery, useTz } from "./utils";

/** Kebalikan persis dari varian CSS `chat-wide` (min-width 48rem DAN min-height 35rem). */
const CHAT_NARROW_QUERY = "not all and (min-width: 48rem), not all and (min-height: 35rem)";

type RoomInitial = {
  messages: ChatMessageDTO[];
  hasMore: boolean;
  pinned: ChatMessageDTO | null;
  lastReadSeq: number | null;
  mute: ChatMuteDTO;
};

export function ChatApp({
  rooms: initialRooms,
  activeSlug,
  viewer,
  initial,
  memberCount,
  inviteCode = null,
}: {
  rooms: ChatRoomDTO[];
  activeSlug: string | null;
  viewer: ChatViewerDTO | null;
  initial: RoomInitial | null;
  memberCount: number;
  /** Kode invite grup privat (hanya untuk anggota/staf) — dipakai tombol bagikan. */
  inviteCode?: string | null;
}) {
  const tz = useDeviceTz();
  const [rooms, setRooms] = useState(initialRooms);
  const room = rooms.find((r) => r.slug === activeSlug) ?? null;

  const onActivity = useCallback(
    (a: ChatActivity) => {
      setRooms((list) =>
        list.map((r) =>
          r.id === a.roomId
            ? {
                ...r,
                lastMessage: { authorName: a.authorName, preview: a.preview, at: a.at },
                unread: r.unread == null || a.authorId === viewer?.id ? r.unread : r.unread + 1,
              }
            : r,
        ),
      );
    },
    [viewer?.id],
  );
  const onRead = useCallback((roomId: string) => {
    setRooms((list) => list.map((r) => (r.id === roomId && r.unread ? { ...r, unread: 0 } : r)));
  }, []);
  const onOwnMessage = useCallback((roomId: string, preview: string, at: string, authorName: string) => {
    setRooms((list) => list.map((r) => (r.id === roomId ? { ...r, lastMessage: { authorName, preview, at } } : r)));
  }, []);

  // Layar HP: ruang chat tampil layar penuh (seperti aplikasi chat) — kunci scroll halaman di belakangnya.
  // Sama persis dengan varian CSS chat-narrow (globals.css): layar sempit ATAU pendek (HP landscape)
  const mobile = useMediaQuery(CHAT_NARROW_QUERY);
  useEffect(() => {
    if (!room || !mobile) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
    };
  }, [room, mobile]);

  const vv = useVisualViewport(!!room && mobile);

  return (
    <TzContext.Provider value={tz}>
      {/*
        Fullscreen ala WA (desktop/tablet): banner + header situs disembunyikan di rute chat (layout),
        chat mengisi seluruh viewport dari tepi ke tepi. Tinggi diatur globals.css (body:has(.chat-shell)
        → flex column); h-dvh di bawah hanya cadangan browser tanpa :has().
      */}
      <div className="chat-shell chat-wide:h-dvh">
        <div className="chat-wide:grid chat-wide:h-full chat-wide:grid-cols-[320px_minmax(0,1fr)] chat-wide:overflow-hidden chat-wide:bg-white chat-wide-lg:grid-cols-[360px_minmax(0,1fr)] min-[1600px]:grid-cols-[400px_minmax(0,1fr)]">
          <aside className={cn("flex min-h-0 flex-col bg-white chat-wide:border-r chat-wide:border-slate-200/80", room && "chat-narrow:hidden")}>
            <RoomList rooms={rooms} activeSlug={activeSlug} viewer={viewer} memberCount={memberCount} />
          </aside>
          <section
            className={cn(
              "flex min-h-0 min-w-0 flex-col",
              room ? "chat-narrow:fixed chat-narrow:inset-x-0 chat-narrow:top-0 chat-narrow:z-50 chat-narrow:h-dvh chat-narrow:bg-white" : "chat-narrow:hidden",
            )}
            style={room && mobile && vv ? { height: vv.height, top: vv.top } : undefined}
          >
            {room && initial ? (
              <RoomView
                key={room.slug}
                room={room}
                viewer={viewer}
                inviteCode={inviteCode}
                initial={initial}
                memberCount={memberCount}
                onActivity={onActivity}
                onRead={onRead}
                onOwnMessage={onOwnMessage}
              />
            ) : (
              <EmptyPane />
            )}
          </section>
        </div>
      </div>
    </TzContext.Provider>
  );
}

function useVisualViewport(enabled: boolean) {
  const [box, setBox] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!enabled || !vv) return;
    const update = () => setBox({ height: vv.height, top: vv.offsetTop });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [enabled]);
  return enabled ? box : null;
}

// ─── Daftar ruang ────────────────────────────────────────────────────────────
function RoomAvatar({ room, size = 48 }: { room: Pick<ChatRoomDTO, "slug" | "emoji">; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, background: roomTint(room.slug), fontSize: size * 0.48 }}
    >
      {room.emoji}
    </span>
  );
}

function RoomList({ rooms, activeSlug, viewer, memberCount }: { rooms: ChatRoomDTO[]; activeSlug: string | null; viewer: ChatViewerDTO | null; memberCount: number }) {
  const tz = useTz();
  const [q, setQ] = useState("");
  const shown = rooms.filter((r) => !q || `${r.name} ${r.description}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="px-4 pb-3 pt-5 chat-wide:pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Link href="/" aria-label="Ke beranda Rilisin" title="Ke beranda Rilisin" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-700">
              <Home className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">Komunitas</h1>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            <Users className="h-3.5 w-3.5" /> {memberCount.toLocaleString("id-ID")} anggota
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">Ngobrol, tanya-jawab, dan pamer karya bareng kreator Indonesia.</p>
        {viewer && (
          <Link
            href="/komunitas/baru"
            className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2 text-sm font-bold text-slate-600 hover:border-violet-400 hover:text-violet-700"
          >
            <Plus className="h-4 w-4" /> Buat grup
          </Link>
        )}
        <label className="relative mt-3 block">
          <span className="sr-only">Cari ruang</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari ruang obrolan"
            className="w-full rounded-xl bg-slate-100 py-2.5 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </label>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {shown.map((r) => {
          const active = r.slug === activeSlug;
          return (
            <li key={r.id}>
              <Link
                href={`/komunitas/${r.slug}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors",
                  active ? "bg-brand-50" : "hover:bg-slate-50 active:bg-slate-100",
                )}
              >
                <RoomAvatar room={r} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className={cn("truncate text-[15px] font-bold", active ? "text-brand-800" : "text-ink")}>{r.name}</span>
                      {r.kind === "announcement" && <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="Hanya admin yang bisa kirim" />}
                      {r.isPrivate && <Lock className="h-3.5 w-3.5 shrink-0 text-violet-500" aria-label="Grup privat" />}
                    </span>
                    {r.lastMessage && (
                      <span className={cn("shrink-0 text-[11.5px]", r.unread ? "font-bold text-brand-600" : "text-slate-400")}>
                        {listTimeLabel(r.lastMessage.at, tz)}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[13.5px] text-slate-500">
                      {r.lastMessage ? (
                        <>
                          <span className="font-medium text-slate-600">{r.lastMessage.authorName.split(" ")[0]}:</span> {r.lastMessage.preview}
                        </>
                      ) : (
                        r.description
                      )}
                    </span>
                    {!!r.unread && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">
                        {r.unread > 99 ? "99+" : r.unread}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
        {!shown.length && <li className="px-4 py-10 text-center text-sm text-slate-500">Tidak ada ruang yang cocok.</li>}
      </ul>
      <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
        <p className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          Ruang publik — sopan, tanpa SARA/spam/judol.{" "}
          <Link href="/komunitas/aturan" className="font-semibold text-brand-700 hover:underline">
            Aturan
          </Link>
        </p>
        {!viewer && (
          <Link href="/masuk?next=/komunitas" className="mt-2 flex w-full items-center justify-center rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
            Masuk untuk ikut ngobrol
          </Link>
        )}
      </div>
    </>
  );
}

function EmptyPane() {
  return (
    <div className="chat-wallpaper hidden h-full flex-col items-center justify-center p-10 text-center chat-wide:flex">
      <div className="rounded-[28px] bg-white/85 p-8 shadow-sm ring-1 ring-slate-200/70 backdrop-blur">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
          <MessagesSquare className="h-8 w-8" />
        </span>
        <h2 className="mt-5 text-xl font-extrabold text-ink">Pilih ruang obrolan</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">
          Pesan masuk secara realtime. Klik kanan atau arahkan kursor ke pesan untuk membalas, bereaksi, mengedit, atau menghapus.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs font-semibold text-slate-600">
          <span className="rounded-full bg-slate-100 px-3 py-1.5">⚡ Realtime</span>
          <span className="rounded-full bg-slate-100 px-3 py-1.5">😂 Reaksi emoji</span>
          <span className="rounded-full bg-slate-100 px-3 py-1.5">🛡️ Anti spam & judol</span>
        </div>
      </div>
    </div>
  );
}

// ─── Ruang chat ──────────────────────────────────────────────────────────────
type SheetState =
  | null
  | { kind: "delete" | "emoji" | "reactions" | "report" | "mute" | "retry"; msg: LocalMessage }
  | { kind: "info" };

function RoomView({
  room,
  viewer,
  inviteCode,
  initial,
  memberCount,
  onActivity,
  onRead,
  onOwnMessage,
}: {
  room: ChatRoomDTO;
  viewer: ChatViewerDTO | null;
  inviteCode: string | null | undefined;
  initial: RoomInitial;
  memberCount: number;
  onActivity: (a: ChatActivity) => void;
  onRead: (roomId: string) => void;
  onOwnMessage: (roomId: string, preview: string, at: string, authorName: string) => void;
}) {
  const tz = useTz();
  const finePointer = useMediaQuery("(pointer: fine)");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef(0);
  const showToast = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3400);
  }, []);
  const [expired, setExpired] = useState(false);
  const r = useRoom({ room, viewer, initial, onActivity, onError: showToast, onSessionExpired: () => setExpired(true) });

  const [replyTo, setReplyTo] = useState<LocalMessage | null>(null);
  const [editing, setEditing] = useState<LocalMessage | null>(null);
  const [focus, setFocus] = useState<{ msg: LocalMessage; rect: DOMRect } | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [mute] = useState(() => (initial.mute && new Date(initial.mute.until).getTime() > Date.now() ? initial.mute : null));

  const staff = isStaffRole(viewer?.role);
  const muted = !!mute;
  const canPost = !!viewer && !(room.kind === "announcement" && !staff) && !muted;
  const canReact = !!viewer && !muted;

  // Penanda "pesan belum dibaca" (dihitung sekali saat ruang dibuka)
  const [unreadAnchor] = useState(() => {
    if (initial.lastReadSeq == null || !viewer) return null;
    const idx = initial.messages.findIndex((m) => m.seq > initial.lastReadSeq! && m.author.id !== viewer.id);
    if (idx < 0) return null;
    return { id: initial.messages[idx]!.id, count: initial.messages.slice(idx).filter((m) => m.author.id !== viewer.id).length };
  });

  // ─── Scroll ────────────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [newBelow, setNewBelow] = useState(0);
  const prepend = useRef<{ height: number; top: number } | null>(null);

  const latestSeq = useMemo(() => {
    for (let i = r.list.length - 1; i >= 0; i--) if (!r.list[i]!.pending) return r.list[i]!.seq;
    return 0;
  }, [r.list]);

  const markLatest = useCallback(() => {
    if (!viewer || document.visibilityState !== "visible" || !latestSeq) return;
    r.markRead(latestSeq);
    onRead(room.id);
  }, [viewer, latestSeq, r, onRead, room.id]);

  const loadOlder = useCallback(async () => {
    const el = scrollRef.current;
    if (el) prepend.current = { height: el.scrollHeight, top: el.scrollTop };
    const loaded = await r.loadOlder();
    if (!loaded) prepend.current = null;
    return loaded;
  }, [r]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottom.current = dist < 96;
    setShowJump(dist > 360);
    if (atBottom.current) {
      setNewBelow(0);
      markLatest();
    }
    if (el.scrollTop < 260 && r.hasMore && !r.loadingOlder && viewer) void loadOlder();
  };

  // Posisi awal: ke penanda belum dibaca, atau ke paling bawah
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const anchor = unreadAnchor && el.querySelector<HTMLElement>(`[data-unread-anchor]`);
    if (anchor) {
      el.scrollTop = Math.max(0, anchor.offsetTop - 72);
      atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    } else el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstId = r.list[0]?.id;
  const lastId = r.list[r.list.length - 1]?.id;
  const prevEdges = useRef({ first: firstId, last: lastId });
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prev = prevEdges.current;
    if (prev.first !== firstId && prepend.current) {
      el.scrollTop = el.scrollHeight - prepend.current.height + prepend.current.top;
      prepend.current = null;
    } else if (prev.last !== lastId && lastId) {
      const last = r.list[r.list.length - 1]!;
      if (last.author.id === viewer?.id || atBottom.current) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        atBottom.current = true;
      } else if (!last.pending) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hitung pesan baru di bawah layar
        setNewBelow((n) => n + 1);
      }
    }
    prevEdges.current = { first: firstId, last: lastId };
  }, [firstId, lastId, r.list, viewer?.id]);

  // Tetap nempel di bawah saat tinggi konten berubah (gambar dimuat, reaksi ditambah, dll)
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current && !prepend.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (atBottom.current) markLatest();
  }, [latestSeq, markLatest]);

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    setNewBelow(0);
  };

  const jumpTo = useCallback(
    async (id: string) => {
      const find = () => scrollRef.current?.querySelector<HTMLElement>(`[data-mid="${CSS.escape(id)}"]`);
      let el = find();
      for (let i = 0; !el && i < 8; i++) {
        const loaded = await loadOlder();
        if (!loaded) break;
        await new Promise((res) => requestAnimationFrame(() => res(null)));
        el = find();
      }
      if (!el) return showToast("Pesan itu sudah terlalu lama / tidak tersedia.");
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setHighlight(id);
      window.setTimeout(() => setHighlight((h) => (h === id ? null : h)), 1700);
    },
    [loadOlder, showToast],
  );

  // ─── Menu fokus ─────────────────────────────────────────────────────────
  const openMenu = useCallback(
    (msg: LocalMessage, el: HTMLElement) => {
      if (!viewer) return;
      (document.activeElement as HTMLElement | null)?.blur?.();
      setFocus({ msg, rect: el.getBoundingClientRect() });
    },
    [viewer],
  );

  const menuItems = (msg: LocalMessage): FocusMenuItem[] => {
    const removed = !!msg.deleted || msg.hiddenByReports;
    const mine = msg.author.id === viewer?.id;
    const items: FocusMenuItem[] = [];
    if (!removed && canPost) items.push({ id: "reply", label: "Balas", icon: Reply });
    if (!removed && msg.body) items.push({ id: "copy", label: "Salin", icon: Copy });
    if (canEdit(msg, viewer?.id ?? null) && msg.body !== undefined) items.push({ id: "edit", label: "Edit", icon: Pencil });
    if (staff && !removed) {
      items.push(r.pinned?.id === msg.id ? { id: "unpin", label: "Lepas sematan", icon: PinOff } : { id: "pin", label: "Sematkan", icon: Pin });
    }
    if (!removed && !mine) items.push({ id: "report", label: "Laporkan", icon: Flag });
    if (staff && !mine && !isStaffRole(msg.author.role)) items.push({ id: "mute", label: "Bisukan anggota", icon: MicOff });
    items.push({ id: "delete", label: "Hapus", icon: Trash2, danger: true });
    return items;
  };

  const onMenuSelect = async (id: string, msg: LocalMessage) => {
    switch (id) {
      case "reply":
        setEditing(null);
        setReplyTo(msg);
        break;
      case "copy":
        showToast((await copyText(msg.body)) ? "Pesan disalin" : "Gagal menyalin");
        break;
      case "edit":
        setReplyTo(null);
        setEditing(msg);
        break;
      case "pin":
      case "unpin":
        if (await r.setPin(msg, id === "pin")) showToast(id === "pin" ? "Pesan disematkan" : "Sematan dilepas");
        break;
      case "report":
      case "mute":
      case "delete":
        setSheet({ kind: id, msg });
        break;
    }
  };

  const myReactionOn = (msg: LocalMessage) =>
    viewer ? (msg.reactions.find((x) => x.users.some((u) => u.id === viewer.id))?.emoji ?? null) : null;

  const typingNames = Object.values(r.typing).map((t) => t.name.split(" ")[0]);
  const subtitle = typingNames.length
    ? typingNames.length === 1
      ? `${typingNames[0]} sedang mengetik…`
      : typingNames.length === 2
        ? `${typingNames[0]} dan ${typingNames[1]} sedang mengetik…`
        : `${typingNames.length} orang sedang mengetik…`
    : r.status === "guest"
      ? `${memberCount.toLocaleString("id-ID")} anggota · masuk untuk ikut ngobrol`
      : r.status === "live"
        ? `${memberCount.toLocaleString("id-ID")} anggota · ${Math.max(r.online, 1)} online`
        : "Menyambungkan…";

  // Tip pertama kali
  const [tip, setTip] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- baca localStorage setelah mount
      if (viewer && !localStorage.getItem("rilisin-chat-tip")) setTip(true);
    } catch {}
  }, [viewer]);
  const closeTip = () => {
    setTip(false);
    try {
      localStorage.setItem("rilisin-chat-tip", "1");
    } catch {}
  };

  // Status koneksi (tampilkan banner kalau terputus > 2,5 dtk)
  const [showConn, setShowConn] = useState(false);
  useEffect(() => {
    if (r.status !== "connecting" && r.status !== "offline") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sembunyikan banner saat tersambung
      setShowConn(false);
      return;
    }
    const t = window.setTimeout(() => setShowConn(true), 2500);
    return () => window.clearTimeout(t);
  }, [r.status]);

  const disabled = !viewer
    ? { kind: "guest" as const, text: "Masuk untuk ikut ngobrol" }
    : room.kind === "announcement" && !staff
      ? { kind: "announcement" as const, text: "Hanya admin & moderator yang bisa mengirim pesan di sini" }
      : muted
        ? { kind: "muted" as const, text: `Kamu dibisukan moderator sampai ${timeLabel(mute!.until, tz)}` }
        : null;

  return (
    <ExternalLinkContext.Provider value={setLinkUrl}>
      <div className="relative flex h-full min-h-0 flex-col">
        {/* Header ruang */}
        <header className="z-10 flex items-center gap-2.5 border-b border-slate-200/80 bg-white/95 px-2 py-2 pt-[max(env(safe-area-inset-top),0.5rem)] backdrop-blur sm:px-4">
          <Link href="/komunitas" className="-ml-0.5 rounded-full p-2 text-slate-700 hover:bg-slate-100 chat-wide:hidden" aria-label="Kembali ke daftar ruang">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <button type="button" onClick={() => setSheet({ kind: "info" })} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-0.5 text-left">
            <RoomAvatar room={room} size={42} />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[16px] font-bold text-ink">{room.name}</span>
                {room.kind === "announcement" && <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                {room.slowModeSec > 0 && <Timer className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Mode lambat" />}
              </span>
              <span className={cn("block truncate text-[12.5px]", typingNames.length ? "font-semibold text-brand-600" : "text-slate-500")}>
                {subtitle}
              </span>
            </span>
          </button>
          <span
            className={cn("h-2.5 w-2.5 shrink-0 rounded-full", r.status === "live" ? "bg-emerald-500" : r.status === "guest" ? "bg-slate-300" : "animate-pulse bg-amber-400")}
            title={r.status === "live" ? "Tersambung realtime" : r.status === "guest" ? "Mode baca" : "Menyambungkan…"}
          />
          <button
            type="button"
            onClick={async () => {
              const url = `${window.location.origin}/komunitas/${room.slug}${room.isPrivate && inviteCode ? `?invite=${inviteCode}` : ""}`;
              showToast((await copyText(url)) ? "Link grup tersalin — bagikan ke temanmu" : "Gagal menyalin link");
            }}
            className="rounded-full p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Bagikan grup"
            title="Salin link grup"
          >
            <Share2 className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => setSheet({ kind: "info" })} className="rounded-full p-2 text-slate-600 hover:bg-slate-100" aria-label="Info ruang">
            <Info className="h-5 w-5" />
          </button>
        </header>

        {r.pinned && (
          <button
            type="button"
            onClick={() => void jumpTo(r.pinned!.id)}
            className="z-10 flex items-center gap-2.5 border-b border-slate-200/80 bg-white/90 px-4 py-2 text-left backdrop-blur hover:bg-white"
          >
            <Pin className="h-4 w-4 shrink-0 rotate-45 text-brand-600" />
            <span className="min-w-0">
              <span className="block text-[11.5px] font-bold text-brand-700">Pesan tersemat</span>
              <span className="block truncate text-[13px] text-slate-700">{r.pinned.body ? snippet(r.pinned.body, 120) : r.pinned.image ? "📷 Foto" : r.pinned.audio ? "🎤 Pesan suara" : "Pesan"}</span>
            </span>
          </button>
        )}

        {/* Daftar pesan */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="chat-wallpaper relative min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none]"
          aria-live="polite"
          aria-relevant="additions"
        >
          <div ref={contentRef} className="pb-3 pt-2">
            {showConn && (
              <div className="sticky top-2 z-10 mx-auto mb-1 flex w-fit items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm">
                <WifiOff className="h-3.5 w-3.5" /> Menyambungkan ulang…
              </div>
            )}
            {r.hasMore ? (
              <div className="py-3 text-center">
                {viewer ? (
                  <button type="button" onClick={() => void loadOlder()} className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
                    {r.loadingOlder ? "Memuat…" : "Muat pesan sebelumnya"}
                  </button>
                ) : (
                  <span className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-500 shadow-sm">Masuk untuk melihat pesan lebih lama</span>
                )}
              </div>
            ) : (
              <div className="mx-auto my-3 max-w-sm rounded-2xl bg-amber-50/95 px-4 py-3 text-center text-[12.5px] leading-relaxed text-amber-900 shadow-sm ring-1 ring-amber-200/70">
                <b>Selamat datang di {room.name}!</b> {room.description} Jaga sopan santun ya — lihat{" "}
                <Link href="/komunitas/aturan" className="font-semibold underline">
                  aturan komunitas
                </Link>
                .
              </div>
            )}
            {tip && (
              <div className="anim-slide-up mx-auto my-2 flex max-w-md items-start gap-2.5 rounded-2xl bg-white/95 px-3.5 py-3 text-[13px] text-slate-700 shadow-sm ring-1 ring-brand-100">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <p className="flex-1">
                  {finePointer ? (
                    <>
                      <b>Tips:</b> klik kanan pesan (atau tahan klik) untuk membalas, memberi reaksi, mengedit, atau menghapus.
                    </>
                  ) : (
                    <>
                      <b>Tips:</b> tahan pesan untuk membalas, reaksi emoji, edit &amp; hapus. Geser pesan ke kanan untuk membalas cepat.
                    </>
                  )}
                </p>
                <button type="button" onClick={closeTip} aria-label="Tutup tips" className="-m-1 shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {r.list.map((m, i) => {
              const prev = r.list[i - 1];
              const newDay = !prev || dayKey(prev.createdAt, tz) !== dayKey(m.createdAt, tz);
              const isAnchor = unreadAnchor?.id === m.id;
              const grouped =
                !!prev &&
                !newDay &&
                !isAnchor &&
                prev.author.id === m.author.id &&
                new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
              return (
                <Fragment key={m.id}>
                  {newDay && (
                    <div className="sticky top-2 z-[5] my-2 flex justify-center">
                      <span className="rounded-lg bg-white/95 px-3 py-1 text-[12px] font-semibold text-slate-600 shadow-sm">{dayLabel(m.createdAt, tz)}</span>
                    </div>
                  )}
                  {isAnchor && (
                    <div data-unread-anchor className="my-2 bg-white/70 py-1.5 text-center text-[12px] font-bold uppercase tracking-wide text-brand-700">
                      {unreadAnchor!.count} pesan belum dibaca
                    </div>
                  )}
                  <MessageBubble
                    msg={m}
                    mine={m.author.id === viewer?.id}
                    first={!grouped}
                    viewerId={viewer?.id ?? null}
                    interactive={!!viewer}
                    focused={focus?.msg.id === m.id}
                    highlight={highlight === m.id}
                    onOpenMenu={openMenu}
                    onReply={canPost ? (x) => { setEditing(null); setReplyTo(x); } : undefined}
                    onJump={jumpTo}
                    onOpenReactions={(x) => setSheet({ kind: "reactions", msg: x })}
                    onOpenImage={(x) => x.image && setLightbox(x.image.url)}
                    onRetry={(x) => setSheet({ kind: "retry", msg: x })}
                  />
                </Fragment>
              );
            })}
            {!r.list.length && (
              <p className="mx-auto mt-10 w-fit rounded-2xl bg-white/90 px-4 py-3 text-sm text-slate-500 shadow-sm">Belum ada pesan. Jadilah yang pertama menyapa! 👋</p>
            )}
          </div>
        </div>

        {showJump && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Ke pesan terbaru"
            className="anim-pop-in absolute bottom-[88px] right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <ArrowDown className="h-5 w-5" />
            {newBelow > 0 && (
              <span className="absolute -top-1.5 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white">{newBelow}</span>
            )}
          </button>
        )}

        {toast && (
          <div role="status" className="anim-pop-in absolute left-1/2 top-[72px] z-30 max-w-[90%] -translate-x-1/2 rounded-2xl bg-ink/90 px-4 py-2.5 text-center text-sm font-medium text-white shadow-lg backdrop-blur">
            {toast}
          </div>
        )}
        {expired && (
          <div className="absolute inset-x-3 top-[72px] z-30 rounded-2xl bg-white p-3 text-center text-sm shadow-lg ring-1 ring-slate-200">
            Sesi kamu berakhir.{" "}
            <Link href={`/masuk?next=/komunitas/${room.slug}`} className="font-semibold text-brand-700 underline">
              Masuk lagi
            </Link>
          </div>
        )}

        <Composer
          roomSlug={room.slug}
          disabled={disabled}
          replyTo={replyTo}
          editing={editing}
          viewerId={viewer?.id ?? null}
          slowModeSec={staff ? 0 : room.slowModeSec}
          onCancelReply={() => setReplyTo(null)}
          onCancelEdit={() => setEditing(null)}
          onTyping={r.sendTyping}
          onError={showToast}
          onSend={async (body, image, audio) => {
            const target = replyTo;
            setReplyTo(null);
            const ok = await r.send(body, target, image, audio);
            if (ok && viewer)
              onOwnMessage(room.id, attachmentPreview(body, image ? "image" : audio ? "audio" : null), new Date().toISOString(), viewer.displayName);
            return ok;
          }}
          onEdit={async (id, body) => {
            const ok = await r.edit(id, body);
            if (ok) setEditing(null);
            return ok;
          }}
        />

        {/* Overlay & sheet */}
        {focus && viewer && (
          <MessageFocus
            rect={focus.rect}
            mine={focus.msg.author.id === viewer.id}
            myReaction={myReactionOn(focus.msg)}
            showReactions={canReact && !focus.msg.deleted && !focus.msg.hiddenByReports}
            items={menuItems(focus.msg)}
            bubble={
              <MessageBubble
                msg={r.list.find((m) => m.id === focus.msg.id) ?? focus.msg}
                mine={focus.msg.author.id === viewer.id}
                first
                viewerId={viewer.id}
                interactive={false}
                staticClone
              />
            }
            onReact={(e) => void r.react(focus.msg, e)}
            onMoreEmoji={() => setSheet({ kind: "emoji", msg: focus.msg })}
            onSelect={(id) => void onMenuSelect(id, focus.msg)}
            onClose={() => setFocus(null)}
          />
        )}

        {sheet?.kind === "delete" && (
          <ActionSheet
            label="Hapus pesan"
            title={sheet.msg.author.id === viewer?.id ? "Hapus pesan ini?" : `Hapus pesan dari ${sheet.msg.author.displayName}?`}
            onClose={() => setSheet(null)}
            actions={[
              ...(canDeleteForEveryone(sheet.msg, viewer)
                ? [{ id: "everyone", label: "Hapus untuk semua orang", danger: true, onSelect: () => void r.deleteForEveryone(sheet.msg) }]
                : []),
              { id: "me", label: "Hapus untuk saya", danger: true, onSelect: () => void r.deleteForMe(sheet.msg) },
            ]}
          />
        )}
        {sheet?.kind === "retry" && (
          <ActionSheet
            label="Pesan gagal terkirim"
            title="Pesan belum terkirim."
            onClose={() => setSheet(null)}
            actions={[
              { id: "retry", label: "Kirim ulang", onSelect: () => void r.retry(sheet.msg) },
              { id: "discard", label: "Hapus pesan", danger: true, onSelect: () => r.removeLocal(sheet.msg.id) },
            ]}
          />
        )}
        {sheet?.kind === "emoji" && (
          <EmojiSheet current={myReactionOn(sheet.msg)} onPick={(e) => void r.react(sheet.msg, e)} onClose={() => setSheet(null)} />
        )}
        {sheet?.kind === "reactions" && (
          <ReactionsSheet
            reactions={(r.list.find((m) => m.id === sheet.msg.id) ?? sheet.msg).reactions}
            viewerId={viewer?.id ?? null}
            onRemoveMine={(e) => void r.react(r.list.find((m) => m.id === sheet.msg.id) ?? sheet.msg, e)}
            onClose={() => setSheet(null)}
          />
        )}
        {sheet?.kind === "report" && (
          <ReportSheet
            preview={sheet.msg.body}
            onClose={() => setSheet(null)}
            onSubmit={async (reason, note) => {
              const res = await r.report(sheet.msg, reason, note);
              if (res) showToast(res.already ? "Kamu sudah melaporkan pesan ini." : res.hidden ? "Terima kasih. Pesan disembunyikan sambil menunggu moderator." : "Terima kasih, laporan terkirim ke moderator.");
            }}
          />
        )}
        {sheet?.kind === "mute" && (
          <MuteSheet
            name={sheet.msg.author.displayName}
            onClose={() => setSheet(null)}
            onSubmit={async (minutes, reason) => {
              const until = await r.muteAuthor(sheet.msg, minutes, reason);
              if (until) showToast(`${sheet.msg.author.displayName} dibisukan sampai ${timeLabel(until, tz)}`);
            }}
          />
        )}
        {sheet?.kind === "info" && (
          <Sheet label={`Info ${room.name}`} onClose={() => setSheet(null)}>
            {() => (
              <div className="px-5 pt-4 text-center">
                <RoomAvatar room={room} size={72} />
                <p className="mt-3 text-xl font-extrabold text-ink">{room.name}</p>
                <p className="mt-1 text-sm text-slate-600">{room.description}</p>
                <div className="mt-4 grid gap-2 text-left text-sm">
                  <p className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 text-slate-700">
                    <Users className="h-4 w-4 text-slate-500" /> {memberCount.toLocaleString("id-ID")} anggota komunitas · {Math.max(r.online, viewer ? 1 : 0)} sedang online
                  </p>
                  {room.kind === "announcement" && (
                    <p className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 text-slate-700">
                      <Lock className="h-4 w-4 text-slate-500" /> Hanya admin &amp; moderator yang bisa mengirim pesan
                    </p>
                  )}
                  {room.isPrivate && (
                    <p className="flex items-center gap-2.5 rounded-xl bg-violet-50 px-3 py-2.5 text-violet-900">
                      <Lock className="h-4 w-4 shrink-0" /> Grup privat — gabung hanya via link undangan
                    </p>
                  )}
                  {room.isPrivate && inviteCode && (
                    <button
                      type="button"
                      onClick={async () => {
                        const url = `${window.location.origin}/komunitas/${room.slug}?invite=${inviteCode}`;
                        showToast((await copyText(url)) ? "Link undangan tersalin" : "Gagal menyalin link");
                      }}
                      className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 text-left text-slate-700 hover:bg-slate-100"
                    >
                      <Copy className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="min-w-0">
                        <span className="block text-xs text-slate-500">Link undangan (ketuk untuk salin)</span>
                        <span className="block truncate font-mono text-xs">…/komunitas/{room.slug}?invite={inviteCode.slice(0, 6)}…</span>
                      </span>
                    </button>
                  )}
                  {room.slowModeSec > 0 && (
                    <p className="flex items-center gap-2.5 rounded-xl bg-amber-50 px-3 py-2.5 text-amber-900">
                      <Timer className="h-4 w-4" /> Mode lambat: 1 pesan per {room.slowModeSec} detik
                    </p>
                  )}
                  {muted && (
                    <p className="flex items-center gap-2.5 rounded-xl bg-red-50 px-3 py-2.5 text-red-800">
                      <MicOff className="h-4 w-4" /> Kamu dibisukan sampai {timeLabel(mute!.until, tz)}
                      {mute?.reason ? ` — ${mute.reason}` : ""}
                    </p>
                  )}
                  <p className="flex items-start gap-2.5 rounded-xl bg-emerald-50 px-3 py-2.5 text-emerald-900">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Pesan disaring otomatis dari spam &amp; promosi judol. Lihat pesan bermasalah? Tahan pesannya → <b>Laporkan</b>.
                    </span>
                  </p>
                </div>
                <Link href="/komunitas/aturan" className="mt-4 inline-block text-sm font-semibold text-brand-700 hover:underline">
                  Baca aturan komunitas →
                </Link>
              </div>
            )}
          </Sheet>
        )}
        {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
        {linkUrl && <LinkSheet url={linkUrl} onClose={() => setLinkUrl(null)} />}
      </div>
    </ExternalLinkContext.Provider>
  );
}
