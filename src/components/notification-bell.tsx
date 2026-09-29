"use client";

import { Bell, CheckCheck, LoaderCircle, Settings } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { initials } from "@/lib/format";
import type { NotificationDTO } from "@/lib/notifications/shared";
import { NotificationIcon } from "./notification-icon";
import { cn } from "./ui";

const POLL_MS = 60_000;
/** Berhenti polling kalau user tidak berinteraksi selama ini (tab terbuka seharian tidak membangunkan database terus). */
const IDLE_MS = 10 * 60_000;

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} mnt`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam`;
  if (s < 604800) return `${Math.floor(s / 86400)} hr`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

function MiniAvatar({ actor }: { actor: NotificationDTO["actor"] }) {
  if (!actor) return null;
  return actor.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={actor.avatarUrl} alt="" className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-white object-cover" />
  ) : (
    <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-slate-500 text-[8px] font-bold text-white">
      {initials(actor.name).slice(0, 2)}
    </span>
  );
}

export function NotificationBell({ initialUnread, className }: { initialUnread: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const lastActive = useRef(0);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Angka dari server berubah (navigasi / revalidate) → ikuti, tanpa efek tambahan (pola "derived state" React).
  const [serverUnread, setServerUnread] = useState(initialUnread);
  if (serverUnread !== initialUnread) {
    setServerUnread(initialUnread);
    setUnread(initialUnread);
  }

  const loadList = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/notifications?limit=8", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { unread: number; items: NotificationDTO[] };
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread", { cache: "no-store" });
      if (res.ok) setUnread(((await res.json()) as { unread: number }).unread);
    } catch {
      /* jaringan putus — coba lagi di siklus berikutnya */
    }
  }, []);

  // Realtime: server mendorong event "notif" saat ada notifikasi baru (SSE, satu koneksi per tab).
  // Tamu dapat 401 → EventSource berhenti sendiri (HTTP error tidak di-retry browser).
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/notifications/stream");
    } catch {
      return;
    }
    const onNotif = () => {
      if (openRef.current) void loadList();
      else void refreshUnread();
    };
    es.addEventListener("notif", onNotif);
    es.addEventListener("ready", onNotif);
    return () => es?.close();
  }, [loadList, refreshUnread]);

  // Polling hemat sebagai jaring pengaman (kalau SSE mati diam-diam): hanya saat tab terlihat & user masih aktif.
  useEffect(() => {
    lastActive.current = Date.now();
    const mark = () => {
      lastActive.current = Date.now();
    };
    const poll = async () => {
      if (document.visibilityState !== "visible" || Date.now() - lastActive.current > IDLE_MS) return;
      await refreshUnread();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        mark();
        void poll();
      }
    };
    const timer = window.setInterval(poll, POLL_MS);
    window.addEventListener("pointerdown", mark, { passive: true });
    window.addEventListener("keydown", mark);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("keydown", mark);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshUnread]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void loadList();
  };

  const markAll = async () => {
    setUnread(0);
    setItems((cur) => cur?.map((n) => ({ ...n, read: true })) ?? cur);
    await fetch("/api/notifications/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ all: true }) }).catch(() => {});
  };

  const badge = unread > 99 ? "99+" : String(unread);
  return (
    <div ref={rootRef} className={cn("max-sm:static sm:relative", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={unread ? `Notifikasi, ${unread} belum dibaca` : "Notifikasi"}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 min-w-[18px] rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white ring-2 ring-white">
            {badge}
          </span>
        )}
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifikasi"
          className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw_-_1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <p className="font-bold text-ink">Notifikasi</p>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button type="button" onClick={markAll} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50">
                  <CheckCheck className="h-3.5 w-3.5" /> Tandai dibaca
                </button>
              )}
              <Link href="/akun/notifikasi" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Pengaturan notifikasi">
                <Settings className="h-4 w-4" />
              </Link>
            </div>
          </div>
          <div className="max-h-[min(28rem,70vh)] overflow-y-auto overscroll-contain">
            {loading && !items ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                <LoaderCircle className="h-4 w-4 animate-spin" /> Memuat…
              </div>
            ) : failed && !items ? (
              <div className="py-10 text-center text-sm text-slate-500">
                Gagal memuat.{" "}
                <button type="button" onClick={loadList} className="font-semibold text-brand-700 hover:underline">
                  Coba lagi
                </button>
              </div>
            ) : items && items.length ? (
              <ul className="divide-y divide-slate-100">
                {items.map((n) => (
                  <li key={n.id}>
                    <a href={n.href} className={cn("flex gap-3 px-4 py-3 hover:bg-slate-50", !n.read && "bg-brand-50/50")}>
                      <span className="relative shrink-0">
                        <NotificationIcon type={n.type} />
                        <MiniAvatar actor={n.actor} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm leading-snug text-ink", !n.read && "font-semibold")}>{n.title}</span>
                        {n.body && <span className="mt-0.5 line-clamp-2 block break-words text-xs text-slate-500">{n.body}</span>}
                        <span className="mt-1 block text-[11px] text-slate-400">{ago(n.at)}</span>
                      </span>
                      {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Belum dibaca" />}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-6 py-10 text-center">
                <Bell className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm font-semibold text-ink">Belum ada notifikasi</p>
                <p className="mt-1 text-xs text-slate-500">Balasan forum, ulasan, dan penjualan akan muncul di sini.</p>
              </div>
            )}
          </div>
          <Link href="/notifikasi" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-3 text-center text-sm font-semibold text-brand-700 hover:bg-slate-50">
            Lihat semua notifikasi
          </Link>
        </div>
      )}
    </div>
  );
}
