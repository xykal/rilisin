// Cek komponen interaktif di banyak ukuran layar:
//   laci menu HP · mega menu (hover di desktop, tap di tablet) · dropdown akun · tata letak chat (HP landscape)
//   · overlay "tahan pesan" (bar reaksi + menu) · sheet "Hapus untuk semua orang"
//   node scripts/qa/interactive-check.mjs [chromium|webkit|firefox|all] [shots]
import fs from "node:fs";
import path from "node:path";
import { BASE, ENGINES, ENGINE_LABEL, QA_DIR, contextOptions, ensureStates } from "./lib.mjs";

const arg = process.argv[2] || "chromium";
const shots = process.argv.includes("shots");
const engines = arg === "all" ? ["chromium", "webkit", "firefox"] : [arg];
const V = (w, h, touch = w < 1024 || h < 500) => ({ width: w, height: h, touch, name: `${w}x${h}` });

const box = (handle) =>
  handle.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { l: r.left, r: r.right, t: r.top, b: r.bottom, vw: document.documentElement.clientWidth, vh: window.innerHeight, scrollable: /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1 };
  });
const fits = (b) => b.l >= -1 && b.r <= b.vw + 1 && b.t >= -1 && b.b <= b.vh + 1;
const fitsX = (b) => b.l >= -1 && b.r <= b.vw + 1;
const fmt = (b) => `x ${Math.round(b.l)}→${Math.round(b.r)}, y ${Math.round(b.t)}→${Math.round(b.b)} (layar ${b.vw}×${b.vh})`;

let totalProblems = 0;
for (const engineName of engines) {
  const browser = await ENGINES[engineName].launch();
  const states = await ensureStates(browser, engineName);
  const problems = [];
  const flag = (area, vp, msg) => problems.push(`[${area}] ${vp.name}: ${msg}`);
  const shotDir = path.join(QA_DIR, `interactive-${engineName}`);
  if (shots) fs.mkdirSync(shotDir, { recursive: true });
  const snap = (page, name) => (shots ? page.screenshot({ path: path.join(shotDir, `${name}.png`) }) : null);
  const open = async (vp, role, url) => {
    const ctx = await browser.newContext(contextOptions(engineName, vp, role ? states[role] : null));
    const page = await ctx.newPage();
    await page.goto(BASE + url, { waitUntil: "load" });
    return { ctx, page };
  };

  // A. Laci menu HP
  for (const vp of [V(280, 653), V(320, 568), V(360, 740), V(390, 844), V(667, 375), V(712, 800)]) {
    for (const role of states.user ? [null, "user"] : [null]) {
      const { ctx, page } = await open(vp, role, "/");
      await page.click('button[aria-label="Buka menu"]');
      await page.waitForTimeout(500);
      const panel = await page.$('div[role="dialog"][aria-label="Menu"] > div:last-child');
      if (!panel) flag("laci", vp, "panel tidak muncul");
      else if (!fits(await box(panel))) flag("laci", vp, `panel keluar layar: ${fmt(await box(panel))}`);
      if (role) await snap(page, `laci__${vp.name}`);
      await ctx.close();
    }
  }

  // B. Mega menu (≥ 768px)
  for (const vp of [V(768, 1024), V(820, 1180), V(844, 390), V(932, 430), V(1024, 768), V(1024, 600, false), V(1280, 720, false), V(1366, 768, false), V(1920, 1080, false), V(2560, 1440, false)]) {
    const { ctx, page } = await open(vp, null, "/");
    const triggers = await page.$$('nav[aria-label="Menu utama"] button[aria-expanded]');
    if (!triggers.length) flag("mega", vp, "tombol menu tidak ada");
    for (const [i, t] of triggers.entries()) {
      const label = (await t.innerText()).trim();
      if (vp.touch && engineName !== "firefox") await t.tap();
      else if (vp.touch) await t.click();
      else await t.hover();
      await page.waitForTimeout(450);
      const panel = await page.$("div.anim-slide-down.absolute.inset-x-0.top-full");
      if ((await t.getAttribute("aria-expanded")) !== "true" || !panel) {
        flag("mega", vp, `"${label}" tidak terbuka`);
        continue;
      }
      const b = await box(panel);
      if (!fitsX(b)) flag("mega", vp, `"${label}" keluar layar: ${fmt(b)}`);
      if (b.b > b.vh + 1 && !b.scrollable) flag("mega", vp, `"${label}" terpotong di bawah dan tidak bisa discroll: ${fmt(b)}`);
      if (i === 0) await snap(page, `mega__${vp.name}`);
      await page.keyboard.press("Escape");
      if (!vp.touch) await page.mouse.move(5, vp.height - 5);
      await page.waitForTimeout(250);
    }
    await ctx.close();
  }

  // C. Dropdown akun
  if (states.user) {
    for (const vp of [V(280, 653), V(320, 568), V(360, 740), V(390, 844), V(639, 800), V(640, 800), V(768, 1024), V(1440, 900, false)]) {
      const { ctx, page } = await open(vp, "user", "/library");
      await page.click('summary[aria-label="Menu akun"]');
      await page.waitForTimeout(250);
      const panel = await page.$("details[open] > div");
      if (!panel) flag("akun", vp, "panel tidak terbuka");
      else if (!fits(await box(panel))) flag("akun", vp, `panel keluar layar: ${fmt(await box(panel))}`);
      await ctx.close();
    }
  }

  // D. Chat: tata letak, overlay tahan pesan, sheet hapus
  if (states.user) {
    for (const vp of [V(280, 653), V(360, 740), V(390, 844), V(667, 375), V(844, 390), V(932, 430), V(768, 1024), V(1024, 600, false), V(1280, 720, false), V(1920, 1080, false)]) {
      const { ctx, page } = await open(vp, "user", "/komunitas/nongkrong");
      const jsErrors = [];
      page.on("pageerror", (e) => jsErrors.push(String(e)));
      await page.waitForSelector("[data-mid]", { timeout: 15000 });
      await page.waitForTimeout(600);
      const lay = await page.evaluate(() => {
        const ta = document.querySelector('textarea[aria-label="Ketik pesan"]')?.getBoundingClientRect();
        let sc = document.querySelector("[data-mid]");
        while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
        const s = sc?.getBoundingClientRect();
        return { vh: window.innerHeight, taBottom: ta?.bottom, listH: s ? Math.min(s.bottom, window.innerHeight) - Math.max(s.top, 0) : null };
      });
      if (lay.taBottom == null) flag("chat", vp, "kolom ketik tidak ada");
      else if (lay.taBottom > lay.vh + 1) flag("chat", vp, `kolom ketik di luar layar (bawah ${Math.round(lay.taBottom)}, layar ${lay.vh})`);
      if (lay.listH != null && lay.listH < 110) flag("chat", vp, `area pesan terlalu sempit (${Math.round(lay.listH)}px)`);
      await snap(page, `chat__${vp.name}`);

      const others = await page.$$("[data-mid].justify-start");
      const target = others.at(-1);
      if (target) {
        const bubble = (await target.$("div div")) || target;
        await bubble.scrollIntoViewIfNeeded();
        await bubble.click({ button: "right" }); // klik kanan = handler yang sama dengan tahan-lama di HP
        await page.waitForTimeout(600);
        const menu = await page.$('[role="dialog"][aria-label="Opsi pesan"] [role="menu"]');
        const react = await page.$('[role="dialog"][aria-label="Opsi pesan"] [aria-label^="Reaksi"]');
        if (!menu) flag("tahan", vp, "menu aksi tidak muncul");
        else if (!fits(await box(menu))) flag("tahan", vp, `menu aksi keluar layar: ${fmt(await box(menu))}`);
        if (!react) flag("tahan", vp, "bar reaksi tidak muncul");
        else {
          const bar = await box(await react.evaluateHandle((b) => b.parentElement));
          if (!fits(bar)) flag("tahan", vp, `bar reaksi keluar layar: ${fmt(bar)}`);
        }
        await snap(page, `tahan__${vp.name}`);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
      }
      const mine = (await page.$$("[data-mid].justify-end")).at(-1);
      if (mine) {
        const bubble = (await mine.$("div div")) || mine;
        await bubble.scrollIntoViewIfNeeded();
        await bubble.click({ button: "right" });
        await page.waitForTimeout(600);
        const del = await page.$('[role="dialog"][aria-label="Opsi pesan"] [role="menuitem"]:has-text("Hapus")');
        if (del) {
          await del.click();
          await page.waitForTimeout(900);
          const btn = await page.$('button:has-text("Hapus untuk semua orang")');
          if (!btn) flag("hapus", vp, "tombol 'Hapus untuk semua orang' tidak muncul");
          else if (!fits(await box(btn))) flag("hapus", vp, `tombol hapus keluar layar: ${fmt(await box(btn))}`);
          await snap(page, `hapus__${vp.name}`);
        }
      }
      if (jsErrors.length) flag("chat", vp, "error JS: " + jsErrors[0].slice(0, 160));
      await ctx.close();
    }
  }
  await browser.close();
  totalProblems += problems.length;
  console.log(`\n${ENGINE_LABEL[engineName]} — komponen interaktif`);
  console.log(problems.length ? problems.map((p) => "  ✗ " + p).join("\n") : "  ✓ Laci menu, mega menu, dropdown akun, chat, overlay tahan pesan & sheet hapus muat di semua ukuran");
  if (shots) console.log(`  Screenshot: ${shotDir}`);
}
process.exit(totalProblems ? 1 : 0);
