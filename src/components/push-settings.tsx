"use client";

import { useEffect, useState } from "react";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/push-client";
import { Alert } from "./ui";

/**
 * Panel perangkat di /akun/notifikasi: status izin + tombol aktifkan/matikan push HP.
 * Fokus iPhone: push Safari iOS butuh web dibuka dari ikon Home Screen (bukan tab Safari biasa).
 */
export function PushDevicePanel() {
  const [st, setSt] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getPushState().then((s) => alive && setSt(s));
    return () => {
      alive = false;
    };
  }, []);

  if (!st) return <p className="text-sm text-slate-500">Memeriksa dukungan push di perangkat ini…</p>;
  if (!st.supported)
    return <Alert tone="info">Browser ini tidak mendukung push (atau service worker dimatikan). Coba Chrome/Edge/Firefox terbaru.</Alert>;

  const onEnable = async () => {
    setBusy(true);
    setMsg(null);
    const r = await enablePush();
    setBusy(false);
    if (r === "ok") {
      setMsg("Push aktif di perangkat ini.");
      setSt(await getPushState());
    } else if (r === "denied") {
      setMsg("Izin ditolak — buka gembok/info di address bar browser, izinkan Notifikasi, lalu coba lagi.");
      setSt(await getPushState());
    } else {
      setMsg("SDK push gagal dimuat (koneksi / pemblokir iklan?). Coba lagi nanti.");
    }
  };
  const onDisable = async () => {
    setBusy(true);
    await disablePush();
    setBusy(false);
    setMsg("Push dimatikan di perangkat ini.");
    setSt(await getPushState());
  };

  return (
    <div className="space-y-3">
      {msg && <Alert tone={st.subscribed ? "success" : "info"}>{msg}</Alert>}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold ${st.subscribed ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
        >
          {st.subscribed ? "Push aktif" : "Push mati"}
        </span>
        {st.subscribed ? (
          <button
            type="button"
            onClick={() => void onDisable()}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center rounded-full border border-slate-300 px-5 text-sm font-semibold text-ink hover:bg-slate-50 disabled:opacity-50"
          >
            {busy ? "Memproses…" : "Matikan di perangkat ini"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void onEnable()}
            disabled={busy || st.permission === "denied"}
            className="inline-flex min-h-[44px] items-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Memproses…" : "Aktifkan push di perangkat ini"}
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500">
        iPhone: install dulu via Bagikan → “Add to Home Screen”, lalu aktifkan push dari ikon Home Screen (syarat iOS 16.4+). Safari Mac butuh
        sertifikat Apple berbayar — belum didukung.
      </p>
    </div>
  );
}
