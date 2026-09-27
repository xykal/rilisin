// Audit responsif: semua halaman × banyak ukuran layar.
//   node scripts/qa/responsive-audit.mjs [chromium|webkit|firefox|all] [quick|full] [shots]
// Mengecek: scroll horizontal, elemen keluar layar, teks meluber dari kotaknya, error JS/konsol, status HTTP.
// Keluar dengan kode 1 kalau ada masalah (bisa dipakai di CI).
import fs from "node:fs";
import path from "node:path";
import { BASE, ENGINES, ENGINE_LABEL, QA_DIR, QUICK, VIEWPORTS, contextOptions, ensureStates, isBenignConsole, pool, productIds } from "./lib.mjs";

const arg = process.argv[2] || "chromium";
const mode = process.argv[3] || "quick";
const shots = process.argv.includes("shots");
const engines = arg === "all" ? ["chromium", "webkit", "firefox"] : [arg];

const ids = await productIds();
const PAGES = [
  ["anon", "home", "/"],
  ["anon", "jelajahi", "/jelajahi"],
  ["anon", "jelajahi-filter", "/jelajahi?kategori=aplikasi&harga=gratis&sort=populer"],
  ["anon", "jelajahi-cari", "/jelajahi?q=kasir"],
  ["anon", "jelajahi-kosong", "/jelajahi?q=zzzzzzzzqqq"],
  ["anon", "produk-app", "/p/kasirku-offline"],
  ["anon", "produk-game", "/p/petualangan-si-kancil"],
  ["anon", "produk-ebook", "/p/e-book-panduan-rilis-aplikasi-android-2026"],
  ["anon", "profil-seller", "/@nusantaralabs"],
  ["anon", "profil-seller-2", "/@pixelrantau"],
  ["anon", "panduan-android", "/panduan/android"],
  ["anon", "pusat-keamanan", "/keamanan"],
  ["anon", "komunitas", "/komunitas"],
  ["anon", "komunitas-aturan", "/komunitas/aturan"],
  ["anon", "chat-anon", "/komunitas/nongkrong"],
  ["anon", "masuk", "/masuk"],
  ["anon", "daftar", "/daftar"],
  ["anon", "404", "/halaman-yang-tidak-ada"],
  ["user", "home-login", "/"],
  ["user", "library", "/library"],
  ["user", "akun-keamanan", "/akun/keamanan"],
  ["user", "akun-2fa", "/akun/keamanan/2fa"],
  ["user", "komunitas-login", "/komunitas"],
  ["user", "chat-nongkrong", "/komunitas/nongkrong"],
  ["user", "chat-pamer", "/komunitas/pamer-karya"],
  ["user", "chat-pengumuman", "/komunitas/pengumuman"],
  ["seller", "seller-home", "/seller"],
  ["seller", "seller-produk", "/seller/produk"],
  ["seller", "seller-baru", "/seller/produk/baru"],
  ["seller", "seller-edit", `/seller/produk/${ids["kasirku-offline"]}`],
  ["seller", "seller-edit-draft", `/seller/produk/${ids["absensi-sekolah-lite"]}`],
  ["admin", "admin-review", "/admin/review"],
  ["admin", "admin-review-detail", `/admin/review/${ids["resep-nusantara-offline"]}`],
  ["admin", "admin-review-spam", `/admin/review/${ids["kumpulan-apk-premium-gratis"]}`],
  ["admin", "admin-laporan", "/admin/laporan"],
  ["admin", "admin-keamanan", "/admin/keamanan"],
];
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;

// ── Dijalankan di dalam browser ──────────────────────────────────────────────
function inspectPage() {
  const vw = document.documentElement.clientWidth;
  const describe = (el) => {
    const cls = String(el.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 5).join(".");
    const txt = (el.innerText || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${txt ? ` “${txt}”` : ""}`;
  };
  const clippedByAncestor = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.position === "fixed" || /(hidden|auto|scroll|clip)/.test(cs.overflowX)) return true;
    }
    return false;
  };
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const off = [];
  const spills = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest("script,style,noscript,template")) continue;
    if (el.closest("details:not([open])") && !el.closest("summary")) continue; // isi <details> tertutup tidak tampil
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.02) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.right < 0) continue; // sepenuhnya di kiri layar = sengaja disembunyikan (honeypot)
    if (cs.clip && cs.clip !== "auto") continue; // sr-only
    if (r.right > vw + 1 || r.left < -1) {
      if (cs.position === "fixed") off.push({ el, d: "[fixed] " + describe(el) });
      else if (!clippedByAncestor(el)) off.push({ el, d: describe(el) });
    }
    if (cs.display !== "inline" && !/(hidden|auto|scroll|clip)/.test(cs.overflowX) && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2 && ownText(el)) {
      spills.push(`${describe(el)} (${el.scrollWidth}>${el.clientWidth})`);
    }
  }
  const outer = off.filter((o) => !off.some((p) => p !== o && p.el.contains(o.el))).map((o) => o.d);
  return { overflow: document.documentElement.scrollWidth - vw, offscreen: outer.slice(0, 5), spills: spills.slice(0, 5) };
}

let totalIssues = 0;
for (const engineName of engines) {
  const t0 = Date.now();
  const browser = await ENGINES[engineName].launch();
  const states = await ensureStates(browser, engineName);
  const vps = mode === "full" ? VIEWPORTS : VIEWPORTS.filter((v) => QUICK.includes(v.name));
  const results = [];
  const retried = [];
  const shotDir = path.join(QA_DIR, `shots-${engineName}`);
  if (shots) fs.mkdirSync(shotDir, { recursive: true });

  await pool(vps, engineName === "chromium" ? 4 : 3, async (vp) => {
    for (const role of ["anon", "user", "seller", "admin"]) {
      if (role !== "anon" && !states[role]) continue;
      const ctx = await browser.newContext(contextOptions(engineName, vp, role === "anon" ? null : states[role]));
      const page = await ctx.newPage();
      let errors = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
      page.on("pageerror", (e) => errors.push("JS: " + String(e).slice(0, 200)));
      for (const [, key, url] of PAGES.filter((p) => p[0] === role && (!only || only.includes(p[1])))) {
        errors = [];
        const row = { key, vp: vp.name, url };
        try {
          let resp;
          try {
            resp = await page.goto(BASE + url, { waitUntil: "load", timeout: 30000 });
          } catch {
            retried.push(`${key}@${vp.name}`); // gangguan sesaat otomasi browser → coba sekali lagi
            resp = await page.goto(BASE + url, { waitUntil: "load", timeout: 30000 });
          }
          row.status = resp?.status() ?? 0;
          await page.evaluate(() => document.fonts && document.fonts.ready);
          await page.waitForTimeout(350);
          Object.assign(row, await page.evaluate(inspectPage));
          if (shots) await page.screenshot({ path: path.join(shotDir, `${key}__${vp.name}.png`), fullPage: true });
        } catch (e) {
          row.status = 0;
          row.fatal = String(e).split("\n")[0];
        }
        row.errors = errors.filter((t) => !isBenignConsole(t, key));
        results.push(row);
      }
      await ctx.close();
    }
  });
  await browser.close();

  const bad = results.filter((r) => r.fatal || r.overflow > 1 || r.offscreen?.length || r.spills?.length || r.errors.length || r.status >= 400 && r.key !== "404");
  totalIssues += bad.length;
  console.log(`\n${ENGINE_LABEL[engineName]} — ${results.length} kombinasi halaman×layar (${vps.length} ukuran) dalam ${Math.round((Date.now() - t0) / 1000)} dtk`);
  console.log(bad.length ? `✗ ${bad.length} bermasalah:` : "✓ Tidak ada scroll horizontal, elemen keluar layar, teks meluber, maupun error.");
  for (const r of bad.slice(0, 40)) {
    console.log(`  • ${r.key} @ ${r.vp} [HTTP ${r.status}]${r.overflow > 1 ? ` scroll horizontal +${r.overflow}px` : ""}${r.fatal ? " " + r.fatal : ""}`);
    for (const o of r.offscreen || []) console.log(`      keluar layar: ${o}`);
    for (const s of r.spills || []) console.log(`      teks meluber: ${s}`);
    for (const e of r.errors) console.log(`      error: ${e}`);
  }
  if (retried.length) console.log(`  (dicoba ulang karena timeout sesaat: ${retried.join(", ")})`);
  if (shots) console.log(`  Screenshot: ${shotDir}`);
}
process.exit(totalIssues ? 1 : 0);
