"use client";

import { useEffect, useState } from "react";
import { MonitorDown } from "lucide-react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Tombol install PWA custom. Muncul hanya kalau browser mengizinkan install (desktop/laptop). */
export function InstallButton() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setDone(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setDone(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!deferred || done) return null;
  return (
    <button
      type="button"
      onClick={() => void deferred.prompt()}
      className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-ink shadow-sm hover:border-brand-300 hover:text-brand-700"
    >
      <MonitorDown className="h-4 w-4" />
      Install aplikasi desktop
    </button>
  );
}
