"use client";

import { useEffect, useState } from "react";

/** Hitung mundur ke waktu tayang (ISO). Nol → muat ulang sekali supaya konten live muncul. */
export function Countdown({ at }: { at: string }) {
  const target = new Date(at).getTime();
  const [left, setLeft] = useState(() => Math.max(0, target - Date.now()));
  useEffect(() => {
    if (left <= 0) {
      const t = setTimeout(() => window.location.reload(), 2500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setLeft(Math.max(0, target - Date.now())), 1000);
    return () => clearTimeout(t);
  }, [left, target]);
  if (left <= 0) return <span className="font-bold text-emerald-700">Segera tayang…</span>;
  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [...(d > 0 ? [`${d} hari`] : []), `${h} jam`, `${m} mnt`, `${sec} dtk`];
  return (
    <span className="font-mono text-lg font-extrabold tabular-nums text-ink" suppressHydrationWarning>
      {parts.join(" : ")}
    </span>
  );
}
