"use client";

import { ExternalLink, ShieldAlert, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { EMOJI_GROUPS, MUTE_OPTIONS, REPORT_REASONS, snippet, type ChatReactionDTO, type ReportReason } from "@/lib/chat/shared";
import { cn } from "../ui";
import { MiniAvatar } from "./message-bubble";

/** Bottom sheet (ala iOS): muncul dari bawah, latar diredupkan, tutup dengan tap di luar / Esc. */
export function Sheet({
  label,
  onClose,
  children,
  className,
  panel = true,
}: {
  label: string;
  onClose: () => void;
  children: (close: (after?: () => void) => void) => ReactNode;
  className?: string;
  /** false = tanpa panel putih (untuk action sheet gaya iOS). */
  panel?: boolean;
}) {
  const [closing, setClosing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = (after?: () => void) => {
    setClosing(true);
    window.setTimeout(() => {
      onClose();
      after?.();
    }, 190);
  };
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    const prevFocus = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      prevFocus?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={label}>
      <div
        className={cn("absolute inset-0 bg-slate-900/40", closing ? "anim-fade-out" : "anim-fade-in")}
        onClick={() => close()}
      />
      <div
        ref={ref}
        tabIndex={-1}
        className={cn(
          "relative w-full max-w-lg outline-none",
          closing ? "anim-sheet-down" : "anim-sheet-up",
          panel
            ? "max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-[28px] bg-white pb-[max(env(safe-area-inset-bottom),1rem)] shadow-2xl sm:mb-4 sm:rounded-[28px]"
            : "px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]",
          className,
        )}
      >
        {panel && <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-slate-300" aria-hidden="true" />}
        {children(close)}
      </div>
    </div>,
    document.body,
  );
}

/** Action sheet gaya iOS: grup tombol + tombol Batal terpisah. */
export function ActionSheet({
  label,
  title,
  actions,
  onClose,
}: {
  label: string;
  title?: string;
  actions: { id: string; label: string; danger?: boolean; onSelect: () => void }[];
  onClose: () => void;
}) {
  return (
    <Sheet label={label} onClose={onClose} panel={false}>
      {(close) => (
        <>
          <div className="overflow-hidden rounded-[18px] bg-white/95 text-center shadow-xl backdrop-blur-xl">
            {title && <p className="px-6 py-3.5 text-[13px] leading-snug text-slate-500">{title}</p>}
            {actions.map((a, i) => (
              <button
                key={a.id}
                type="button"
                onClick={() => close(a.onSelect)}
                className={cn(
                  "block w-full py-[15px] text-[17px] active:bg-slate-100",
                  (title || i > 0) && "border-t border-slate-200/80",
                  a.danger ? "text-red-600" : "text-brand-600",
                )}
              >
                {a.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => close()}
            className="mt-2 block w-full rounded-[18px] bg-white py-[15px] text-[17px] font-semibold text-brand-600 shadow-xl active:bg-slate-100"
          >
            Batal
          </button>
        </>
      )}
    </Sheet>
  );
}

export function EmojiSheet({ current, onPick, onClose }: { current: string | null; onPick: (e: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<string>(EMOJI_GROUPS[0].id);
  const group = EMOJI_GROUPS.find((g) => g.id === tab) ?? EMOJI_GROUPS[0];
  return (
    <Sheet label="Pilih reaksi" onClose={onClose}>
      {(close) => (
        <div className="px-4 pt-3">
          <p className="text-center text-sm font-bold text-ink">Pilih reaksi</p>
          <div className="scroll-thin mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {EMOJI_GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setTab(g.id)}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold",
                  tab === g.id ? "bg-ink text-white" : "bg-slate-100 text-slate-600",
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-8 gap-1 pb-2">
            {group.emojis.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => close(() => onPick(e))}
                className={cn("flex aspect-square items-center justify-center rounded-xl text-[26px] hover:bg-slate-100 active:scale-90", current === e && "bg-brand-100")}
                aria-label={`Reaksi ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}

export function ReactionsSheet({
  reactions,
  viewerId,
  onRemoveMine,
  onClose,
}: {
  reactions: ChatReactionDTO[];
  viewerId: string | null;
  onRemoveMine: (emoji: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<string>("all");
  const total = reactions.reduce((n, r) => n + r.count, 0);
  const rows = reactions
    .flatMap((r) => r.users.map((u) => ({ ...u, emoji: r.emoji })))
    .filter((r) => tab === "all" || r.emoji === tab);
  return (
    <Sheet label="Reaksi" onClose={onClose}>
      {(close) => (
        <div className="px-4 pt-3">
          <p className="text-center text-sm font-bold text-ink">Reaksi</p>
          <div className="mt-3 flex gap-1.5 overflow-x-auto border-b border-slate-100 pb-2">
            <button type="button" onClick={() => setTab("all")} className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold", tab === "all" ? "bg-brand-100 text-brand-700" : "text-slate-600")}>
              Semua {total}
            </button>
            {reactions.map((r) => (
              <button key={r.emoji} type="button" onClick={() => setTab(r.emoji)} className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold", tab === r.emoji ? "bg-brand-100 text-brand-700" : "text-slate-600")}>
                {r.emoji} {r.count}
              </button>
            ))}
          </div>
          <ul className="max-h-[50dvh] overflow-y-auto py-1">
            {rows.map((r) => {
              const me = r.id === viewerId;
              return (
                <li key={`${r.id}-${r.emoji}`}>
                  <button
                    type="button"
                    disabled={!me}
                    onClick={() => close(() => onRemoveMine(r.emoji))}
                    className="flex w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left enabled:hover:bg-slate-50"
                  >
                    <MiniAvatar user={{ id: r.id, displayName: r.name, avatarUrl: null }} size={38} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-ink">{me ? "Kamu" : r.name}</span>
                      {me && <span className="block text-xs text-slate-500">Ketuk untuk menghapus</span>}
                    </span>
                    <span className="text-2xl">{r.emoji}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Sheet>
  );
}

export function ReportSheet({
  preview,
  onSubmit,
  onClose,
}: {
  preview: string;
  onSubmit: (reason: ReportReason, note: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  return (
    <Sheet label="Laporkan pesan" onClose={onClose}>
      {(close) => (
        <form
          className="px-5 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason) close(() => onSubmit(reason, note));
          }}
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-600" />
            <p className="text-base font-bold text-ink">Laporkan pesan</p>
          </div>
          {preview && <p className="mt-2 line-clamp-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">“{snippet(preview, 140)}”</p>}
          <p className="mt-3 text-sm text-slate-600">Kenapa pesan ini bermasalah? Laporanmu anonim — penulis tidak tahu siapa yang melapor.</p>
          <div className="mt-2 grid gap-1.5">
            {REPORT_REASONS.map((r) => (
              <label key={r.id} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm", reason === r.id ? "border-brand-400 bg-brand-50 font-semibold text-brand-800" : "border-slate-200 text-slate-700")}>
                <input type="radio" name="reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} className="accent-brand-600" />
                {r.label}
              </label>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            placeholder="Catatan untuk moderator (opsional)"
            rows={2}
            className="mt-3 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
          />
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => close()} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-700">
              Batal
            </button>
            <button type="submit" disabled={!reason} className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white disabled:opacity-40">
              Kirim laporan
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

export function MuteSheet({ name, onSubmit, onClose }: { name: string; onSubmit: (minutes: number, reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <Sheet label={`Bisukan ${name}`} onClose={onClose}>
      {(close) => (
        <div className="px-5 pt-3">
          <p className="text-base font-bold text-ink">Bisukan {name}</p>
          <p className="mt-1 text-sm text-slate-600">Anggota yang dibisukan tetap bisa membaca, tapi tidak bisa mengirim pesan atau reaksi di semua ruang.</p>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 200))}
            placeholder="Alasan (dicatat di log moderasi)"
            className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
          />
          <div className="mt-3 grid grid-cols-3 gap-2">
            {MUTE_OPTIONS.map((o) => (
              <button key={o.minutes} type="button" onClick={() => close(() => onSubmit(o.minutes, reason))} className="rounded-xl bg-amber-50 py-3 text-sm font-bold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100">
                {o.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => close()} className="mt-2 w-full rounded-xl py-3 text-sm font-semibold text-slate-600">
            Batal
          </button>
        </div>
      )}
    </Sheet>
  );
}

/** Peringatan sebelum membuka link luar (anti phishing). */
export function LinkSheet({ url, onClose }: { url: string; onClose: () => void }) {
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {}
  return (
    <Sheet label="Buka link luar" onClose={onClose}>
      {(close) => (
        <div className="px-5 pt-3">
          <div className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5 text-brand-600" />
            <p className="text-base font-bold text-ink">Buka link di luar Rilisin?</p>
          </div>
          <p className="mt-3 break-all rounded-xl bg-slate-50 px-3 py-2.5 font-mono text-[13px] text-slate-700">
            <b className="text-ink">{host}</b>
            <br />
            {url.length > 160 ? `${url.slice(0, 160)}…` : url}
          </p>
          <p className="mt-3 text-sm text-slate-600">
            Pastikan alamatnya benar. Tim Rilisin <b>tidak pernah</b> meminta password, kode OTP, atau kode 2FA kamu — lewat chat maupun link.
          </p>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => close()} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-700">
              Batal
            </button>
            <button
              type="button"
              onClick={() => close(() => window.open(url, "_blank", "noopener,noreferrer"))}
              className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white"
            >
              Buka link
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="anim-fade-in fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-3" role="dialog" aria-modal="true" aria-label="Gambar" onClick={onClose}>
      <button type="button" aria-label="Tutup" className="absolute right-3 top-3 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20" onClick={onClose}>
        <X className="h-6 w-6" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="anim-pop-in max-h-[92dvh] max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body,
  );
}
