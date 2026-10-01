/* Rilisin service worker: cache aset statis + halaman fallback offline.
 * Push digabung di worker ini (bukan file terpisah) supaya tidak rebutan scope "/":
 * OneSignal di-init dengan serviceWorkerPath "sw.js" (lihat push-init.tsx).
 * Naikkan VERSION tiap ada perubahan file ini supaya klien update. */
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

const VERSION = "rilisin-v3";
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-192.png", "/icons/icon-maskable-512.png", "/apple-touch-icon.png"];

// Precache anti-gagal: SATU file gagal (mis. offline saat install) TIDAK BOLEH menggagalkan
// seluruh service worker — SW mati = tombol install PWA tidak pernah muncul.
// Hanya respons OK yang di-cache: cache.add menelan status error apa adanya (mis. 401 site-lock
// pra-login) lalu manifest/ikon 401 itu dipakai selamanya sampai cache dibersihkan manual.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) =>
        Promise.allSettled(
          PRECACHE.map((url) =>
            fetch(url).then((res) => {
              if (res.ok) return cache.put(url, res);
            }),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // API/auth jangan pernah disentuh cache
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  const cacheable =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/apple-touch-icon.png";
  if (!cacheable) return;
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return res;
        }),
    ),
  );
});
