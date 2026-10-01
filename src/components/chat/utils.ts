"use client";

import { createContext, useContext, useEffect, useState } from "react";

// ─── Zona waktu: SSR pakai WIB, setelah hydrate pakai zona waktu perangkat ──
export const DEFAULT_TZ = "Asia/Jakarta";
export const TzContext = createContext(DEFAULT_TZ);
export const useTz = () => useContext(TzContext);

export function useDeviceTz() {
  const [tz, setTz] = useState(DEFAULT_TZ);
  useEffect(() => {
    try {
      const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sekali setelah hydrate (hindari mismatch SSR)
      if (local) setTz(local);
    } catch {}
  }, []);
  return tz;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, opts: Intl.DateTimeFormatOptions, locale = "id-ID") {
  const key = `${locale}|${tz}|${JSON.stringify(opts)}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...opts, timeZone: tz });
    fmtCache.set(key, f);
  }
  return f;
}

export function dayKey(iso: string, tz: string) {
  return fmt(tz, { year: "numeric", month: "2-digit", day: "2-digit" }, "en-CA").format(new Date(iso));
}

export function timeLabel(iso: string, tz: string) {
  return fmt(tz, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

function dayDiff(iso: string, tz: string) {
  const a = new Date(dayKey(iso, tz)).getTime();
  const b = new Date(dayKey(new Date().toISOString(), tz)).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function dayLabel(iso: string, tz: string) {
  const diff = dayDiff(iso, tz);
  if (diff === 0) return "Hari ini";
  if (diff === 1) return "Kemarin";
  if (diff < 7) return fmt(tz, { weekday: "long" }).format(new Date(iso));
  return fmt(tz, { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

export function listTimeLabel(iso: string, tz: string) {
  const diff = dayDiff(iso, tz);
  if (diff === 0) return timeLabel(iso, tz);
  if (diff === 1) return "Kemarin";
  if (diff < 7) return fmt(tz, { weekday: "short" }).format(new Date(iso));
  return fmt(tz, { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(iso));
}

// ─── Warna nama anggota (konsisten per user, seperti grup WhatsApp) ─────────
const NAME_COLORS = ["#d23f3f", "#0b8577", "#7a4cc9", "#c2338a", "#2b8a4e", "#d0550f", "#3a5bd9", "#a8610a", "#08799a", "#9a34b3"];
export function nameColor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return NAME_COLORS[h % NAME_COLORS.length]!;
}

const ROOM_TINTS = ["#ede9fe", "#e0f2fe", "#dcfce7", "#fef3c7", "#ffe4e6", "#fae8ff", "#e0e7ff", "#ccfbf1"];
export function roomTint(slug: string) {
  let h = 0;
  for (const ch of slug) h = (h * 17 + ch.charCodeAt(0)) >>> 0;
  return ROOM_TINTS[h % ROOM_TINTS.length]!;
}

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

// ─── Panggilan API ──────────────────────────────────────────────────────────
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; code?: string; retryAfter?: number };

const CONNECTION_LOST = "Koneksi terputus. Cek internet kamu lalu coba lagi.";
type ApiBody = { error?: string; code?: string; retryAfter?: number };

export async function chatApi<T>(url: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      // Backstop 15 dtk: API tidak boleh gantung selamanya (pool DB antre, dsb).
      // Timeout mendarat di catch → CONNECTION_LOST → UI retry/polling yang tangani.
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 204) return { ok: true, data: undefined as T };
    let data: ApiBody | null = null;
    try {
      const parsed: unknown = await res.json();
      if (parsed && typeof parsed === "object") data = parsed as ApiBody;
    } catch {
      data = null;
    }
    if (!res.ok) {
      return { ok: false, status: res.status, error: data?.error ?? `Gagal (${res.status})`, code: data?.code, retryAfter: data?.retryAfter };
    }
    // 2xx tapi body rusak/terputus (mis. pindah halaman saat respons masih dibaca, sinyal jelek) → anggap gagal
    // jaringan, JANGAN dianggap sukses dengan data kosong (dulu memicu "e is undefined" di Firefox).
    if (!data) return { ok: false, status: 0, error: CONNECTION_LOST };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, status: 0, error: CONNECTION_LOST };
  }
}

export function newClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Cadangan untuk browser/iframe tanpa izin clipboard
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    ta.remove();
    return ok;
  }
}

export function haptic(ms = 10) {
  try {
    navigator.vibrate?.(ms);
  } catch {}
}

export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatch(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return match;
}
