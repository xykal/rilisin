// Bagian bersama untuk skrip QA tampilan (Playwright).
// Persiapan sekali: npm install && npx playwright install --with-deps chromium webkit firefox
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";

export const BASE = (process.env.BASE || "http://localhost:3000").replace(/\/$/, "");
export const QA_DIR = path.join(os.tmpdir(), "rilisin-qa");
fs.mkdirSync(QA_DIR, { recursive: true });

export const ENGINES = { chromium, webkit, firefox };
export const ENGINE_LABEL = { chromium: "Chromium (Chrome, Edge, Samsung Internet, Opera)", webkit: "WebKit (Safari iPhone/iPad/Mac)", firefox: "Firefox" };

/** 25 ukuran layar: HP lipat 280px → HP → HP landscape → tablet → laptop → ultrawide 3440px. */
export const VIEWPORTS = [
  { name: "fold-280", width: 280, height: 653, touch: true },
  { name: "se1-320", width: 320, height: 568, touch: true },
  { name: "android-360", width: 360, height: 740, touch: true },
  { name: "iphone-se-375", width: 375, height: 667, touch: true },
  { name: "iphone-390", width: 390, height: 844, touch: true },
  { name: "pixel-412", width: 412, height: 915, touch: true },
  { name: "promax-430", width: 430, height: 932, touch: true },
  { name: "duo-540", width: 540, height: 720, touch: true },
  { name: "tab7-600", width: 600, height: 960, touch: true },
  { name: "land-667", width: 667, height: 375, touch: true },
  { name: "fold-open-712", width: 712, height: 800, touch: true },
  { name: "ipad-mini-768", width: 768, height: 1024, touch: true },
  { name: "ipad-air-820", width: 820, height: 1180, touch: true },
  { name: "land-844", width: 844, height: 390, touch: true },
  { name: "surface-912", width: 912, height: 1368, touch: true },
  { name: "land-932", width: 932, height: 430, touch: true },
  { name: "ipad-land-1024", width: 1024, height: 768, touch: true },
  { name: "ipad-air-land-1180", width: 1180, height: 820, touch: true },
  { name: "laptop-1280", width: 1280, height: 720 },
  { name: "laptop-1366", width: 1366, height: 768 },
  { name: "laptop-1440", width: 1440, height: 900 },
  { name: "laptop-1536", width: 1536, height: 864 },
  { name: "fhd-1920", width: 1920, height: 1080 },
  { name: "qhd-2560", width: 2560, height: 1440 },
  { name: "ultrawide-3440", width: 3440, height: 1440 },
];
export const QUICK = ["fold-280", "se1-320", "iphone-390", "land-667", "ipad-mini-768", "ipad-land-1024", "laptop-1366", "fhd-1920"];

export const ACCOUNTS = { user: "user@rilisin.test", seller: "seller@rilisin.test", admin: "admin@rilisin.test" };

export function contextOptions(engineName, vp, storageState) {
  return {
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    ...(vp.touch && engineName !== "firefox" ? { isMobile: true, hasTouch: true } : {}),
    ...(storageState ? { storageState } : {}),
    locale: "id-ID",
    ignoreHTTPSErrors: true,
  };
}

/**
 * Session login per engine & role (disimpan di folder temp, dipakai ulang selama masih valid).
 * Catatan WebKit: cookie session memakai prefix __Host- + Secure → WebKit hanya menerimanya lewat HTTPS.
 * Jalankan `node scripts/qa/https-proxy.mjs` lalu pakai BASE=https://localhost:3443 untuk menguji WebKit saat login.
 */
export async function ensureStates(browser, engineName) {
  const states = {};
  for (const [role, email] of Object.entries(ACCOUNTS)) {
    const file = path.join(QA_DIR, `state-${engineName}-${role}.json`);
    if (fs.existsSync(file)) {
      const ctx = await browser.newContext({ storageState: file, ignoreHTTPSErrors: true });
      const res = await ctx.request.get(`${BASE}/library`, { maxRedirects: 0 }).catch(() => null);
      await ctx.close();
      if (res?.status() === 200) {
        states[role] = file;
        continue;
      }
    }
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/masuk`, { waitUntil: "load" });
    await page.fill('input[name="identifier"]', email);
    await page.fill('input[name="password"]', "rilisin123");
    await page.waitForTimeout(1600); // token anti-bot form butuh ≥ 1,5 dtk
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/masuk"), { timeout: 15000 }).catch(() => {}), page.click('form button[type="submit"]')]);
    await page.goto(`${BASE}/library`, { waitUntil: "load" });
    const ok = !new URL(page.url()).pathname.startsWith("/masuk");
    if (ok) {
      await ctx.storageState({ path: file });
      states[role] = file;
    } else {
      console.warn(`⚠ ${engineName}: login ${role} gagal${engineName === "webkit" && BASE.startsWith("http:") ? " (WebKit butuh HTTPS — lihat scripts/qa/https-proxy.mjs)" : ""}; halaman ${role} dilewati.`);
    }
    await ctx.close();
  }
  return states;
}

export async function productIds() {
  const { default: postgres } = await import("postgres");
  const url = process.env.DATABASE_URL || "postgres://rilisin:rilisin@localhost:5432/rilisin";
  const sql = postgres(url, { max: 1 });
  try {
    return Object.fromEntries((await sql`select slug, id from products`).map((r) => [r.slug, r.id]));
  } finally {
    await sql.end();
  }
}

/** Pesan konsol yang sudah diverifikasi tidak berbahaya. */
export function isBenignConsole(text, pageKey) {
  if (pageKey === "404" && /status of 404/.test(text)) return true; // halaman 404 memang 404
  if (/interactive-widget/.test(text)) return true; // Safari mengabaikan pengaturan keyboard khusus Chrome
  // WebKit melaporkan request yang DIBATALKAN (prefetch/EventSource saat pindah halaman) sebagai "access control checks"
  if (/cannot load https?:\s?\/+(localhost|127\.0\.0\.1)(:\d+)?\/.* due to access control/.test(text)) return true;
  return false;
}

export async function pool(items, n, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: n }, async () => {
    while (queue.length) await fn(queue.shift());
  }));
}
