"use client";

import { useEffect, useRef, useState } from "react";
import type { NameCheckType } from "@/lib/names";

type Props = {
  tipe: NameCheckType;
  id: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  maxLength?: number;
  autoComplete?: string;
  placeholder?: string;
  className?: string;
  /** Elemen prefix di dalam input (mis. "@"). */
  prefix?: React.ReactNode;
};

/** Input teks + status ketersediaan live (debounce, tanpa alert bawaan browser). Gagal fetch = diam (submit server tetap validasi). */
export function NameCheckInput({ tipe, id, prefix, defaultValue, ...rest }: Props) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [state, setState] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const v = value.trim();
    if (v.length < (tipe === "username" ? 3 : 2)) {
      setState(null);
      setBusy(false);
      return;
    }
    const my = ++seq.current;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/check-nama?tipe=${tipe}&nilai=${encodeURIComponent(v)}`, { headers: { accept: "application/json" } });
        const j = (await r.json()) as { tersedia?: boolean; pesan?: string };
        if (seq.current === my) setState({ ok: Boolean(j.tersedia), msg: String(j.pesan ?? "") });
      } catch {
        if (seq.current === my) setState(null);
      } finally {
        if (seq.current === my) setBusy(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [value, tipe]);

  return (
    <div>
      <div className="relative">
        {prefix}
        <input id={id} name={rest.name} value={value} onChange={(e) => setValue(e.target.value)} aria-describedby={state ? `${id}-status` : undefined} {...rest} />
      </div>
      <p id={`${id}-status`} aria-live="polite" className={`mt-1.5 min-h-4 text-xs ${!state ? (busy ? "text-slate-400" : "") : state.ok ? "text-emerald-600" : "text-rose-600"}`}>
        {busy && !state ? "Mengecek…" : state ? `${state.ok ? "✓" : "✗"} ${state.msg}` : ""}
      </p>
    </div>
  );
}
