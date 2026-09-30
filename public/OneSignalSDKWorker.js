// Service worker OneSignal (wajib di root situs). Menampilkan push & membuka URL saat diketuk.
// Cadangan: SDK sekarang memakai /sw.js (lihat serviceWorkerPath di push-init.tsx). File ini dipertahankan buat rollback.
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
