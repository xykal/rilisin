"use client";

import { useEffect } from "react";

/** Daftarkan service worker sekali saat produksi. Dev sengaja dilewati biar cache tidak ganggu ngoding. */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
