"use client";

import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Kotak verifikasi Cloudflare Turnstile. Dirender eksplisit (tidak auto-scan) supaya aman dengan React;
 * token masuk ke input tersembunyi `cf-turnstile-response` di dalam form. Token sekali pakai →
 * `resetKey` berubah (mis. setelah server menolak form) = minta token baru.
 */
export function TurnstileWidget({ siteKey, action, resetKey }: { siteKey: string; action: string; resetKey?: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const render = () => {
      if (cancelled || !ref.current || !window.turnstile || widgetId.current) return;
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        action,
        theme: "light",
        language: "id",
        size: "flexible",
        "response-field-name": "cf-turnstile-response",
      });
    };
    render();
    const timer = window.setInterval(() => {
      if (window.turnstile) {
        window.clearInterval(timer);
        render();
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, action]);

  useEffect(() => {
    if (resetKey !== undefined && widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
  }, [resetKey]);

  return <div ref={ref} data-turnstile={siteKey} className="min-h-[65px]" aria-label="Verifikasi keamanan Cloudflare" />;
}
