"use client";

import { Plus, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { QUICK_REACTIONS } from "@/lib/chat/shared";
import { cn } from "../ui";

export type FocusMenuItem = { id: string; label: string; icon: LucideIcon; danger?: boolean };

/**
 * Overlay "tahan pesan" ala WhatsApp iPhone:
 *  - latar di-blur & digelapkan
 *  - bubble yang ditahan "terangkat" (animasi dari posisi aslinya), digeser supaya muat di layar
 *  - bar reaksi emoji di atas bubble, menu aksi di bawahnya
 */
export function MessageFocus({
  rect,
  mine,
  bubble,
  items,
  myReaction,
  showReactions,
  onReact,
  onMoreEmoji,
  onSelect,
  onClose,
}: {
  rect: DOMRect;
  mine: boolean;
  bubble: ReactNode;
  items: FocusMenuItem[];
  myReaction: string | null;
  showReactions: boolean;
  onReact: (emoji: string) => void;
  onMoreEmoji: () => void;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openedAt = useRef(0);
  /**
   * Jari yang menahan pesan masih menempel saat overlay muncul — sebagian browser mengirim "click"
   * saat jari diangkat, tepat di atas item menu. Aksi baru dianggap sah setelah ada sentuhan/klik BARU
   * di dalam overlay (atau lewat keyboard: event.detail === 0).
   */
  const armed = useRef(false);
  const allowed = (e: { detail: number }) => armed.current || e.detail === 0;
  const [layout, setLayout] = useState<{ colTop: number; shift: number; side: number; maxBubbleH: number } | null>(null);
  const [phase, setPhase] = useState<"enter" | "open" | "closing">("enter");

  useLayoutEffect(() => {
    const vv = window.visualViewport;
    const vh = vv?.height ?? window.innerHeight;
    const vw = vv?.width ?? window.innerWidth;
    const gap = 8;
    const margin = 12;
    const barH = barRef.current?.offsetHeight ?? 0;
    const menuH = menuRef.current?.offsetHeight ?? 0;
    const maxBubbleH = Math.max(80, vh - barH - menuH - gap * 2 - margin * 2);
    const bubbleH = Math.min(bubbleRef.current?.offsetHeight ?? rect.height, maxBubbleH);
    const minTop = margin + (barH ? barH + gap : 0);
    const maxTop = vh - margin - menuH - gap - bubbleH;
    const top = Math.min(Math.max(rect.top, minTop), Math.max(minTop, maxTop));
    const side = mine ? Math.max(margin, vw - rect.right) : Math.max(margin, rect.left);
    openedAt.current = performance.now();
    // ukur dulu, baru posisikan (useLayoutEffect → sebelum paint, tidak berkedip)
    setLayout({ colTop: top - (barH ? barH + gap : 0), shift: rect.top - top, side, maxBubbleH });
  }, [rect, mine]);

  useEffect(() => {
    if (!layout) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setPhase("open")));
    return () => cancelAnimationFrame(id);
  }, [layout]);

  const close = (after?: () => void) => {
    setPhase("closing");
    window.setTimeout(() => {
      onClose();
      after?.();
    }, 170);
  };

  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    dialogRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = phase === "open";
  const shown = layout !== null;
  const originX = mine ? "right" : "left";

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Opsi pesan"
      className="fixed inset-0 z-[60] touch-none outline-none"
      onPointerDownCapture={() => {
        armed.current = true;
      }}
    >
      <div
        className={cn(
          "absolute inset-0 bg-slate-900/25 backdrop-blur-md transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
        onClick={(e) => {
          if (allowed(e) && performance.now() - openedAt.current > 250) close();
        }}
      />
      <div
        className={cn("absolute flex flex-col", mine ? "items-end" : "items-start", !shown && "invisible")}
        style={{
          top: layout?.colTop ?? rect.top,
          ...(mine ? { right: layout?.side ?? 12 } : { left: layout?.side ?? 12 }),
          maxWidth: "calc(100vw - 24px)",
        }}
      >
        {showReactions ? (
          <div
            ref={barRef}
            className="focus-emoji-bar mb-2"
            style={{
              transformOrigin: `${originX} bottom`,
              transform: open ? "scale(1)" : "scale(0.6)",
              opacity: open ? 1 : 0,
            }}
          >
            {QUICK_REACTIONS.map((e, i) => (
              <button
                key={e}
                type="button"
                aria-label={`Reaksi ${e}`}
                aria-pressed={myReaction === e}
                onClick={(ev) => allowed(ev) && close(() => onReact(e))}
                className={cn("focus-emoji", myReaction === e && "bg-slate-200/90")}
                style={{ transitionDelay: open ? `${40 + i * 25}ms` : "0ms", transform: open ? "scale(1)" : "scale(0.4)" }}
              >
                {e}
              </button>
            ))}
            <button
              type="button"
              aria-label="Emoji lainnya"
              onClick={(ev) => allowed(ev) && close(onMoreEmoji)}
              className="ml-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <div ref={barRef} />
        )}

        <div
          ref={bubbleRef}
          className="overflow-hidden rounded-[18px]"
          style={{
            width: rect.width,
            maxWidth: "calc(100vw - 24px)",
            maxHeight: layout?.maxBubbleH,
            transform: open ? "translateY(0) scale(1.02)" : `translateY(${layout?.shift ?? 0}px) scale(1)`,
            transformOrigin: `${originX} center`,
            transition: "transform 300ms cubic-bezier(.2,.9,.25,1.12)",
          }}
        >
          {bubble}
        </div>

        <div
          ref={menuRef}
          role="menu"
          className="focus-menu mt-2"
          style={{
            transformOrigin: `${originX} top`,
            transform: open ? "scale(1)" : "scale(0.7)",
            opacity: open ? 1 : 0,
          }}
        >
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              role="menuitem"
              onClick={(ev) => allowed(ev) && close(() => onSelect(it.id))}
              className={cn("focus-menu-item", it.danger && "text-red-600")}
            >
              <span>{it.label}</span>
              <it.icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
