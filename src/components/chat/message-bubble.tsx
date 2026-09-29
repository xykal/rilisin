"use client";

import { AlertCircle, Ban, Check, ChevronDown, Clock3, CornerUpLeft, EyeOff, ImageIcon } from "lucide-react";
import {
  memo,
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { isEmojiOnly } from "@/lib/chat/text";
import type { ChatMessageDTO } from "@/lib/chat/shared";
import { cn } from "../ui";
import { RichText } from "./format";
import { haptic, initialsOf, nameColor, timeLabel, useTz } from "./utils";

export type LocalMessage = ChatMessageDTO & { pending?: "sending" | "failed"; error?: string };

const LONG_PRESS_MS = 380;
const SWIPE_TRIGGER = 64;

/**
 * Gestur pesan:
 *  - tahan (long-press) ± 0,4 detik → buka menu fokus (seperti WhatsApp iPhone)
 *  - klik kanan (desktop) → menu yang sama
 *  - geser ke kanan (layar sentuh) → balas
 */
function useMessageGestures(opts: { enabled: boolean; onOpen: () => void; onSwipeReply?: () => void }) {
  const swipeRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const st = useRef({ timer: 0, x: 0, y: 0, active: false, fired: false, swiping: false, dx: 0, id: -1, type: "" });

  const resetSwipe = () => {
    const el = swipeRef.current;
    if (el) {
      el.style.transition = "transform 220ms cubic-bezier(.2,.9,.3,1)";
      el.style.transform = "";
    }
    if (iconRef.current) iconRef.current.style.opacity = "0";
  };

  const handlers = {
    onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
      if (!opts.enabled || (e.pointerType === "mouse" && e.button !== 0)) return;
      const s = st.current;
      s.active = true;
      s.fired = false;
      s.swiping = false;
      s.dx = 0;
      s.x = e.clientX;
      s.y = e.clientY;
      s.id = e.pointerId;
      s.type = e.pointerType;
      window.clearTimeout(s.timer);
      s.timer = window.setTimeout(() => {
        if (!s.active || s.swiping) return;
        s.fired = true;
        haptic(12);
        opts.onOpen();
      }, LONG_PRESS_MS);
    },
    onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
      const s = st.current;
      if (!s.active || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (!s.swiping && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) window.clearTimeout(s.timer);
      if (!opts.onSwipeReply || s.type === "mouse" || s.fired) return;
      if (!s.swiping && dx > 14 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        s.swiping = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
      }
      if (s.swiping) {
        const prev = s.dx;
        s.dx = Math.max(0, Math.min(dx, 110));
        const el = swipeRef.current;
        if (el) {
          el.style.transition = "none";
          el.style.transform = `translateX(${s.dx * 0.75}px)`;
        }
        if (iconRef.current) iconRef.current.style.opacity = String(Math.min(1, s.dx / SWIPE_TRIGGER));
        if (prev < SWIPE_TRIGGER && s.dx >= SWIPE_TRIGGER) haptic(8);
      }
    },
    onPointerUp() {
      const s = st.current;
      window.clearTimeout(s.timer);
      if (s.swiping && s.dx >= SWIPE_TRIGGER) opts.onSwipeReply?.();
      s.active = false;
      if (s.swiping) resetSwipe();
    },
    onPointerCancel() {
      const s = st.current;
      window.clearTimeout(s.timer);
      s.active = false;
      if (s.swiping) resetSwipe();
      s.swiping = false;
    },
    onContextMenu(e: ReactMouseEvent) {
      e.preventDefault();
      if (!opts.enabled) return;
      const s = st.current;
      window.clearTimeout(s.timer);
      if (!s.fired) {
        s.fired = true;
        opts.onOpen();
      }
    },
    onClickCapture(e: ReactMouseEvent) {
      const s = st.current;
      if (s.fired || s.swiping) {
        e.preventDefault();
        e.stopPropagation();
      }
      s.fired = false;
      s.swiping = false;
    },
  };
  return { swipeRef, iconRef, handlers };
}

function RoleBadge({ author }: { author: ChatMessageDTO["author"] }) {
  if (author.role === "admin") return <span className="chat-badge bg-rose-100 text-rose-700">Admin</span>;
  if (author.role === "moderator") return <span className="chat-badge bg-sky-100 text-sky-700">Moderator</span>;
  if (author.isSeller)
    return (
      <span className="chat-badge bg-brand-100 text-brand-700">
        Kreator{author.isTrusted ? " ✓" : ""}
      </span>
    );
  return null;
}

export function MiniAvatar({ user, size = 32 }: { user: { id: string; displayName: string; avatarUrl: string | null }; size?: number }) {
  if (user.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.avatarUrl} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.38), background: nameColor(user.id) }}
    >
      {initialsOf(user.displayName) || "?"}
    </span>
  );
}

type BubbleProps = {
  msg: LocalMessage;
  mine: boolean;
  /** Pesan pertama dari rangkaian pesan orang yang sama → tampilkan nama, avatar & "ekor" bubble. */
  first: boolean;
  viewerId: string | null;
  interactive: boolean;
  focused?: boolean;
  highlight?: boolean;
  /** Mode salinan di overlay fokus (tanpa gestur). */
  staticClone?: boolean;
  onOpenMenu?: (msg: LocalMessage, el: HTMLElement) => void;
  onReply?: (msg: LocalMessage) => void;
  onJump?: (id: string) => void;
  onOpenReactions?: (msg: LocalMessage) => void;
  onOpenImage?: (msg: LocalMessage) => void;
  onRetry?: (msg: LocalMessage) => void;
};

export const MessageBubble = memo(function MessageBubble(p: BubbleProps) {
  const tz = useTz();
  const bubbleRef = useRef<HTMLDivElement>(null);
  const { msg, mine } = p;
  const canInteract = p.interactive && !p.staticClone && !msg.pending;
  const { swipeRef, iconRef, handlers: gestures } = useMessageGestures({
    enabled: canInteract,
    onOpen: () => {
      if (bubbleRef.current) p.onOpenMenu?.(msg, bubbleRef.current);
    },
    onSwipeReply: !msg.deleted && !msg.hiddenByReports && p.onReply ? () => p.onReply?.(msg) : undefined,
  });

  const removed = !!msg.deleted || msg.hiddenByReports;
  const bigEmoji = !removed && !msg.image && !msg.replyTo && isEmojiOnly(msg.body);
  const color = nameColor(msg.author.id);
  // Di overlay fokus, reaksi disembunyikan (tidak terpotong & fokus ke isi pesan)
  const hasReactions = msg.reactions.length > 0 && !removed && !p.staticClone;
  const iReacted = !!p.viewerId && msg.reactions.some((r) => r.users.some((u) => u.id === p.viewerId));
  const totalReactions = msg.reactions.reduce((n, r) => n + r.count, 0);

  const meta = (
    <span className={cn("chat-meta", bigEmoji && "chat-meta-float")}>
      {msg.editedAt && !removed && <span>diedit</span>}
      <span>{timeLabel(msg.createdAt, tz)}</span>
      {mine && !removed && (
        msg.pending === "sending" ? (
          <Clock3 className="h-3 w-3" aria-label="Mengirim" />
        ) : msg.pending === "failed" ? (
          <AlertCircle className="h-3.5 w-3.5 text-red-600" aria-label="Gagal terkirim" />
        ) : (
          <Check className="h-3.5 w-3.5 text-brand-600" aria-label="Terkirim" />
        )
      )}
    </span>
  );

  let content;
  if (msg.deleted) {
    content = (
      <p className="chat-removed">
        <Ban className="h-4 w-4 shrink-0" />
        {msg.deleted === "moderator"
          ? "Pesan ini dihapus moderator"
          : mine
            ? "Kamu menghapus pesan ini"
            : "Pesan ini telah dihapus"}
        <span className="chat-spacer" />
        {meta}
      </p>
    );
  } else if (msg.hiddenByReports) {
    content = (
      <p className="chat-removed">
        <EyeOff className="h-4 w-4 shrink-0" />
        {mine ? "Pesanmu disembunyikan sementara karena dilaporkan anggota" : "Disembunyikan karena dilaporkan anggota — menunggu moderator"}
        <span className="chat-spacer" />
        {meta}
      </p>
    );
  } else {
    content = (
      <>
        {msg.replyTo && (
          <button
            type="button"
            className="chat-quote"
            style={{ borderColor: nameColor(msg.replyTo.authorId) } as CSSProperties}
            onClick={() => !msg.replyTo!.unavailable && p.onJump?.(msg.replyTo!.id)}
            tabIndex={p.staticClone ? -1 : 0}
          >
            <span className="block truncate text-[12.5px] font-bold" style={{ color: nameColor(msg.replyTo.authorId) }}>
              {msg.replyTo.authorId === p.viewerId ? "Kamu" : msg.replyTo.authorName}
            </span>
            <span className="line-clamp-2 text-[13px] text-slate-600">
              {msg.replyTo.unavailable ? (
                <i>Pesan tidak tersedia</i>
              ) : msg.replyTo.hasImage && !msg.replyTo.body ? (
                <span className="inline-flex items-center gap-1">
                  <ImageIcon className="h-3.5 w-3.5" /> Foto
                </span>
              ) : msg.replyTo.hasAudio && !msg.replyTo.body ? (
                <span className="inline-flex items-center gap-1">🎙 VN</span>
              ) : (
                msg.replyTo.body
              )}
            </span>
          </button>
        )}
        {msg.image && (
          <button
            type="button"
            className="chat-image"
            onClick={() => p.onOpenImage?.(msg)}
            tabIndex={p.staticClone ? -1 : 0}
            aria-label="Lihat gambar"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={msg.image.url}
              alt=""
              width={msg.image.w}
              height={msg.image.h}
              draggable={false}
              style={{ aspectRatio: `${msg.image.w} / ${msg.image.h}` }}
            />
            {!msg.body && <span className="chat-meta chat-meta-image">{timeLabel(msg.createdAt, tz)}</span>}
          </button>
        )}
        {msg.audio && (
          <div className="chat-voice">
            <audio controls preload="metadata" src={msg.audio.url} aria-label="Putar voice note" className="block h-10 w-56 max-w-full" />
            {!msg.body && <span className="chat-meta chat-meta-image">{timeLabel(msg.createdAt, tz)}</span>}
          </div>
        )}
        {(msg.body || (!msg.image && !msg.audio)) && (
          <div className={cn("chat-text", bigEmoji && "chat-text-emoji")}>
            <RichText text={msg.body} />
            {!bigEmoji && <span className={cn("chat-spacer", msg.editedAt && "chat-spacer-wide")} />}
            {meta}
          </div>
        )}
      </>
    );
  }

  return (
    <div
      data-mid={msg.id}
      className={cn(
        "group/row relative flex px-2 sm:px-4",
        mine ? "justify-end" : "justify-start",
        p.first ? "mt-2.5" : "mt-[3px]",
        hasReactions && "mb-5",
        p.focused && "opacity-0",
        p.staticClone && "!m-0 !p-0",
      )}
    >
      {!mine && !p.staticClone && (
        <div className="mr-1.5 w-8 shrink-0 self-start">{p.first && <MiniAvatar user={msg.author} />}</div>
      )}
      <div ref={swipeRef} className={cn("relative min-w-0", p.staticClone ? "max-w-full" : "max-w-[82%] sm:max-w-[68%]")}>
        {!p.staticClone && (
          <span ref={iconRef} className="chat-swipe-icon" aria-hidden="true">
            <CornerUpLeft className="h-4 w-4" />
          </span>
        )}
        <div
          ref={bubbleRef}
          role={canInteract ? "button" : undefined}
          tabIndex={canInteract ? 0 : undefined}
          aria-haspopup={canInteract ? "dialog" : undefined}
          aria-label={canInteract ? `Pesan dari ${mine ? "kamu" : msg.author.displayName}. Tahan atau tekan Enter untuk opsi.` : undefined}
          onKeyDown={(e) => {
            if (!canInteract) return;
            if (e.key === "Enter" || e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
              if (e.target !== e.currentTarget) return;
              e.preventDefault();
              p.onOpenMenu?.(msg, e.currentTarget);
            }
          }}
          className={cn(
            "chat-bubble",
            mine ? "chat-bubble-mine" : "chat-bubble-theirs",
            p.first && !bigEmoji && (mine ? "rounded-tr-[5px]" : "rounded-tl-[5px]"),
            bigEmoji && "chat-bubble-emoji",
            p.highlight && "chat-bubble-flash",
            msg.pending === "failed" && "ring-1 ring-red-300",
            p.staticClone && "chat-bubble-lifted",
          )}
          {...(canInteract ? gestures : {})}
        >
          {p.first && !bigEmoji && (
            <svg className={cn("chat-tail", mine ? "chat-tail-mine" : "chat-tail-theirs")} width="8" height="13" viewBox="0 0 8 13" aria-hidden="true">
              <path d={mine ? "M0 0h6.5c1.2 0 1.8 1.4.9 2.3L0 10V0z" : "M8 0H1.5C.3 0-.3 1.4.6 2.3L8 10V0z"} fill="currentColor" />
            </svg>
          )}
          {p.first && !mine && !removed && (
            <p className="mb-0.5 flex min-w-0 items-center gap-1.5 pr-4 text-[13px] font-bold leading-5" style={{ color }}>
              <span className="truncate">{msg.author.displayName}</span>
              <RoleBadge author={msg.author} />
            </p>
          )}
          {content}
          {canInteract && (
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className={cn("chat-chevron", mine ? "chat-chevron-mine" : "chat-chevron-theirs")}
              onClick={(e) => {
                e.stopPropagation();
                if (bubbleRef.current) p.onOpenMenu?.(msg, bubbleRef.current);
              }}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          )}
        </div>
        {hasReactions && (
          <button
            type="button"
            tabIndex={p.staticClone ? -1 : 0}
            onClick={() => p.onOpenReactions?.(msg)}
            className={cn("chat-reactions", mine ? "left-3" : "left-2", iReacted && "chat-reactions-mine")}
            aria-label={`${totalReactions} reaksi. Lihat siapa saja`}
          >
            {msg.reactions.slice(0, 3).map((r) => (
              <span key={r.emoji}>{r.emoji}</span>
            ))}
            {totalReactions > 1 && <span className="ml-0.5 text-[11px] font-semibold text-slate-600">{totalReactions}</span>}
          </button>
        )}
        {msg.pending === "failed" && !p.staticClone && (
          <button type="button" onClick={() => p.onRetry?.(msg)} className="mt-1 block w-full px-1 py-2 text-right text-[11.5px] font-semibold text-red-600">
            {msg.error ? `${msg.error} · ` : ""}Ketuk untuk kirim ulang / hapus
          </button>
        )}
      </div>
    </div>
  );
});
