"use client";

import { useEffect, useRef } from "react";

/**
 * Splash screen animasi (brand kit): overlay gelap + logo draw→fill→sheen.
 * - Tampil 1x per sesi (sessionStorage), 3,8 dtk setelah load (1 siklus animasi).
 * - Failsafe 8 dtk: user tidak pernah terkunci kalau event load bermasalah.
 * - prefers-reduced-motion: langsung sembunyi. Server & klien render sama (no hydration issue).
 */
const SEEN_KEY = "rilisin-splash-seen";
const DISPLAY_MS = 3800;
const FAILSAFE_MS = 8000;

export function SplashScreen() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const timers: number[] = [];
    const cleanup = () => timers.forEach((t) => window.clearTimeout(t));
    try {
      if (sessionStorage.getItem(SEEN_KEY)) {
        el.classList.add("hide-splash", "no-anim");
        return cleanup;
      }
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* mode privat: storage bisa mati — tetap tampil sekali per load */
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("hide-splash");
      return cleanup;
    }
    const hide = () => el.classList.add("hide-splash");
    if (document.readyState === "complete") {
      timers.push(window.setTimeout(hide, DISPLAY_MS));
    } else {
      const onLoad = () => timers.push(window.setTimeout(hide, DISPLAY_MS));
      window.addEventListener("load", onLoad, { once: true });
      timers.push(window.setTimeout(hide, FAILSAFE_MS));
      return () => {
        window.removeEventListener("load", onLoad);
        cleanup();
      };
    }
    timers.push(window.setTimeout(hide, FAILSAFE_MS));
    return cleanup;
  }, []);

  return (
    <div ref={ref} id="rilisin-splash-screen" aria-hidden="true">
      <div className="rilisin-splash-aura" />
      <div className="rilisin-splash-logo-wrap">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG animasi mandiri brand kit */}
        <img src="/brand/rilisin-splash-animated.svg" alt="" width={900} height={280} fetchPriority="high" />
      </div>
    </div>
  );
}
