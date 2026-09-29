#!/usr/bin/env node
/**
 * Smoke test end-to-end (tanpa browser): jalankan server dulu (npm run start), lalu
 *   node scripts/smoke-test.mjs [http://localhost:3000]
 * Menguji: header keamanan, halaman publik, login, download (signed URL), library, alur seller
 * (buat produk → upload gambar & file → kirim review), wizard onboarding 3 langkah + aktivasi toko,
 * approve admin, komunitas chat
 * (kirim/balas/edit/hapus/reaksi/lapor/bisukan/realtime SSE/gambar), dan keamanan akun
 * (anti-bot, password policy, 2FA + kode cadangan, kunci akun, ganti password), pembayaran (Fase 2), serta
 * forum, ulasan, notifikasi & reset password (Fase 3), serta ikuti, devlog, lapor produk/akun & profil (Fase 3b).
 * PERHATIAN: menambah data ke database. Jalankan `npm run db:seed` untuk reset.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";
import sharp from "sharp";
import { strToU8, zipSync } from "fflate";

const BASE = process.argv[2] ?? "http://localhost:3000";
const ORIGIN = new URL(BASE).origin;
// Staging yang dikunci (SITE_LOCK_PASSWORD): SMOKE_BASIC_AUTH="user:password"
const BASIC = process.env.SMOKE_BASIC_AUTH ? `Basic ${Buffer.from(process.env.SMOKE_BASIC_AUTH).toString("base64")}` : null;
// Password akun demo: sama dengan SEED_DEMO_PASSWORD saat seed (staging tidak memakai default).
const DEMO_PW = process.env.SMOKE_DEMO_PASSWORD || process.env.SEED_DEMO_PASSWORD || "rilisin123";
const authHeaders = () => (BASIC ? { authorization: BASIC } : {});
const TURNSTILE_TEST_SITEKEY = "1x00000000000000000000AA";
// Link download bertanda tangan: driver local (/api/storage/file?token=) atau Vercel Blob (store privat, presigned)
const isSignedDownload = (loc) => loc.startsWith("/api/storage/file?token=") || /^https:\/\/[a-z0-9]+\.private\.blob\.vercel-storage\.com\/.+vercel-blob-signature=/.test(loc);
let passed = 0;

function ok(cond, label) {
  if (!cond) {
    console.error(`✗ ${label}`);
    process.exit(1);
  }
  passed++;
  console.log(`✓ ${label}`);
}

// React menyisipkan <!-- --> di antara potongan teks; buang supaya mudah dicocokkan.
const clean = (t) => t.replaceAll("<!-- -->", "");
const decode = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

let ipCounter = 10;
class Session {
  cookies = new Map();
  // Tiap sesi uji punya "IP" sendiri supaya batas percobaan per-IP tidak saling mengganggu.
  ip = `10.9.${Math.floor(Math.random() * 200)}.${ipCounter++}`;
  hasSession() {
    return this.cookies.has("__Host-rilisin_session") || this.cookies.has("rilisin_session");
  }
  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  store(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const idx = pair.indexOf("=");
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (!value || /max-age=0/i.test(c)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  async req(path, init = {}) {
    const url = path.startsWith("http") ? path : BASE + path;
    if (new URL(url).origin !== ORIGIN) {
      // Host luar (mis. URL presigned Vercel Blob): JANGAN kirim cookie session / header internal
      return fetch(url, { redirect: "manual", ...init });
    }
    const headers = new Headers(init.headers);
    if (BASIC) headers.set("authorization", BASIC);
    if (this.cookies.size) headers.set("cookie", this.cookieHeader());
    if (init.method && init.method !== "GET" && !headers.has("origin")) headers.set("origin", ORIGIN);
    headers.set("x-forwarded-for", this.ip);
    const res = await fetch(url, { redirect: "manual", ...init, headers });
    this.store(res);
    return res;
  }
  async html(path) {
    const res = await this.req(path);
    return { res, text: clean(await res.text()) };
  }
  /**
   * Kirim <form> server action seperti browser tanpa JS (progressive enhancement).
   * opts.override: field yang namanya sama dengan input hidden MENGGANTI nilainya (uji kiriman "paksa").
   */
  async submitForm(pagePath, html, marker, fields = {}, opts = {}) {
    const chunks = html.split("<form").slice(1).map((c) => c.split("</form>")[0]);
    const form = chunks.find((c) => c.includes(marker));
    if (!form) throw new Error(`Form dengan penanda "${marker}" tidak ditemukan di ${pagePath}`);
    const fd = new FormData();
    for (const tag of form.match(/<input[^>]*>/g) ?? []) {
      if (!/type="hidden"/.test(tag)) continue;
      const name = tag.match(/name="([^"]*)"/)?.[1];
      if (!name) continue;
      if (opts.override && Object.hasOwn(fields, decode(name))) continue;
      fd.append(decode(name), decode(tag.match(/value="([^"]*)"/)?.[1] ?? ""));
    }
    for (const [k, v] of Object.entries(fields)) {
      for (const item of Array.isArray(v) ? v : [v]) fd.append(k, item);
    }
    // Kunci uji Turnstile (CI): browser akan mengisi token dummy ini; staging (kunci asli + mode lunak) tanpa token.
    if (!opts.noTurnstile && form.includes(`data-turnstile="${TURNSTILE_TEST_SITEKEY}"`)) fd.append("cf-turnstile-response", "XXXX.DUMMY.TOKEN.XXXX");
    return this.req(pagePath, { method: "POST", body: fd });
  }
  async login(email, password = DEMO_PW) {
    const { text } = await this.html("/masuk");
    const res = await this.submitForm("/masuk", text, 'name="identifier"', { identifier: email, password, next: "/" });
    return res;
  }
  /** Panggil API JSON (POST kalau ada body). */
  async api(path, body, extraHeaders = {}) {
    const init = body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json", ...extraHeaders }, body: JSON.stringify(body) };
    const res = await this.req(path, init);
    const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
    return { status: res.status, data };
  }
  async say(room, body, extra = {}) {
    return this.api(`/api/chat/rooms/${room}/messages`, { body, clientId: `smoke-${Math.random().toString(36).slice(2, 12)}`, ...extra });
  }
  async upload(purpose, targetId, filename, buf, platform) {
    const init = await this.req("/api/uploads/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ purpose, targetId, filename, size: buf.length, platform }),
    });
    const initJson = await init.json();
    if (!init.ok) return { ok: false, step: "init", ...initJson };
    const put = await this.req(initJson.uploadUrl, { method: "PUT", body: buf, headers: { "content-type": "application/octet-stream" } });
    if (!put.ok) return { ok: false, step: "put", ...(await put.json()) };
    const done = await this.req("/api/uploads/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: initJson.token }),
    });
    return { ok: done.ok, step: "complete", ...(await done.json()) };
  }
}

// ─── 0. Header keamanan ─────────────────────────────────────────────────────
const guest = new Session();
{
  const res = await guest.req("/");
  const csp = res.headers.get("content-security-policy") ?? "";
  const html = await res.text();
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  ok(Boolean(nonce) && csp.includes("'strict-dynamic'") && csp.includes("object-src 'none'"), "CSP dengan nonce aktif");
  ok(html.includes(`nonce="${nonce}"`), "Script Next.js memakai nonce yang sama dengan header CSP");
  ok(csp.includes("https://res.cloudinary.com"), "CSP mengizinkan gambar Cloudinary");
  ok(res.headers.get("x-content-type-options") === "nosniff" && res.headers.get("referrer-policy") === "strict-origin-when-cross-origin", "Header nosniff & Referrer-Policy");
  ok(/frame-ancestors/.test(csp) && Boolean(res.headers.get("permissions-policy")), "frame-ancestors & Permissions-Policy terpasang");
  const sec = await guest.req("/.well-known/security.txt");
  ok(sec.status === 200 && (await sec.text()).includes("Contact:"), "security.txt tersedia");
  ok(!html.includes("Untuk developer &amp; kreator Indonesia"), "Label pil di atas judul beranda sudah dihapus");
}

// ─── 1. Halaman publik ──────────────────────────────────────────────────────
{
  const { res, text } = await guest.html("/");
  ok(res.status === 200 && text.includes("Trending minggu ini"), "Beranda tampil (200)");
  const search = await guest.html("/jelajahi?q=kasir");
  ok(search.text.includes("KasirKu Offline"), "Pencarian 'kasir' menemukan KasirKu Offline");
  const cat = await guest.html("/jelajahi?kategori=game&sort=baru");
  ok(cat.text.includes("Petualangan Si Kancil") && !cat.text.includes("KasirKu Offline</h3>"), "Filter kategori game bekerja");
  const p = await guest.html("/p/kasirku-offline");
  ok(p.res.status === 200 && p.text.includes("Masuk untuk download"), "Halaman produk: tamu diminta masuk untuk download");
  const review = await guest.html("/p/resep-nusantara-offline");
  ok(review.res.status === 404, "Produk yang masih direview tidak bisa dilihat tamu (404)");
  const prof = await guest.html("/@pixelrantau");
  ok(prof.res.status === 200 && prof.text.includes("Pixel Rantau Studio"), "Profil /@pixelrantau tampil");
  const admin = await guest.html("/admin/review");
  ok(admin.res.status === 307 || admin.res.status === 303 || admin.res.status === 302, "Halaman admin mengarahkan tamu ke login");
  // Dokumen hukum publik (isinya dari docs/legal, dicek sinkron di CI)
  for (const [path, needle] of [
    ["/ketentuan", "Syarat &amp; Ketentuan"],
    ["/privasi", "Kebijakan Privasi"],
    ["/kuki", "Kebijakan Cookie"],
    ["/aup", "Aturan Paku yang Dapat Diterima"],
    ["/refund", "Kebijakan Refund"],
  ]) {
    const page = await guest.html(path);
    ok(page.res.status === 200 && page.text.includes(needle), `Halaman hukum ${path} tampil (200) & memuat isi dokumen`);
    ok(page.text.includes("Masih draf"), `Halaman ${path} menandai status draf dengan jujur`);
  }
  const verify = await guest.html("/verifikasi-email");
  ok(verify.res.status === 200 && verify.text.includes("Verifikasi email"), "Halaman /verifikasi-email terbuka untuk tamu (200)");
  const traversal = await guest.req("/media/..%2F..%2F.env.local");
  // Lokal: route menjawab 404. Di Vercel, edge sudah menolak `..%2F` dengan 400 sebelum sampai ke app.
  ok(traversal.status === 404 || traversal.status === 400, `Path traversal di /media ditolak (${traversal.status})`);
  const csrf = await fetch(`${BASE}/api/download/00000000-0000-0000-0000-000000000000`, { method: "POST", headers: { origin: "https://situs-jahat.example", ...authHeaders() }, redirect: "manual" });
  ok(csrf.status === 403, "POST dari origin asing ditolak (CSRF)");
}

// ─── 2. Login user & download ───────────────────────────────────────────────
const user = new Session();
{
  const bad = await (async () => {
    const s = new Session();
    const { text } = await s.html("/masuk");
    const r = await s.submitForm("/masuk", text, 'name="identifier"', { identifier: "user@rilisin.test", password: "salah-banget", next: "/" });
    return { status: r.status, body: clean(await r.text()), cookie: s.hasSession() };
  })();
  ok(!bad.cookie && bad.body.includes("password salah"), "Password salah ditolak");

  const res = await user.login("user@rilisin.test");
  ok(res.status === 303 && user.hasSession(), "Login user berhasil (cookie session diset)");

  const { text } = await user.html("/p/catat-duit");
  const fileId = text.match(/action="\/api\/download\/([0-9a-f-]{36})"/)?.[1];
  const shownHash = text.match(/<code class="mt-1 block break-all font-mono">([0-9a-f]{64})<\/code>/)?.[1];
  ok(Boolean(fileId), "Tombol download muncul untuk user yang login");
  const dl = await user.req(`/api/download/${fileId}`, { method: "POST" });
  const location = dl.headers.get("location") ?? "";
  ok(dl.status === 303 && isSignedDownload(location), "POST download → 303 ke signed URL");
  const file = await user.req(location);
  const buf = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(buf).digest("hex");
  ok(file.status === 200 && /attachment/.test(file.headers.get("content-disposition") ?? ""), "Signed URL mengirim file sebagai attachment");
  ok(hash === shownHash, "SHA-256 file yang diunduh cocok dengan yang ditampilkan");
  if (location.startsWith("/")) {
    const stolen = await guest.req(location);
    ok(stolen.status === 403, "Signed URL tidak bisa dipakai akun lain / tanpa login");
  } else {
    // Vercel Blob: file privat tanpa tanda tangan harus ditolak; link bertanda tangan hanya berlaku 5 menit
    const unsigned = await fetch(location.split("?")[0]);
    ok(unsigned.status === 403 || unsigned.status === 401, "File privat tanpa tanda tangan ditolak (Vercel Blob)");
  }

  const lib = await user.html("/library");
  ok(lib.text.includes("Catat Duit") && lib.text.includes("Update v1.3.0"), "Library berisi produk + tanda update tersedia");
}

// ─── 3. Seller: buat produk → upload → kirim review ─────────────────────────
const seller = new Session();
let productId;
let slug;
{
  await seller.login("seller@rilisin.test");
  ok(seller.hasSession(), "Login seller berhasil");
  const page = await seller.html("/seller/produk/baru");
  const created = await seller.submitForm("/seller/produk/baru", page.text, 'name="title"', {
    title: "Aplikasi Uji Smoke Test",
    summary: "Produk uji otomatis untuk memastikan alur upload berjalan.",
    category: "aplikasi",
    license: "MIT",
    platforms: ["android", "windows"],
    tags: "uji, otomatis",
    descriptionMd: "## Tentang\nIni produk uji dari smoke test. Deskripsi ini sengaja dibuat cukup panjang supaya lolos checklist minimal 80 karakter.",
    websiteUrl: "",
    sourceUrl: "",
    pricingModel: "free",
  });
  const loc = created.headers.get("location") ?? "";
  productId = loc.match(/\/seller\/produk\/([0-9a-f-]{36})/)?.[1];
  ok(created.status === 303 && Boolean(productId), "Seller membuat draft produk");

  const png = await sharp({ create: { width: 800, height: 800, channels: 3, background: "#5b43f5" } }).png().toBuffer();
  const jpg = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#22c55e" } }).jpeg().toBuffer();
  ok((await seller.upload("icon", productId, "ikon.png", png)).ok, "Upload ikon (PNG → WEBP)");
  ok((await seller.upload("cover", productId, "cover.jpg", jpg)).ok, "Upload cover (JPG → WEBP)");
  ok((await seller.upload("screenshot", productId, "layar-1.jpg", jpg)).ok, "Upload screenshot");
  const fake = await seller.upload("screenshot", productId, "bukan-gambar.png", Buffer.from("ini teks, bukan gambar"));
  ok(!fake.ok && fake.step === "complete", "File palsu berekstensi .png ditolak saat validasi isi");

  const edit = await seller.html(`/seller/produk/${productId}`);
  slug = edit.text.match(/\/p\/([a-z0-9-]+)/)?.[1];
  const android = await seller.submitForm(`/seller/produk/${productId}`, edit.text, 'name="androidPackage"', {
    androidPackage: "id.uji.smoketest",
    androidRegistration: "not_registered",
  });
  ok(android.status === 200, "Simpan info Android");

  const rel = await seller.submitForm(`/seller/produk/${productId}`, edit.text, 'name="version"', { version: "1.0.0", changelogMd: "- Rilis uji" });
  ok(rel.status === 200 && clean(await rel.text()).includes("Rilis v1.0.0 dibuat"), "Buat rilis v1.0.0");

  const afterRel = await seller.html(`/seller/produk/${productId}`);
  const releaseId = afterRel.text.match(/name="releaseId" value="([0-9a-f-]{36})"/)?.[1];
  ok(Boolean(releaseId), "Rilis draft muncul di editor");
  const apk = Buffer.from(zipSync({ "AndroidManifest.xml": strToU8("<manifest package=\"id.uji.smoketest\"/>"), "classes.dex": strToU8("dex") }));
  const up = await seller.upload("release_file", releaseId, "uji-1.0.0.apk", apk, "android");
  ok(up.ok, "Upload APK valid (cek magic bytes + AndroidManifest)");
  const badApk = await seller.upload("release_file", releaseId, "palsu.apk", Buffer.from("MZ bukan apk"), "android");
  ok(!badApk.ok, "APK palsu ditolak");
  const exeAsAndroid = await seller.upload("release_file", releaseId, "setup.exe", Buffer.from("MZ...."), "linux");
  ok(!exeAsAndroid.ok && exeAsAndroid.step === "init", "Platform di luar platform produk ditolak");

  const ready = await seller.html(`/seller/produk/${productId}`);
  const submit = await seller.submitForm(`/seller/produk/${productId}`, ready.text, "Kirim ke review");
  ok(submit.status === 303 && (submit.headers.get("location") ?? "").includes("dikirim=review"), "Produk dikirim ke review");
  const locked = await seller.upload("icon", productId, "ikon2.png", png);
  ok(!locked.ok && locked.step === "init", "Upload dikunci selama produk direview");
  const hidden = await guest.html(`/p/${slug}`);
  ok(hidden.res.status === 404, "Produk yang direview belum tampil ke publik");
}

// ─── 3b. Onboarding seller: pengajuan toko + approve admin + wizard ──────────
{
  // Akun baru tanpa verifikasi email tidak bisa mengajukan toko.
  const fresh = new Session();
  const tag = Date.now().toString(36).slice(-6);
  const uname = `wzd${tag}`;
  const regPage = await fresh.html("/daftar");
  await new Promise((r) => setTimeout(r, 1800));
  const reg = await fresh.submitForm("/daftar", regPage.text, 'name="username"', {
    displayName: "Seller Wizard",
    username: uname,
    email: `${uname}@uji.test`,
    password: "KataSandiKuat#2026",
    next: "/",
  });
  ok(reg.status === 303 && fresh.hasSession(), "Daftar akun seller baru untuk wizard");
  const actPage = await fresh.html("/seller");
  ok(actPage.res.status === 200 && actPage.text.includes("Aktifkan toko"), "Seller baru melihat form aktivasi toko");
  const denied = await fresh.submitForm("/seller", actPage.text, 'name="storeName"', {
    storeName: "Toko Wizard Uji",
    tagline: "Toko uji otomatis",
    websiteUrl: "",
    agree: "on",
  });
  ok(denied.status === 200 && clean(await denied.text()).includes("Verifikasi email dulu"), "Pengajuan toko tanpa verifikasi email ditolak jujur");
  ok((await fresh.html("/seller")).text.includes("Aktifkan toko"), "Akun yang ditolak tetap bukan seller");
  ok((await fresh.html("/admin/penjual")).res.status === 404, "User biasa tidak bisa membuka antrean toko (404)");

  // Akun terverifikasi: mengajukan → pending → ditolak → ajukan ulang → disetujui.
  const calon = new Session();
  await calon.login("calon@rilisin.test");
  const cap = await calon.html("/seller");
  const applied = await calon.submitForm("/seller", cap.text, 'name="storeName"', {
    storeName: "Toko Calon Uji",
    tagline: "Toko uji persetujuan",
    websiteUrl: "",
    phone: "081234567890",
    portfolioUrl: "https://github.com/tokocalon",
    agree: "on",
  });
  ok(applied.status === 303 && (applied.headers.get("location") ?? "").includes("/seller?diajukan=1"), "Pengajuan toko masuk antrean admin");
  const waiting = await calon.html("/seller");
  ok(waiting.text.includes("sedang ditinjau") && waiting.text.includes("Toko Calon Uji"), "Pemohon melihat status menunggu review");
  const mulaiPending = await calon.html("/seller/mulai");
  ok([302, 303, 307, 308].includes(mulaiPending.res.status), "Seller pending tidak bisa membuka wizard (dialihkan)");
  const upPending = await calon.upload("icon", "00000000-0000-0000-0000-000000000000", "x.png", Buffer.from("x"));
  ok(!upPending.ok && upPending.step === "init", "Seller pending tidak bisa upload");

  const imut = new Session();
  await imut.login("baru@rilisin.test");
  const imutApply = await imut.submitForm("/seller", (await imut.html("/seller")).text, 'name="storeName"', {
    storeName: "Toko Umur Sehari",
    tagline: "",
    websiteUrl: "",
    phone: "08123456789",
    portfolioUrl: "https://github.com/contoh",
    agree: "on",
  });
  ok(clean(await imutApply.text()).includes("minimal berumur 3 hari"), "Pengajuan toko akun baru (< 3 hari) ditolak");
  const val = new Session();
  await val.login("validasi@rilisin.test");
  const valPage = (await val.html("/seller")).text;
  const badPhone = await val.submitForm("/seller", valPage, 'name="storeName"', {
    storeName: "Toko Validasi",
    tagline: "",
    websiteUrl: "",
    phone: "abc",
    portfolioUrl: "https://github.com/contoh",
    agree: "on",
  });
  ok(clean(await badPhone.text()).includes("No HP/WA tidak valid"), "Pengajuan toko: no HP asal ditolak");
  const badPort = await val.submitForm("/seller", valPage, 'name="storeName"', {
    storeName: "Toko Validasi",
    tagline: "",
    websiteUrl: "",
    phone: "08123456789",
    portfolioUrl: "bukan-url",
    agree: "on",
  });
  ok(clean(await badPort.text()).includes("URL harus diawali"), "Pengajuan toko: portofolio bukan URL ditolak");

  const adm = new Session();
  await adm.login("admin@rilisin.test");
  const queue = await adm.html("/admin/penjual");
  ok(queue.res.status === 200 && queue.text.includes("Toko Calon Uji"), "Admin melihat pengajuan di antrean");
  ok(queue.text.includes("081234567890") && queue.text.includes("github.com/tokocalon"), "Admin melihat HP + portofolio di antrean");
  const shortReject = await adm.submitForm("/admin/penjual", queue.text, 'name="reason"', { reason: "jelek" });
  ok(shortReject.status === 303 && (shortReject.headers.get("location") ?? "").includes("error=alasan"), "Tolak tanpa alasan jelas ditolak balik");
  const rejected = await adm.submitForm("/admin/penjual", queue.text, 'name="reason"', { reason: "Nama toko kurang jelas, perbaiki jadi nama usaha yang serius." });
  ok(rejected.status === 303 && (rejected.headers.get("location") ?? "").includes("hasil=ditolak"), "Admin menolak pengajuan");
  const rejPage = await calon.html("/seller");
  ok(rejPage.text.includes("belum disetujui") && rejPage.text.includes("kurang jelas"), "Pemohon melihat alasan penolakan + form ajukan ulang");
  const reapplied = await calon.submitForm("/seller", rejPage.text, 'name="storeName"', {
    storeName: "Toko Calon Serius",
    tagline: "Toko uji persetujuan",
    websiteUrl: "",
    phone: "081234567890",
    portfolioUrl: "https://github.com/tokocalon",
    agree: "on",
  });
  ok(reapplied.status === 303 && (reapplied.headers.get("location") ?? "").includes("/seller?diajukan=1"), "Pemohon bisa mengajukan ulang");
  const queue2 = await adm.html("/admin/penjual");
  const approved = await adm.submitForm("/admin/penjual", queue2.text, "Setujui toko", {});
  ok(approved.status === 303 && (approved.headers.get("location") ?? "").includes("hasil=disetujui"), "Admin menyetujui pengajuan toko");

  const dash = await calon.html("/seller");
  ok(
    dash.text.includes("Aktivasi toko") && dash.text.includes("Ikuti panduan 3 langkah"),
    "Dashboard menampilkan kartu aktivasi + CTA wizard",
  );

  const step1 = await calon.html("/seller/mulai");
  ok(step1.res.status === 200 && step1.text.includes("Langkah 1"), "Wizard langkah 1 tampil");
  const created = await calon.submitForm("/seller/mulai", step1.text, 'name="title"', {
    title: "Karya Wizard Smoke",
    summary: "Karya uji otomatis dari smoke test wizard onboarding seller.",
    category: "aplikasi",
    license: "MIT",
    platforms: "windows",
    tags: "",
    descriptionMd: "Deskripsi uji wizard yang sengaja dibuat cukup panjang supaya lolos checklist delapan puluh karakter.",
    websiteUrl: "",
    sourceUrl: "",
  });
  const loc = created.headers.get("location") ?? "";
  const draftId = loc.match(/\/seller\/mulai\?id=([0-9a-f-]{36})&langkah=2/)?.[1];
  ok(created.status === 303 && Boolean(draftId), "Langkah 1 membuat draft → lanjut langkah 2");

  const step2 = await calon.html(`/seller/mulai?id=${draftId}&langkah=2`);
  ok(step2.res.status === 200 && step2.text.includes('name="pricingModel"'), "Langkah 2 tampil dengan form harga");
  const priced = await calon.submitForm(`/seller/mulai?id=${draftId}&langkah=2`, step2.text, 'name="pricingModel"', {
    pricingModel: "fixed",
    priceIdr: "49000",
    minPriceIdr: "0",
  });
  ok(priced.status === 200 && clean(await priced.text()).includes("Harga disimpan"), "Harga wizard disimpan");

  const step3 = await calon.html(`/seller/mulai?id=${draftId}&langkah=3`);
  ok(step3.res.status === 200 && step3.text.includes("Checklist verifikasi"), "Langkah 3 tampil dengan checklist");
  const blocked = await calon.submitForm(`/seller/mulai?id=${draftId}&langkah=3`, step3.text, "Kirim ke review", {});
  ok(
    blocked.status === 303 && (blocked.headers.get("location") ?? "").includes("error=checklist"),
    "Submit dengan checklist belum lengkap ditolak jujur",
  );

  const sellerDash = await seller.html("/seller");
  ok(!sellerDash.text.includes("Aktivasi toko"), "Seller yang sudah pernah submit tidak melihat kartu aktivasi");
}

// ─── 3c. Rilis terjadwal: Segera hadir + hitung mundur + tayang otomatis ────
{
  const wib = (d) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 19);
  const pix = new Session();
  await pix.login("pixelrantau@rilisin.test");
  ok(pix.hasSession(), "Login seller terpercaya berhasil");
  const np = await pix.html("/seller/produk/baru");
  const nc = await pix.submitForm("/seller/produk/baru", np.text, 'name="title"', {
    title: "Game Terjadwal Smoke",
    summary: "Produk uji otomatis untuk rilis terjadwal.",
    category: "aplikasi",
    license: "MIT",
    platforms: ["android"],
    tags: "",
    descriptionMd: "Deskripsi uji rilis terjadwal yang sengaja dibuat cukup panjang supaya lolos checklist delapan puluh karakter.",
    websiteUrl: "",
    sourceUrl: "",
    pricingModel: "free",
  });
  const schedProductId = (nc.headers.get("location") ?? "").match(/\/seller\/produk\/([0-9a-f-]{36})/)?.[1];
  ok(nc.status === 303 && Boolean(schedProductId), "Seller terpercaya membuat draft produk");
  const schedSlug = (await pix.html(`/seller/produk/${schedProductId}`)).text.match(/\/p\/([a-z0-9-]+)/)?.[1];

  const spng = await sharp({ create: { width: 800, height: 800, channels: 3, background: "#f59e0b" } }).png().toBuffer();
  const sjpg = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#0ea5e9" } }).jpeg().toBuffer();
  ok((await pix.upload("icon", schedProductId, "ikon.png", spng)).ok, "Upload ikon produk terjadwal");
  ok((await pix.upload("cover", schedProductId, "cover.jpg", sjpg)).ok, "Upload cover produk terjadwal");
  ok((await pix.upload("screenshot", schedProductId, "layar.jpg", sjpg)).ok, "Upload screenshot produk terjadwal");
  const spage = await pix.html(`/seller/produk/${schedProductId}`);
  const sandroid = await pix.submitForm(`/seller/produk/${schedProductId}`, spage.text, 'name="androidPackage"', {
    androidPackage: "id.uji.jadwal",
    androidRegistration: "not_registered",
  });
  ok(sandroid.status === 200, "Simpan info Android produk terjadwal");

  const srel = await pix.submitForm(`/seller/produk/${schedProductId}`, spage.text, 'name="version"', { version: "1.0.0", changelogMd: "- Rilis terjadwal uji" });
  ok(srel.status === 200 && clean(await srel.text()).includes("Rilis v1.0.0 dibuat"), "Buat rilis v1.0.0 (untuk dijadwalkan)");
  const srelId = (await pix.html(`/seller/produk/${schedProductId}`)).text.match(/name="releaseId" value="([0-9a-f-]{36})"/)?.[1];
  const sapk = Buffer.from(zipSync({ "AndroidManifest.xml": strToU8('<manifest package="id.uji.jadwal"/>'), "classes.dex": strToU8("dex") }));
  ok((await pix.upload("release_file", srelId, "jadwal-1.0.0.apk", sapk, "android")).ok, "Upload APK rilis terjadwal");

  const when = wib(new Date(Date.now() + 5000));
  const sub = await pix.submitForm(`/seller/produk/${schedProductId}`, (await pix.html(`/seller/produk/${schedProductId}`)).text, 'name="scheduledAt"', { scheduledAt: when });
  ok(sub.status === 303 && (sub.headers.get("location") ?? "").includes("dikirim=jadwal"), "Produk dikirim dengan jadwal tayang");
  const coming = await guest.html(`/p/${schedSlug}`);
  ok(coming.res.status === 200 && coming.text.includes("Segera hadir") && coming.text.includes("1.0.0"), "Publik melihat Segera hadir + hitung mundur (bukan 404)");
  ok(!coming.text.includes("action=\"/api/download/"), "Rilis terjadwal belum bisa diunduh");
  ok((await pix.html(`/seller/produk/${schedProductId}`)).text.includes("Terjadwal"), "Seller melihat badge Terjadwal");
  await new Promise((r) => setTimeout(r, 7000));
  ok((await pix.html(`/p/${schedSlug}`)).text.includes("v1.0.0"), "Rilis tayang otomatis setelah jadwal tiba");

  const rel2 = await pix.submitForm(`/seller/produk/${schedProductId}`, (await pix.html(`/seller/produk/${schedProductId}`)).text, 'name="version"', { version: "2.0.0", changelogMd: "- Rilis kedua" });
  ok(rel2.status === 200 && clean(await rel2.text()).includes("Rilis v2.0.0 dibuat"), "Buat rilis v2.0.0");
  const relId2 = (await pix.html(`/seller/produk/${schedProductId}`)).text.match(/name="releaseId" value="([0-9a-f-]{36})"/)?.[1];
  ok((await pix.upload("release_file", relId2, "jadwal-2.0.0.apk", sapk, "android")).ok, "Upload APK v2.0.0");
  const when2 = wib(new Date(Date.now() + 120000));
  const sub2 = await pix.submitForm(`/seller/produk/${schedProductId}`, (await pix.html(`/seller/produk/${schedProductId}`)).text, "Tayangkan rilis", { scheduledAt: when2 });
  ok(sub2.status === 303 && (sub2.headers.get("location") ?? "").includes("rilis=jadwal"), "Rilis 2.0.0 terjadwal");
  const cancel = await pix.submitForm(`/seller/produk/${schedProductId}`, (await pix.html(`/seller/produk/${schedProductId}`)).text, "Batalkan jadwal", {});
  ok(cancel.status === 303 && (cancel.headers.get("location") ?? "").includes("rilis=tayang"), "Jadwal dibatalkan, rilis langsung tayang");
}

// ─── 4. Admin approve ───────────────────────────────────────────────────────
{
  const userTriesAdmin = await user.html("/admin/review");
  ok(userTriesAdmin.res.status === 404, "User biasa tidak bisa membuka halaman admin (404)");
  const admin = new Session();
  await admin.login("admin@rilisin.test");
  const queue = await admin.html("/admin/review");
  ok(queue.text.includes("Aplikasi Uji Smoke Test") && queue.text.includes("KasirKu Offline"), "Antrian review berisi produk baru & update rilis");
  const detail = await admin.html(`/admin/review/${productId}`);
  const approve = await admin.submitForm(`/admin/review/${productId}`, detail.text, "Setujui &amp; tayangkan");
  ok(approve.status === 303, "Admin menyetujui produk");
  const pub = await guest.html(`/p/${slug}`);
  ok(pub.res.status === 200 && pub.text.includes("Perlu mode lanjutan"), "Produk tayang untuk publik + label Android benar");
}


// ─── 5. Komunitas: chat grup ────────────────────────────────────────────────
const rina = user; // user@rilisin.test (Rina)
{
  const room = await guest.html("/komunitas/nongkrong");
  ok(room.res.status === 200 && room.text.includes("Gradle memang ujian kesabaran") && room.text.includes("Masuk untuk ikut ngobrol"), "Tamu bisa baca cuplikan ruang (mode baca)");
  const guestApi = await guest.api("/api/chat/rooms/nongkrong/messages");
  ok(guestApi.status === 401, "API chat menolak tamu (401)");
  const list = await guest.html("/komunitas");
  ok(list.text.includes("Tanya Jawab Coding") && list.text.includes("Pamer Karya"), "Daftar ruang tampil di /komunitas");

  const sent = await rina.say("nongkrong", "Halo dari smoke test 👋 *tebal* dan `kode`");
  ok(sent.status === 201 && sent.data.message?.author?.username === "rina", "Kirim pesan (201)");
  const msgId = sent.data.message.id;
  const again = await rina.api("/api/chat/rooms/nongkrong/messages", { body: "x", clientId: sent.data.message.clientId });
  ok(again.status === 201 && again.data.message.id === msgId, "Kirim ulang dengan clientId sama tidak bikin pesan dobel");

  const noOrigin = await rina.req("/api/chat/rooms/nongkrong/messages", { method: "POST", headers: { "content-type": "application/json", origin: "https://situs-jahat.example" }, body: JSON.stringify({ body: "csrf", clientId: "csrf-12345678" }) });
  ok(noOrigin.status === 403, "Chat: POST dari origin asing ditolak (CSRF)");
  const plain = await rina.req("/api/chat/rooms/nongkrong/messages", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ body: "x", clientId: "plain-12345678" }) });
  ok(plain.status === 415, "Chat: Content-Type selain JSON ditolak");
  const ann = await rina.say("pengumuman", "boleh ikut kirim?");
  ok(ann.status === 403, "Ruang pengumuman hanya untuk admin/moderator");
  const judol = await rina.say("nongkrong", "Daftar S1OT G4C0R hari ini pasti maxwin!!");
  ok(judol.status === 422 && /judi/i.test(judol.data.error), "Promosi judol diblokir filter");

  const edited = await rina.api(`/api/chat/messages/${msgId}`, { action: "edit", body: "Halo dari smoke test (diedit) ✏️" });
  ok(edited.status === 200 && edited.data.message.editedAt && edited.data.message.body.includes("diedit"), "Edit pesan sendiri");
  const sellerEdit = await seller.api(`/api/chat/messages/${msgId}`, { action: "edit", body: "dibajak" });
  ok(sellerEdit.status === 403, "Tidak bisa mengedit pesan orang lain");

  const react = await seller.api(`/api/chat/messages/${msgId}`, { action: "react", emoji: "🔥" });
  ok(react.status === 200 && react.data.message.reactions.some((r) => r.emoji === "🔥"), "Reaksi emoji tersimpan");
  const badEmoji = await seller.api(`/api/chat/messages/${msgId}`, { action: "react", emoji: "<script>" });
  ok(badEmoji.status === 400, "Reaksi di luar daftar emoji ditolak");
  const toggle = await seller.api(`/api/chat/messages/${msgId}`, { action: "react", emoji: "🔥" });
  ok(toggle.status === 200 && !toggle.data.message.reactions.some((r) => r.emoji === "🔥"), "Ketuk emoji yang sama = hapus reaksi");

  const reply = await seller.say("nongkrong", "Balasan uji", { replyToId: msgId });
  ok(reply.status === 201 && reply.data.message.replyTo?.id === msgId, "Balas pesan (reply)");

  const hideMe = await rina.api(`/api/chat/messages/${reply.data.message.id}`, { action: "delete", scope: "me" });
  const rinaList = await rina.api("/api/chat/rooms/nongkrong/messages");
  const sellerList = await seller.api("/api/chat/rooms/nongkrong/messages");
  ok(hideMe.status === 200 && !rinaList.data.messages.some((m) => m.id === reply.data.message.id) && sellerList.data.messages.some((m) => m.id === reply.data.message.id), "Hapus untuk saya: hilang hanya di akun sendiri");

  const cannot = await seller.api(`/api/chat/messages/${msgId}`, { action: "delete", scope: "everyone" });
  ok(cannot.status === 403, "Tidak bisa hapus-untuk-semua pesan orang lain");
  const del = await rina.api(`/api/chat/messages/${msgId}`, { action: "delete", scope: "everyone" });
  const afterDel = await seller.api("/api/chat/rooms/nongkrong/messages");
  const tomb = afterDel.data.messages.find((m) => m.id === msgId);
  ok(del.status === 200 && tomb?.deleted === "author" && tomb.body === "", "Hapus untuk semua orang → jadi 'pesan dihapus' di akun lain");

  // Realtime: seller membuka SSE, Rina mengirim pesan → seller menerima event
  const ac = new AbortController();
  const stream = await seller.req("/api/chat/stream?room=nongkrong", { signal: ac.signal, headers: { accept: "text/event-stream" } });
  ok(stream.status === 200 && (stream.headers.get("content-type") ?? "").startsWith("text/event-stream"), "Stream realtime (SSE) tersambung");
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const waitFor = async (needle, ms = 5000) => {
    const deadline = Date.now() + ms;
    while (!buf.includes(needle) && Date.now() < deadline) {
      const r = await Promise.race([reader.read(), new Promise((res) => setTimeout(() => res({ timeout: true }), deadline - Date.now()))]);
      if (r.done || r.timeout) break;
      buf += decoder.decode(r.value, { stream: true });
    }
    return buf.includes(needle);
  };
  ok(await waitFor("event: ready"), "SSE mengirim event 'ready'");
  await rina.say("nongkrong", "Pesan realtime dari smoke test ⚡");
  ok(await waitFor("Pesan realtime dari smoke test"), "Pesan baru diterima realtime lewat SSE");
  await rina.api("/api/chat/rooms/nongkrong/typing", {});
  ok(await waitFor("event: typing"), "Indikator 'sedang mengetik' diteruskan realtime");
  ac.abort();

  // Gambar
  const png = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#f59e0b" } }).png().toBuffer();
  const upRes = await rina.req("/api/chat/uploads", { method: "POST", headers: { "content-type": "image/png" }, body: png });
  const up = await upRes.json();
  ok(upRes.status === 201 && up.url?.endsWith(".webp"), "Upload gambar chat (dikonversi ke WebP)");
  const withImg = await rina.say("pamer-karya", "Screenshot uji", { uploadId: up.id });
  ok(withImg.status === 201 && withImg.data.message.image?.url === up.url, "Kirim pesan bergambar");
  const reuse = await rina.say("nongkrong", "pakai ulang", { uploadId: up.id });
  ok(reuse.status === 400, "Gambar yang sudah dipakai tidak bisa dipakai ulang");
  const fakeImg = await rina.req("/api/chat/uploads", { method: "POST", headers: { "content-type": "image/png" }, body: Buffer.from("<svg onload=alert(1)>") });
  ok(fakeImg.status === 415, "File bukan gambar ditolak (cek magic bytes)");
  const slow = await rina.say("pamer-karya", "pesan kedua terlalu cepat");
  ok(slow.status === 429 && /Mode lambat/.test(slow.data.error), "Mode lambat ruang Pamer Karya bekerja");

  // Laporan → otomatis tersembunyi setelah 3 pelapor
  const andi = new Session();
  await andi.login("andi10@contoh.test");
  const bad = await andi.say("nongkrong", "Pesan uji yang akan dilaporkan");
  const siti = new Session();
  await siti.login("siti11@contoh.test");
  const r1 = await rina.api(`/api/chat/messages/${bad.data.message.id}`, { action: "report", reason: "spam" });
  const r1b = await rina.api(`/api/chat/messages/${bad.data.message.id}`, { action: "report", reason: "spam" });
  await seller.api(`/api/chat/messages/${bad.data.message.id}`, { action: "report", reason: "penipuan", note: "uji" });
  const r3 = await siti.api(`/api/chat/messages/${bad.data.message.id}`, { action: "report", reason: "spam" });
  ok(r1.status === 200 && r1b.data.already === true && r3.data.hidden === true, "3 laporan berbeda → pesan disembunyikan otomatis (laporan ganda tidak dihitung)");
  const selfReport = await andi.api(`/api/chat/messages/${bad.data.message.id}`, { action: "report", reason: "spam" });
  ok(selfReport.status === 400, "Tidak bisa melaporkan pesan sendiri");

  // Moderator: bisukan anggota
  const mod = new Session();
  await mod.login("dimas24@contoh.test");
  const muteByUser = await rina.api(`/api/chat/messages/${bad.data.message.id}`, { action: "mute_author", minutes: 60 });
  ok(muteByUser.status === 403, "Anggota biasa tidak bisa membisukan");
  const mute = await mod.api(`/api/chat/messages/${bad.data.message.id}`, { action: "mute_author", minutes: 60, reason: "uji" });
  ok(mute.status === 200 && mute.data.until, "Moderator membisukan anggota 1 jam");
  const mutedSay = await andi.say("tanya-jawab", "masih bisa kirim?");
  ok(mutedSay.status === 403 && mutedSay.data.code === "muted", "Anggota yang dibisukan tidak bisa kirim pesan");

  const adminS = new Session();
  await adminS.login("admin@rilisin.test");
  const reportsPage = await adminS.html("/admin/laporan");
  ok(reportsPage.text.includes("Pesan uji yang akan dilaporkan") && reportsPage.text.includes("Disembunyikan otomatis"), "Laporan muncul di panel moderator");
  const restore = await adminS.submitForm("/admin/laporan", reportsPage.text, "Pulihkan pesan");
  ok(restore.status === 303 || restore.status === 200, "Moderator memulihkan pesan");
  const read = await rina.api("/api/chat/rooms/nongkrong/read", { seq: 1 });
  ok(read.status === 204, "Tandai sudah dibaca");
}

// ─── 6. Keamanan akun ───────────────────────────────────────────────────────
const b32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function totp(secret, offset = 0) {
  let bits = 0, value = 0;
  const bytes = [];
  for (const ch of secret.replace(/\s/g, "")) {
    value = ((value << 5) | b32.indexOf(ch)) & 0xffff;
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const h = createHmac("sha1", Buffer.from(bytes)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0");
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function register(s, username, password, extra = {}) {
  const page = await s.html("/daftar");
  if (!extra.fast) await sleep(1700);
  return s.submitForm("/daftar", page.text, 'name="username"', { displayName: "Akun Uji", username, email: `${username}@uji.test`, password, next: "/", ...extra.fields });
}
{
  const tag = Date.now().toString(36).slice(-6);
  const bot = new Session();
  const botRes = await register(bot, `bot${tag}`, "KataSandiKuat#2026", { fast: true });
  ok(!bot.hasSession() && clean(await botRes.text()).includes("gagal diverifikasi"), "Anti-bot: form daftar yang dikirim terlalu cepat ditolak");
  const hp = new Session();
  await register(hp, `hp${tag}`, "KataSandiKuat#2026", { fields: { website: "http://spam.example" } });
  ok(!hp.hasSession(), "Anti-bot: honeypot terisi → ditolak");
  const weak = new Session();
  const weakRes = await register(weak, `weak${tag}`, "password123");
  ok(!weak.hasSession() && clean(await weakRes.text()).includes("terlalu umum"), "Password umum ditolak saat daftar");

  const a = new Session();
  const username = `uji${tag}`;
  const pw = "KataSandiKuat#2026";
  const reg = await register(a, username, pw);
  ok(reg.status === 303 && a.hasSession(), "Daftar akun baru (lolos anti-bot)");
  const link = await a.say("tanya-jawab", "cek https://contoh.com ya");
  ok(link.status === 422 && link.data.code === "new_account_link", "Akun baru belum boleh mengirim link");

  // Aktifkan 2FA
  const sec = await a.html("/akun/keamanan");
  ok(sec.text.includes("Perangkat ini") && sec.text.includes("Aktifkan 2FA"), "Halaman Keamanan akun tampil (daftar perangkat + 2FA)");
  const start = await a.submitForm("/akun/keamanan", sec.text, "Aktifkan 2FA");
  ok(start.status === 303 && (start.headers.get("location") ?? "").includes("/akun/keamanan/2fa"), "Mulai aktivasi 2FA");
  const setup = await a.html("/akun/keamanan/2fa");
  const secret = setup.text.match(/select-all[^>]*>([A-Z2-7 ]{20,})</)?.[1];
  ok(Boolean(secret) && setup.text.includes("data:image/svg+xml;base64"), "QR code & kunci manual 2FA tampil");
  const wrong = await a.submitForm("/akun/keamanan/2fa", setup.text, 'name="code"', { code: "000000" });
  ok(clean(await wrong.text()).includes("Kode salah"), "Kode 2FA salah ditolak saat aktivasi");
  const setupCode = totp(secret);
  const confirm = await a.submitForm("/akun/keamanan/2fa", setup.text, 'name="code"', { code: setupCode });
  const confirmText = clean(await confirm.text());
  const codes = [...confirmText.matchAll(/>([a-z2-9]{5}-[a-z2-9]{5})</g)].map((m) => m[1]);
  ok(confirmText.includes("2FA berhasil diaktifkan") && codes.length === 10, "2FA aktif + 10 kode cadangan ditampilkan sekali");

  // Login dengan 2FA
  const b = new Session();
  const login = await b.login(username, pw);
  ok(login.status === 303 && (login.headers.get("location") ?? "").includes("/masuk/verifikasi") && !b.hasSession(), "Password benar tapi belum masuk: diminta kode 2FA");
  const verifyPage = await b.html("/masuk/verifikasi");
  const replay = await b.submitForm("/masuk/verifikasi", verifyPage.text, 'name="code"', { code: setupCode });
  ok(!b.hasSession() && clean(await replay.text()).includes("Kode salah"), "Kode TOTP yang sudah dipakai tidak bisa dipakai ulang (anti replay)");
  await b.submitForm("/masuk/verifikasi", verifyPage.text, 'name="code"', { code: totp(secret, 1) });
  ok(b.hasSession(), "Login 2FA dengan kode berikutnya berhasil");

  const c = new Session();
  await c.login(username, pw);
  const vp = await c.html("/masuk/verifikasi");
  await c.submitForm("/masuk/verifikasi", vp.text, 'name="code"', { code: codes[0].toUpperCase() });
  ok(c.hasSession(), "Login memakai kode cadangan");
  const d = new Session();
  await d.login(username, pw);
  const vp2 = await d.html("/masuk/verifikasi");
  await d.submitForm("/masuk/verifikasi", vp2.text, 'name="code"', { code: codes[0] });
  ok(!d.hasSession(), "Kode cadangan hanya bisa dipakai sekali");

  // Ganti password → sesi lain keluar
  const secB = await b.html("/akun/keamanan");
  const badCur = await b.submitForm("/akun/keamanan", secB.text, 'name="currentPassword"', { currentPassword: "salah", newPassword: "PasswordBaru#2026", confirmPassword: "PasswordBaru#2026" });
  ok(clean(await badCur.text()).includes("Password saat ini salah"), "Ganti password: password lama salah ditolak");
  const changed = await b.submitForm("/akun/keamanan", secB.text, 'name="currentPassword"', { currentPassword: pw, newPassword: "PasswordBaru#2026", confirmPassword: "PasswordBaru#2026" });
  ok(clean(await changed.text()).includes("perangkat lain otomatis dikeluarkan"), "Ganti password berhasil");
  const kicked = await c.req("/akun/keamanan");
  ok(kicked.status === 307, "Perangkat lain otomatis keluar setelah ganti password");

  // Kunci akun setelah 8x password salah
  const lockUser = `kunci${tag}`;
  const lk = new Session();
  await register(lk, lockUser, pw);
  for (let i = 0; i < 8; i++) {
    const s = new Session();
    await s.login(lockUser, `salah-${i}`);
  }
  const locked = new Session();
  const lockedRes = await locked.login(lockUser, pw);
  ok(!locked.hasSession() && clean(await lockedRes.text()).includes("dikunci sementara"), "Akun dikunci sementara setelah 8x password salah (walau password benar)");

  const log = await (async () => {
    const adm = new Session();
    await adm.login("admin@rilisin.test");
    return adm.html("/admin/keamanan");
  })();
  ok(log.text.includes("Akun dikunci sementara") && log.text.includes("2FA diaktifkan"), "Log keamanan admin mencatat kejadian");
}

// ─── 7. Fase 2: checkout, pembayaran (simulasi), saldo, pencairan, refund ───
{
  const PRO = "/p/kasirku-pro";
  const admin2 = new Session();
  await admin2.login("admin@rilisin.test");
  const staffView = await admin2.html(PRO);
  const proFileId = staffView.text.match(/action="\/api\/download\/([0-9a-f-]{36})"/)?.[1];
  ok(Boolean(proFileId), "Produk berbayar KasirKu Pro punya file rilis");

  const page = await user.html(PRO);
  ok(page.text.includes('href="/beli/kasirku-pro"') && !page.text.includes(`/api/download/${proFileId}`), "Belum beli → tombol Beli, bukan tombol download");
  const denied = await user.req(`/api/download/${proFileId}`, { method: "POST" });
  ok(denied.status === 303 && (denied.headers.get("location") ?? "").endsWith(PRO), "File berbayar tidak bisa di-download sebelum dibeli");

  const g = await guest.req("/beli/kasirku-pro");
  ok([303, 307].includes(g.status) && (g.headers.get("location") ?? "").includes("/masuk"), "Checkout wajib login");
  const freeCo = await user.req("/beli/catat-duit");
  ok([303, 307].includes(freeCo.status) && (freeCo.headers.get("location") ?? "").includes("/p/catat-duit"), "Produk gratis tidak lewat checkout");
  const selfBuy = await seller.req("/beli/kasirku-pro");
  ok([303, 307].includes(selfBuy.status), "Seller tidak bisa membeli produknya sendiri");

  const co = await user.html("/beli/kasirku-pro");
  ok(co.res.status === 200 && co.text.includes("Metode pembayaran") && co.text.includes("BRI Virtual Account"), "Halaman checkout menampilkan metode QRIS & VA");
  // amount palsu diabaikan untuk harga tetap
  const created = await user.submitForm("/beli/kasirku-pro", co.text, 'name="productId"', { method: "qris", amount: "1000" });
  const code = (created.headers.get("location") ?? "").match(/\/pesanan\/(RLS-\d{6}-[2-9A-HJ-NP-Z]{10})/)?.[1];
  ok(created.status === 303 && Boolean(code), "Checkout membuat pesanan → diarahkan ke halaman pesanan");
  const op = await user.html(`/pesanan/${code}`);
  ok(op.text.includes("Selesaikan pembayaran") && op.text.includes("data:image/svg+xml;base64,") && op.text.includes("Simulasikan pembayaran berhasil"), "Halaman pesanan menampilkan QRIS + tombol simulasi");
  ok(op.text.includes("Rp49.653"), "Total = harga Rp49.000 + biaya QRIS Rp653 (nominal palsu dari browser diabaikan)");
  const co2 = await user.html("/beli/kasirku-pro");
  const again = await user.submitForm("/beli/kasirku-pro", co2.text, 'name="productId"', { method: "qris" });
  ok((again.headers.get("location") ?? "").includes(code), "Klik bayar dua kali → pesanan yang sama (idempoten)");
  ok((await seller.req(`/pesanan/${code}`)).status === 404 && (await seller.api(`/api/orders/${code}/status`)).status === 404, "Pesanan & statusnya tidak bisa diintip akun lain");
  ok((await user.api(`/api/orders/${code}/status`)).data.status === "pending", "API status: menunggu pembayaran");

  const wh = await guest.req("/api/payments/pakasir/webhook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ order_id: code, amount: 49000, status: "completed", txn_id: "x" }) });
  ok(wh.status === 404 && (await user.api(`/api/orders/${code}/status`)).data.status === "pending", "Webhook palsu ditolak (gateway belum dikonfigurasi) & pesanan tetap pending");

  const paid = await user.submitForm(`/pesanan/${code}`, op.text, "Simulasikan pembayaran berhasil");
  ok(paid.status === 303, "Simulasi pembayaran diproses");
  ok((await user.api(`/api/orders/${code}/status`)).data.status === "paid", "Status pesanan jadi LUNAS");
  const again2 = await user.html(`/pesanan/${code}`);
  ok(again2.text.includes("Pembayaran berhasil") && !again2.text.includes("Simulasikan pembayaran berhasil"), "Halaman pesanan menampilkan sukses (tombol simulasi hilang)");
  const dl = await user.req(`/api/download/${proFileId}`, { method: "POST" });
  ok(dl.status === 303 && isSignedDownload(dl.headers.get("location") ?? ""), "Setelah bayar, file berbayar bisa di-download");
  ok((await user.html("/library")).text.includes("KasirKu Pro"), "Produk yang dibeli masuk Library");
  ok((await user.html("/akun/pesanan")).text.includes(code), "Riwayat 'Pesanan saya' berisi pesanan lunas");
  const ownedCo = await user.req("/beli/kasirku-pro");
  ok([303, 307].includes(ownedCo.status), "Sudah punya → checkout dialihkan ke halaman produk");

  // Seller: penjualan & saldo (seed: tersedia Rp82.300, tertahan Rp88.200 → +Rp44.100 dari penjualan barusan)
  const sales = await seller.html("/seller/penjualan");
  ok(sales.text.includes(code) && sales.text.includes("@rina") && sales.text.includes("Rp44.100"), "Seller melihat penjualan baru (komisi 10% dipotong → Rp44.100)");
  const bal = await seller.html("/seller/saldo");
  ok(bal.text.includes("Rp82.300") && bal.text.includes("Rp132.300"), "Saldo seller: tersedia Rp82.300, tertahan Rp132.300");

  const req = (fields) => seller.html("/seller/saldo").then((pg) => seller.submitForm("/seller/saldo", pg.text, "Ajukan pencairan", fields)).then(async (r) => clean(await r.text()));
  ok((await req({ amount: "60000", password: "salah-banget" })).includes("Password salah"), "Pencairan: password salah ditolak");
  ok((await req({ amount: "20000", password: DEMO_PW })).includes("Minimal pencairan Rp50.000"), "Pencairan: di bawah minimal ditolak");
  ok((await req({ amount: "100000", password: DEMO_PW })).includes("Saldo tersedia hanya Rp82.300"), "Pencairan: melebihi saldo tersedia ditolak");
  ok((await req({ amount: "60000", password: DEMO_PW })).includes("Pencairan diajukan"), "Pencairan Rp60.000 diajukan");
  const bal2 = await seller.html("/seller/saldo");
  ok(bal2.text.includes("Rp22.300") && bal2.text.includes("Masih ada pencairan yang sedang diproses"), "Saldo tersedia berkurang & pengajuan kedua diblokir");

  // Admin keuangan
  const mod2 = new Session();
  await mod2.login("dimas24@contoh.test");
  ok((await mod2.html("/admin/keuangan")).res.status === 404, "Moderator tidak bisa membuka Keuangan (khusus admin)");
  const fin = await admin2.html("/admin/keuangan");
  ok(fin.text.includes("Pencairan menunggu") && fin.text.includes("Rp60.000") && fin.text.includes("1234567890") && fin.text.includes("Rp250.000"), "Admin melihat antrian pencairan + nomor rekening lengkap (didekripsi)");
  const nusantaraCard = fin.text.split("<form").find((c) => c.includes("Tolak pencairan") && fin.text.indexOf(c) > fin.text.indexOf("Rp60.000"));
  ok(Boolean(nusantaraCard), "Form proses pencairan tersedia");
  // tolak pencairan Rp60.000 (form pertama setelah kartu Rp60.000 muncul — antrian urut waktu pengajuan: Dapur Kode dulu, lalu Nusantara)
  const payoutIds = [...fin.text.matchAll(/name="payoutId" value="([0-9a-f-]{36})"/g)].map((m) => m[1]);
  const nusantaraPayout = payoutIds[payoutIds.length - 1];
  const rejectForm = fin.text.split("<form").map((c) => c.split("</form>")[0]).find((c) => c.includes(nusantaraPayout) && c.includes("Tolak pencairan"));
  const fd = new FormData();
  for (const tag of rejectForm.match(/<input[^>]*>/g) ?? []) {
    if (!/type="hidden"/.test(tag)) continue;
    fd.append(decode(tag.match(/name="([^"]*)"/)[1]), decode(tag.match(/value="([^"]*)"/)?.[1] ?? ""));
  }
  fd.append("reason", "Uji smoke: nama rekening tidak cocok");
  const rej = await admin2.req("/admin/keuangan", { method: "POST", body: fd });
  ok(rej.status === 200 && clean(await rej.text()).includes("dana kembali ke saldo seller"), "Admin menolak pencairan");
  ok((await seller.html("/seller/saldo")).text.includes("Rp82.300"), "Pencairan ditolak → saldo tersedia kembali Rp82.300");

  ok((await req({ amount: "50000", password: DEMO_PW })).includes("Pencairan diajukan"), "Seller mengajukan pencairan lagi (Rp50.000)");
  const fin2 = await admin2.html("/admin/keuangan");
  const ids2 = [...fin2.text.matchAll(/name="payoutId" value="([0-9a-f-]{36})"/g)].map((m) => m[1]);
  const newest = ids2[ids2.length - 1];
  const paidForm = fin2.text.split("<form").map((c) => c.split("</form>")[0]).find((c) => c.includes(newest) && c.includes("Tandai terkirim"));
  const fd2 = new FormData();
  for (const tag of paidForm.match(/<input[^>]*>/g) ?? []) {
    if (!/type="hidden"/.test(tag)) continue;
    fd2.append(decode(tag.match(/name="([^"]*)"/)[1]), decode(tag.match(/value="([^"]*)"/)?.[1] ?? ""));
  }
  fd2.append("transferRef", "SMOKE-TRF-0001");
  const mark = await admin2.req("/admin/keuangan", { method: "POST", body: fd2 });
  ok(mark.status === 200 && clean(await mark.text()).includes("ditandai terkirim"), "Admin menandai pencairan terkirim");
  const hist = await seller.html("/seller/saldo");
  ok(hist.text.includes("SMOKE-TRF-0001") && hist.text.includes("Terkirim") && hist.text.includes("Rp32.300"), "Seller melihat pencairan terkirim + referensi, saldo tersedia Rp32.300");

  // Ganti rekening → wajib verifikasi ulang sebelum bisa cair
  const acct = await seller.html("/seller/saldo");
  const changed = await seller.submitForm("/seller/saldo", acct.text, 'name="accountHolder"', { method: "bank", providerName: "BRI", accountNumber: "9876543210", accountHolder: "Ahmad Fauzi", password: DEMO_PW });
  const changedText = clean(await changed.text());
  ok(changedText.includes("Rekening disimpan") && changedText.includes("Menunggu verifikasi") && changedText.includes("Rekening sedang diverifikasi admin"), "Ganti rekening → status menunggu verifikasi & pencairan terkunci");
  const fin3 = await admin2.html("/admin/keuangan");
  // ada 2 rekening menunggu (Rintis Desain dari seed + Nusantara Labs) → ambil form di baris @nusantaralabs
  const rekening = fin3.text.slice(fin3.text.indexOf('id="rekening"'));
  const rowForm = rekening.slice(rekening.indexOf("@nusantaralabs")).split("<form")[1].split("</form>")[0];
  const fd3 = new FormData();
  for (const tag of rowForm.match(/<input[^>]*>/g) ?? []) {
    if (!/type="hidden"/.test(tag)) continue;
    fd3.append(decode(tag.match(/name="([^"]*)"/)[1]), decode(tag.match(/value="([^"]*)"/)?.[1] ?? ""));
  }
  const verify = await admin2.req("/admin/keuangan", { method: "POST", body: fd3 });
  ok(verify.status === 303 && (await seller.html("/seller/saldo")).text.includes("Terverifikasi"), "Admin memverifikasi rekening baru");

  // Refund: akses dicabut + pendapatan seller ditarik
  const detail = await admin2.html(`/admin/keuangan/pesanan/${code}`);
  ok(detail.text.includes("simulate → paid") && detail.text.includes("Buku besar seller"), "Detail pesanan admin: log event & buku besar");
  const refund = await admin2.submitForm(`/admin/keuangan/pesanan/${code}`, detail.text, 'name="reason"', { reason: "Uji smoke: file tidak sesuai deskripsi" });
  ok(refund.status === 200 && clean(await refund.text()).includes("Pesanan di-refund"), "Admin me-refund pesanan");
  const dl2 = await user.req(`/api/download/${proFileId}`, { method: "POST" });
  ok(dl2.status === 303 && (dl2.headers.get("location") ?? "").endsWith(PRO), "Setelah refund, akses download dicabut");
  ok((await user.html(`/pesanan/${code}`)).text.includes("sudah di-refund"), "Pembeli melihat status refund");
  ok((await seller.html("/seller/saldo")).text.includes("Rp88.200"), "Pendapatan penjualan yang di-refund ditarik dari saldo tertahan");

  // Bayar seikhlasnya (min Rp0): nominal kecil ditolak, Rp0 = ambil gratis
  const pw = await user.html("/beli/tebak-kata-daerah");
  ok(pw.text.includes("Mau bayar berapa?"), "Checkout bayar seikhlasnya menampilkan input nominal");
  const tooSmall = await user.submitForm("/beli/tebak-kata-daerah", pw.text, 'name="productId"', { method: "qris", amount: "500" });
  ok(clean(await tooSmall.text()).includes("Minimal Rp1.000"), "Bayar seikhlasnya: Rp500 ditolak (minimal Rp1.000 kalau tidak gratis)");
  const pw2 = await user.html("/beli/tebak-kata-daerah");
  const claim = await user.submitForm("/beli/tebak-kata-daerah", pw2.text, 'name="productId"', { method: "qris", amount: "0" });
  ok(claim.status === 303 && (claim.headers.get("location") ?? "").includes("/p/tebak-kata-daerah?diambil=1") && (await user.html("/library")).text.includes("Tebak Kata Daerah"), "Bayar seikhlasnya Rp0 → langsung masuk Library");
}

// ─── 8. Fase 3: forum, ulasan, notifikasi, reset password ───────────────────
{
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const as = async (email) => {
    const s = new Session();
    await s.login(email);
    return s;
  };
  const [rina, sel, maya, oki, rizky, mod3, adm3, pixel] = await Promise.all([
    as("user@rilisin.test"),
    as("seller@rilisin.test"),
    as("maya23@contoh.test"),
    as("oki38@contoh.test"),
    as("rizky14@contoh.test"),
    as("dimas24@contoh.test"),
    as("admin@rilisin.test"),
    as("pixelrantau@rilisin.test"),
  ]);
  ok([rina, sel, maya, oki, rizky, mod3, adm3, pixel].every((s) => s.hasSession()), "Fase 3: semua akun uji berhasil masuk");
  const unread = async (s) => (await s.api("/api/notifications/unread")).data.unread;
  const notifs = async (s) => (await s.api("/api/notifications?limit=20")).data.items ?? [];

  // Forum publik
  const home = await guest.html("/forum");
  ok(home.res.status === 200 && home.text.includes("Tanya Jawab") && home.text.includes("KasirKu Offline bisa cetak struk"), "Forum: beranda menampilkan kategori & thread");
  const qaCount = Number(home.text.match(/font-semibold">Tanya Jawab<\/span><span class="text-xs tabular-nums text-slate-400">(\d+)</)?.[1] ?? 0);
  ok(qaCount >= 1, `Forum: jumlah thread per kategori dihitung (Tanya Jawab: ${qaCount})`);
  ok((await guest.html("/forum?q=flutter")).text.includes("APK Flutter release"), "Forum: pencarian menemukan thread");
  const unanswered = (await guest.html("/forum?urut=belum-terjawab")).text;
  ok(unanswered.includes("Webhook payment gateway") && !unanswered.includes("APK Flutter release"), "Forum: filter belum terjawab");
  const qaHref = home.text.match(/href="(\/forum\/t\/[0-9a-f-]{36})"[^>]*>KasirKu Offline bisa cetak struk/)?.[1];
  const qa = await guest.html(qaHref);
  ok(qa.res.status === 200 && qa.text.includes("Jawaban terbaik") && qa.text.includes("ESC/POS") && qa.text.includes(">Pembuat<") && qa.text.includes('href="/@nusantaralabs"'), "Thread: jawaban terbaik, badge Pembuat & link mention tampil");
  ok(qa.text.includes(`/masuk?next=${encodeURIComponent(qaHref)}`) && !qa.text.includes('data-form="reply"'), "Thread: tamu diminta masuk untuk upvote/membalas");

  // Buat thread
  const guestNew = await guest.req("/forum/baru");
  ok(guestNew.status === 307 && (guestNew.headers.get("location") ?? "").includes("/masuk"), "Buat thread: tamu diarahkan ke halaman masuk");
  const nf = await rina.html("/forum/baru?kategori=tanya-jawab");
  const catId = nf.text.match(/<option value="([0-9a-f-]{36})"[^>]*>🙋/)?.[1];
  ok(nf.text.includes('data-form="new-thread"') && Boolean(catId), "Buat thread: form tampil dengan kategori terpilih");
  const newThread = (fields) => rina.submitForm("/forum/baru", nf.text, 'data-form="new-thread"', { categoryId: catId, ...fields });
  const fast = await newThread({ title: "Judul yang cukup panjang sekali", body: "Isi thread yang cukup panjang untuk lolos." });
  ok(clean(await fast.text()).includes("terlalu cepat"), "Buat thread: kiriman instan (bot) ditolak");
  await sleep(3200);
  ok(clean(await (await newThread({ title: "Halo", body: "Isi thread yang cukup panjang untuk lolos validasi." })).text()).includes("Judul minimal 8"), "Buat thread: judul terlalu pendek ditolak");
  ok(clean(await (await newThread({ title: "Info slot gacor maxwin hari ini", body: "Daftar sekarang bonus new member 100%, wd lancar." })).text()).includes("judi online"), "Buat thread: promosi judol diblokir");
  const title = `Uji smoke ${Date.now().toString(36)}: printer struk 58 mm`;
  const created = await newThread({
    title,
    body: "Halo @nusantaralabs, ini uji otomatis.\n\n<script>alert('xss')</script>\n\n[klik saya](javascript:alert(1)) dan **tebal**.\n\n```js\nconsole.log('kode')\n```",
  });
  const threadUrl = created.headers.get("location") ?? "";
  const threadId = threadUrl.split("/").pop();
  ok(created.status === 303 && /^\/forum\/t\/[0-9a-f-]{36}$/.test(threadUrl), "Buat thread: tersimpan & diarahkan ke halaman thread");
  const th = await guest.html(threadUrl);
  ok(th.text.includes(title) && !th.text.includes("<script>alert") && !th.text.includes('href="javascript:') && th.text.includes("<strong>tebal</strong>") && th.text.includes('href="/@nusantaralabs"'), "Thread: HTML & link javascript: tidak dirender, Markdown & mention jalan");
  ok((await notifs(sel)).some((n) => n.type === "forum_mention" && n.title.includes(title.slice(0, 20))), "Notifikasi: user yang di-mention dapat notifikasi");
  ok(clean(await (await newThread({ title, body: "Isi lain yang cukup panjang ya teman-teman." })).text()).includes("judul yang sama"), "Buat thread: judul kembar di hari yang sama ditolak");

  // Balasan + notifikasi
  const before = await unread(rina);
  const tp = await sel.html(threadUrl);
  const rep = await sel.submitForm(threadUrl, tp.text, 'data-form="reply"', { body: "Coba pairing ulang printernya ya, @rina." });
  const repLoc = rep.headers.get("location") ?? "";
  const replyId = repLoc.match(/balasan=([0-9a-f-]{36})/)?.[1];
  ok(rep.status === 303 && Boolean(replyId) && repLoc.includes(`#b-${replyId}`), "Balas: tersimpan & diarahkan ke balasannya");
  ok((await unread(rina)) === before + 1, "Notifikasi: penulis thread dapat 1 notifikasi (balasan + mention tidak dobel)");
  ok(clean(await (await sel.submitForm(threadUrl, tp.text, 'data-form="reply"', { body: "Balasan kedua yang terlalu cepat." })).text()).includes("Pelan-pelan"), "Balas: jeda anti-spam antar balasan");
  const n1 = (await notifs(rina)).find((n) => n.type === "forum_reply" && !n.read);
  const opened = await rina.req(n1?.href ?? "/x");
  ok(opened.status === 303 && (opened.headers.get("location") ?? "").includes(`balasan=${replyId}`) && (await unread(rina)) === before, "Notifikasi: diklik → ditandai dibaca & diarahkan ke balasan");
  ok((await rina.html(repLoc.split("#")[0])).text.includes(`id="b-${replyId}"`), "Thread: link ?balasan= membuka halaman berisi balasan itu");

  // Upvote
  const voteMarker = `name="targetId" value="${threadId}"`;
  const mp = await maya.html(threadUrl);
  await maya.submitForm(threadUrl, mp.text, voteMarker, {});
  ok((await maya.html(threadUrl)).text.includes('aria-label="Batalkan upvote (1)"'), "Upvote: skor thread naik & tombol aktif");
  await maya.submitForm(threadUrl, (await maya.html(threadUrl)).text, voteMarker, {});
  ok((await maya.html(threadUrl)).text.includes('aria-label="Upvote (0)"'), "Upvote: klik lagi = batal");
  await rina.submitForm(threadUrl, mp.text, voteMarker, {});
  ok((await guest.html(threadUrl)).text.includes("Upvote (0) — masuk dulu"), "Upvote: postingan sendiri tidak bisa di-upvote (walau dikirim paksa)");

  // Jawaban terbaik
  const rinaPage = await rina.html(threadUrl);
  ok(rinaPage.text.includes("Tandai jawaban terbaik"), "Jawaban terbaik: tombol tampil untuk penanya");
  await maya.submitForm(threadUrl, rinaPage.text, `name="replyId" value="${replyId}"`, {});
  ok(!(await guest.html(threadUrl)).text.includes("Terjawab"), "Jawaban terbaik: selain penanya tidak bisa menandai");
  await rina.submitForm(threadUrl, rinaPage.text, `name="replyId" value="${replyId}"`, {});
  const accepted = await guest.html(threadUrl);
  ok(accepted.text.includes("Terjawab") && accepted.text.includes("Jawaban terbaik — dari Nusantara Labs"), "Jawaban terbaik: ditandai penanya → tampil di atas");
  ok((await notifs(sel)).some((n) => n.type === "forum_accepted"), "Notifikasi: penjawab dapat notifikasi jawaban terbaik");

  // Ubah & hapus balasan
  const edit = await sel.html(`/forum/balasan/${replyId}/ubah`);
  const edited = await sel.submitForm(`/forum/balasan/${replyId}/ubah`, edit.text, 'data-form="edit-reply"', { body: "Coba pairing ulang printernya, lalu pilih PC437 ya @rina." });
  ok(edited.status === 303 && (await guest.html(threadUrl)).text.includes("pilih PC437"), "Ubah balasan: isi baru tersimpan");
  ok((await maya.req(`/forum/balasan/${replyId}/ubah`)).status === 404, "Ubah balasan: orang lain dapat 404");
  const mrep = await maya.submitForm(threadUrl, (await maya.html(threadUrl)).text, 'data-form="reply"', { body: "Saya juga pakai printer yang sama, lancar kok." });
  const mid = (mrep.headers.get("location") ?? "").match(/balasan=([0-9a-f-]{36})/)?.[1];
  await maya.submitForm(threadUrl, (await maya.html(threadUrl)).text, `name="replyId" value="${mid}"`, {});
  const afterDel = await guest.html(threadUrl);
  ok(Boolean(mid) && afterDel.text.includes("Balasan ini dihapus penulisnya") && !afterDel.text.includes("printer yang sama"), "Hapus balasan: diganti keterangan, isinya hilang dari publik");

  // Kutip balasan
  const qp = await sel.html(`${threadUrl}?kutip=${replyId}`);
  ok(qp.text.includes("Mengutip") && qp.text.includes(`name="parentId" value="${replyId}"`), "Kutip: composer menampilkan pratinjau + parentId");
  const qbad = await rina.submitForm(threadUrl, (await rina.html(threadUrl)).text, 'data-form="reply"', { body: "Kutipan palsu yang cukup panjang isinya.", parentId: "00000000-0000-0000-0000-000000000000" });
  ok(clean(await qbad.text()).includes("dikutip tidak ditemukan"), "Kutip: parentId asal ditolak");
  const qrep = await rina.submitForm(threadUrl, (await rina.html(threadUrl)).text, 'data-form="reply"', { body: "Setuju, pairing ulang biasanya manjur.", parentId: replyId });
  const qid = (qrep.headers.get("location") ?? "").match(/balasan=([0-9a-f-]{36})/)?.[1];
  ok(qrep.status === 303 && Boolean(qid), "Kutip: balasan dengan kutipan tersimpan");
  ok((await guest.html(threadUrl)).text.includes(`?balasan=${replyId}#b-${replyId}`), "Kutip: kutipan tampil dengan link ke balasan induk");

  // Bel realtime: Rina membuka SSE, Oki membalas → Rina menerima event notif
  const nac = new AbortController();
  const nstream = await rina.req("/api/notifications/stream", { signal: nac.signal, headers: { accept: "text/event-stream" } });
  ok(nstream.status === 200 && (nstream.headers.get("content-type") ?? "").startsWith("text/event-stream"), "Stream notifikasi (SSE) tersambung");
  const nreader = nstream.body.getReader();
  const ndec = new TextDecoder();
  let nbuf = "";
  const waitNotif = async (needle, ms = 8000) => {
    const deadline = Date.now() + ms;
    while (!nbuf.includes(needle) && Date.now() < deadline) {
      const r = await Promise.race([nreader.read(), new Promise((res) => setTimeout(() => res({ timeout: true }), deadline - Date.now()))]);
      if (r.done || r.timeout) break;
      nbuf += ndec.decode(r.value, { stream: true });
    }
    return nbuf.includes(needle);
  };
  ok(await waitNotif("event: ready"), "SSE notifikasi mengirim event ready");
  await oki.submitForm(threadUrl, (await oki.html(threadUrl)).text, 'data-form="reply"', { body: "Ikut nimbrung soal printer struk." });
  ok(await waitNotif("event: notif"), "Notifikasi balasan diterima realtime lewat SSE");
  nac.abort();
  ok((await guest.req("/api/notifications/stream")).status === 401, "Stream notifikasi wajib login");

  // Thread terkunci
  const lockedHref = home.text.match(/href="(\/forum\/t\/[0-9a-f-]{36})"[^>]*>Mulai 30 September 2026/)?.[1];
  const lockedPage = await rina.html(lockedHref);
  ok(lockedPage.text.includes("dikunci moderator") && !lockedPage.text.includes('data-form="reply"'), "Thread terkunci: form balasan tidak tampil");
  const forced = await rina.submitForm(threadUrl, rinaPage.text, 'data-form="reply"', { threadId: lockedHref.split("/").pop(), body: "Mencoba membalas thread terkunci." }, { override: true });
  ok(clean(await forced.text()).includes("Thread dikunci"), "Thread terkunci: balasan paksa ditolak server");

  // Moderator menyembunyikan & memulihkan balasan
  const modHide = `name="replyId" value="${replyId}"/><input type="hidden" name="action" value="hide"`;
  await mod3.submitForm(threadUrl, (await mod3.html(threadUrl)).text, modHide, { reason: "Uji moderasi" });
  const pubHidden = await guest.html(threadUrl);
  ok(pubHidden.text.includes("Balasan ini disembunyikan moderator") && !pubHidden.text.includes("pilih PC437"), "Moderator: menyembunyikan balasan (publik melihat keterangan)");
  await mod3.submitForm(threadUrl, (await mod3.html(threadUrl)).text, `name="replyId" value="${replyId}"/><input type="hidden" name="action" value="restore"`, {});
  ok((await guest.html(threadUrl)).text.includes("pilih PC437"), "Moderator: memulihkan balasan");

  // Laporan: tidak bisa lapor diri sendiri, 3 pelapor → disembunyikan otomatis → dipulihkan admin
  const selfRep = await sel.submitForm(threadUrl, (await sel.html(threadUrl)).text, 'value="forum_thread"/><input type="hidden" name="targetId"', { targetType: "forum_reply", targetId: replyId, reason: "spam" }, { override: true });
  ok(clean(await selfRep.text()).includes("Tidak bisa melaporkan postingan sendiri"), "Lapor: tidak bisa melaporkan postingan sendiri");
  const repMarker = `value="forum_reply"/><input type="hidden" name="targetId" value="${replyId}"`;
  let lastReport = "";
  for (const s of [maya, oki, rizky]) {
    lastReport = clean(await (await s.submitForm(threadUrl, (await s.html(threadUrl)).text, repMarker, { reason: "spam" })).text());
  }
  ok(lastReport.includes("disembunyikan sementara") && (await guest.html(threadUrl)).text.includes("sedang ditinjau moderator"), "Lapor: 3 pelapor berbeda → balasan disembunyikan otomatis");
  const queue = await adm3.html("/admin/laporan/konten");
  ok(queue.text.includes("Laporan konten") && queue.text.includes("pilih PC437"), "Moderasi: laporan muncul di antrean forum & ulasan");
  await adm3.submitForm("/admin/laporan/konten", queue.text, "Pulihkan &amp; tolak laporan", {});
  ok((await guest.html(threadUrl)).text.includes("pilih PC437"), "Moderasi: pulihkan & tolak laporan → balasan tampil lagi");

  // Ulasan
  const kp = await guest.html("/p/kasirku-offline");
  ok(kp.text.includes("Masuk untuk mengulas") && kp.text.includes("4,4") && kp.text.includes("(7 ulasan)"), "Ulasan: ringkasan rating & ajakan masuk untuk tamu");
  ok((await sel.html("/p/kasirku-offline")).text.includes("Ini karyamu"), "Ulasan: seller tidak bisa mengulas karyanya sendiri");
  const KANCIL = "/p/petualangan-si-kancil";
  const kc = await rina.html(KANCIL);
  ok(kc.text.includes('data-form="review"') && kc.text.includes("(6 ulasan)"), "Ulasan: pemilik yang belum mengulas melihat form");
  const review = (html, fields, opts) => rina.submitForm(KANCIL, html, 'data-form="review"', fields, opts);
  ok(clean(await (await review(kc.text, { rating: "2", body: "" })).text()).includes("wajib disertai alasan"), "Ulasan: 1–2 bintang wajib ada alasan");
  ok(clean(await (await review(kc.text, { rating: "4", body: "Seru! Lihat juga www.contoh-game.xyz ya" })).text()).includes("Link tidak diizinkan"), "Ulasan: link ditolak (anti-spam)");
  await review(kc.text, { rating: "4", body: "Seru dan edukatif, anak saya suka level hutan bakau." });
  const kAfter = await guest.html(KANCIL);
  ok(kAfter.text.includes("anak saya suka level hutan bakau") && kAfter.text.includes("(7 ulasan)") && kAfter.text.includes("Pemilik</span>"), "Ulasan: tayang dengan badge Pemilik & rating dihitung ulang");
  ok((await notifs(pixel)).some((n) => n.type === "review_new" && n.title.includes("Petualangan Si Kancil")), "Notifikasi: seller dapat notifikasi ulasan baru");
  const kc2 = await rina.html(KANCIL);
  ok(clean(await (await review(kc2.text, { rating: "5", body: "Seru dan edukatif, anak saya suka level hutan bakau. Bug level 8 sudah beres!" })).text()).includes("Ulasan diperbarui"), "Ulasan: bisa diubah pemiliknya");
  const proId = (await rina.html("/beli/kasirku-pro")).text.match(/name="productId" value="([0-9a-f-]{36})"/)?.[1];
  ok((await rina.html("/p/kasirku-pro")).text.includes("Hanya pemilik yang bisa memberi ulasan"), "Ulasan: bukan pemilik tidak melihat form");
  const forcedReview = await review(kc2.text, { productId: proId, rating: "5", body: "Ulasan palsu dari bukan pembeli" }, { override: true });
  ok(Boolean(proId) && clean(await forcedReview.text()).includes("Hanya yang sudah mengunduh / membeli"), "Ulasan: kiriman paksa dari bukan pemilik ditolak server");
  const pk = await pixel.html(`${KANCIL}/ulasan`);
  const rid = [...pk.text.slice(0, pk.text.indexOf("Bug level 8 sudah beres")).matchAll(/id="ulasan-([0-9a-f-]{36})"/g)].pop()?.[1];
  const sr = await pixel.submitForm(`${KANCIL}/ulasan`, pk.text, `name="reviewId" value="${rid}"`, { reply: "Terima kasih Mbak Rina! Level baru segera hadir." });
  ok(clean(await sr.text()).includes("Balasan tersimpan") && (await guest.html(`${KANCIL}/ulasan`)).text.includes("Level baru segera hadir"), "Ulasan: seller membalas ulasan");
  ok((await notifs(rina)).some((n) => n.type === "review_reply" && n.title.includes("Petualangan Si Kancil")), "Notifikasi: pengulas dapat notifikasi balasan seller");
  for (const s of [maya, oki, rizky]) {
    await s.submitForm(`${KANCIL}/ulasan`, (await s.html(`${KANCIL}/ulasan`)).text, `value="review"/><input type="hidden" name="targetId" value="${rid}"`, { reason: "palsu" });
  }
  ok((await guest.html(KANCIL)).text.includes("(6 ulasan)"), "Ulasan dilaporkan 3 orang: disembunyikan & rating dihitung ulang (trigger)");
  await mod3.submitForm(`${KANCIL}/ulasan`, (await mod3.html(`${KANCIL}/ulasan`)).text, `name="reviewId" value="${rid}"/><input type="hidden" name="action" value="restore"`, {});
  ok((await guest.html(KANCIL)).text.includes("(7 ulasan)"), "Moderator: pulihkan ulasan → rating kembali");
  await rina.submitForm(KANCIL, (await rina.html(KANCIL)).text, "Hapus ulasan", {});
  ok((await guest.html(KANCIL)).text.includes("(6 ulasan)"), "Ulasan: dihapus pemiliknya → rating dihitung ulang");
  ok((await guest.html("/jelajahi?sort=rating")).text.includes("Rating tertinggi"), "Jelajahi: urutan rating tertinggi tersedia");

  // Notifikasi: keamanan, halaman, preferensi, berhenti berlangganan
  ok((await guest.api("/api/notifications")).status === 401, "API notifikasi: tanpa login → 401");
  const csrf = await rina.req("/api/notifications/read", { method: "POST", headers: { "content-type": "application/json", origin: "https://situs-jahat.example" }, body: JSON.stringify({ all: true }) });
  ok(csrf.status === 403, "API notifikasi: tandai dibaca dari origin asing ditolak (CSRF)");
  const selN = (await notifs(sel)).find((n) => !n.read);
  const foreign = await rina.req(selN?.href ?? "/notifikasi/buka/1");
  ok(foreign.status === 303 && foreign.headers.get("location") === "/notifikasi" && (await notifs(sel)).find((n) => n.id === selN?.id)?.read === false, "Notifikasi milik orang lain tidak bisa dibuka / ditandai");
  ok((await rina.html("/")).text.includes('aria-label="Notifikasi'), "Header: lonceng notifikasi tampil untuk anggota");
  const np = await rina.html("/notifikasi");
  ok(np.res.status === 200 && np.text.includes("data-notification"), "Halaman notifikasi menampilkan daftar");
  await rina.submitForm("/notifikasi", np.text, "Tandai semua dibaca", {});
  ok((await unread(rina)) === 0, "Tandai semua dibaca → 0 belum dibaca");
  const pref = await rina.html("/akun/notifikasi");
  const savedPref = await rina.submitForm("/akun/notifikasi", pref.text, 'data-form="notif-prefs"', { email_transaksi: "on", email_karya: "on" });
  const pref2 = (await rina.html("/akun/notifikasi")).text;
  ok(clean(await savedPref.text()).includes("Pengaturan notifikasi tersimpan") && /name="email_transaksi"[^>]*checked/.test(pref2) && !/name="email_komunitas"[^>]*checked/.test(pref2), "Preferensi email notifikasi tersimpan");

  const savedPush = await rina.submitForm("/akun/notifikasi", pref2, 'data-form="push-prefs"', { push_transaksi: "on", push_karya: "on" });
  const pref3 = (await rina.html("/akun/notifikasi")).text;
  ok(clean(await savedPush.text()).includes("Pengaturan push tersimpan") && /name="push_transaksi"[^>]*checked/.test(pref3) && !/name="push_komunitas"[^>]*checked/.test(pref3), "Preferensi push notifikasi tersimpan");
  const man = await fetch(`${BASE}/manifest.webmanifest`, { headers: authHeaders() });
  ok(man.status === 200 && (await man.text()).includes("Rilisin"), "Manifest PWA tersaji");
  const psw = await fetch(`${BASE}/OneSignalSDKWorker.js`, { headers: authHeaders() });
  ok(psw.status === 200 && (await psw.text()).includes("OneSignalSDK"), "Service worker OneSignal tersaji");
  const testPush = await rina.submitForm("/akun/notifikasi", pref3, 'data-form="test-push"', {});
  ok(clean(await testPush.text()).includes("Push belum diaktifkan di server ini"), "Push uji tanpa kunci: pesan jelas (tidak crash)");
  const prof = await rina.html("/akun/profil");
  ok(prof.res.status === 200 && prof.text.includes('data-form="profil"'), "Halaman edit profil tampil");
  const savedProf = await rina.submitForm("/akun/profil", prof.text, 'data-form="profil"', { displayName: "Rina Tester", bio: "Bio uji otomatis" });
  ok(clean(await savedProf.text()).includes("Profil tersimpan"), "Edit profil (nama + bio) tersimpan");
  const prof2 = (await rina.html("/akun/profil")).text;
  ok(prof2.includes("Rina Tester") && prof2.includes("Bio uji otomatis"), "Perubahan profil tampil kembali");
  const avPng = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#5b43f5" } }).png().toBuffer();
  const av = await rina.req("/api/avatar", { method: "POST", headers: { "content-type": "image/png" }, body: avPng });
  ok(av.status === 201 && (await av.json()).url?.endsWith(".webp"), "Upload avatar → 201 webp");
  const avBad = await rina.req("/api/avatar", { method: "POST", headers: { "content-type": "image/png" }, body: Buffer.from("bukan-gambar") });
  ok(avBad.status === 415, "Avatar bukan gambar ditolak (cek magic bytes)");
  const avGuest = await guest.req("/api/avatar", { method: "POST", headers: { "content-type": "image/png" }, body: avPng });
  ok(avGuest.status === 401, "Upload avatar wajib login");
  const covPng = await sharp({ create: { width: 1600, height: 400, channels: 3, background: "#0ea5e9" } }).png().toBuffer();
  const cov = await rina.req("/api/cover", { method: "POST", headers: { "content-type": "image/png" }, body: covPng });
  ok(cov.status === 201 && (await cov.json()).url?.endsWith(".webp"), "Upload sampul → 201 webp");
  const covBad = await rina.req("/api/cover", { method: "POST", headers: { "content-type": "image/png" }, body: Buffer.from("bukan-gambar") });
  ok(covBad.status === 415, "Sampul bukan gambar ditolak");
  const covGuest = await guest.req("/api/cover", { method: "POST", headers: { "content-type": "image/png" }, body: covPng });
  ok(covGuest.status === 401, "Upload sampul wajib login");
  const savedLoc = await rina.submitForm("/akun/profil", (await rina.html("/akun/profil")).text, 'data-form="profil"', { displayName: "Rina Tester", bio: "Bio uji otomatis", location: "Yogyakarta", websiteUrl: "https://rina.example" });
  ok(clean(await savedLoc.text()).includes("Profil tersimpan"), "Edit profil (lokasi + website) tersimpan");
  const rinaPub = await guest.html("/@rina");
  ok(rinaPub.text.includes("Yogyakarta") && rinaPub.text.includes("rina.example"), "Lokasi + website tampil di profil publik");
  const badSite = await rina.submitForm("/akun/profil", (await rina.html("/akun/profil")).text, 'data-form="profil"', { displayName: "Rina Tester", bio: "", location: "", websiteUrl: "bukan-url" });
  ok(clean(await badSite.text()).includes("URL harus diawali"), "Website tanpa http(s) ditolak");
  const delCov = await rina.req("/api/cover", { method: "DELETE" });
  ok(delCov.status === 200, "Hapus sampul");
  const delAv = await rina.req("/api/avatar", { method: "DELETE" });
  ok(delAv.status === 200, "Hapus avatar");
  const prof3 = (await rina.html("/akun/profil")).text;
  await rina.submitForm("/akun/profil", prof3, 'data-form="profil"', { displayName: "Rina Pratiwi", bio: "", location: "", websiteUrl: "" });
  await rina.submitForm("/akun/notifikasi", pref2, 'data-form="notif-prefs"', { email_transaksi: "on", email_karya: "on", email_komunitas: "on" });
  const badUnsub = await guest.req("/api/notifications/unsubscribe?t=palsu", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
  ok(badUnsub.status === 400 && (await guest.html("/notifikasi/berhenti?t=palsu")).text.includes("Link tidak valid"), "Berhenti berlangganan: token palsu ditolak");

  // Lupa password
  ok((await guest.html("/masuk")).text.includes('href="/lupa-password"'), "Masuk: ada link Lupa password");
  ok((await guest.html("/masuk")).text.includes("Tampilkan password"), "Masuk: ada tombol intip password");
  const askReset = async (email) => {
    const s = new Session();
    const page = await s.html("/lupa-password");
    await sleep(1600);
    return clean(await (await s.submitForm("/lupa-password", page.text, 'data-form="forgot-password"', { email })).text());
  };
  const [r1, r2] = await Promise.all([askReset("user@rilisin.test"), askReset("tidak-terdaftar-xyz@contoh.test")]);
  ok(r1.includes("Kalau user@rilisin.test terdaftar") && r2.includes("Kalau tidak-terdaftar-xyz@contoh.test terdaftar"), "Lupa password: jawaban sama untuk email terdaftar & tidak (anti enumerasi)");
  const badTok = await guest.req(`/atur-ulang-password/buka?token=${"x".repeat(43)}`);
  ok(badTok.status === 303 && (badTok.headers.get("location") ?? "").includes("/lupa-password?kedaluwarsa=1"), "Reset password: token palsu ditolak");
  ok((await guest.html("/atur-ulang-password")).text.includes("Link tidak berlaku"), "Reset password: tanpa token tidak bisa ganti password");
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && ["localhost", "127.0.0.1", "postgres"].includes(new URL(dbUrl).hostname)) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
    try {
      const token = randomBytes(32).toString("base64url");
      const [u] = await sql`select id from users where email = 'kartika34@contoh.test'`;
      await sql`insert into password_resets (id, user_id, expires_at) values (${createHash("sha256").update(token).digest("hex")}, ${u.id}, now() + interval '30 minutes')`;
      const victim = await as("kartika34@contoh.test");
      const opener = new Session();
      const open = await opener.req(`/atur-ulang-password/buka?token=${token}`);
      ok(open.status === 303 && open.headers.get("location") === "/atur-ulang-password" && [...opener.cookies.keys()].some((k) => k.includes("rilisin_reset")), "Reset password: link email → token pindah ke cookie, URL bersih");
      const rf = await opener.html("/atur-ulang-password");
      ok(rf.text.includes("@kartika34") && rf.text.includes('data-form="reset-password"'), "Reset password: form password baru tampil");
      ok(clean(await (await opener.submitForm("/atur-ulang-password", rf.text, 'data-form="reset-password"', { password: "password123", confirm: "password123" })).text()).includes("terlalu umum"), "Reset password: password lemah ditolak");
      const newPw = `Baru-${Date.now().toString(36)}-aman!`;
      const done = await opener.submitForm("/atur-ulang-password", rf.text, 'data-form="reset-password"', { password: newPw, confirm: newPw });
      ok(done.status === 303 && (done.headers.get("location") ?? "").includes("/masuk?reset=1"), "Reset password: password baru tersimpan");
      ok((await victim.req("/library")).status === 307, "Reset password: semua sesi lama dikeluarkan");
      const fresh = new Session();
      await fresh.login("kartika34@contoh.test", newPw);
      ok(fresh.hasSession(), "Reset password: bisa masuk dengan password baru");
      ok(((await new Session().req(`/atur-ulang-password/buka?token=${token}`)).headers.get("location") ?? "").includes("kedaluwarsa"), "Reset password: link hanya sekali pakai");
    } finally {
      await sql.end();
    }
  } else {
    console.log("  (uji reset password penuh dilewati — butuh akses database lokal)");
  }
}

// ─── 9. Fase 3b: ikuti, devlog, lapor produk & akun, profil anggota, chat layar penuh ─
{
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const as = async (email) => {
    const s = new Session();
    await s.login(email);
    return s;
  };
  const [rina, sel, maya, adm] = await Promise.all([as("user@rilisin.test"), as("seller@rilisin.test"), as("maya23@contoh.test"), as("admin@rilisin.test")]);
  const notifs = async (s) => (await s.api("/api/notifications?limit=30")).data.items ?? [];
  const countOf = (html) => Number(html.match(/([\d.]+) pengikut<\/span>/)?.[1]?.replace(/\./g, "") ?? -1);

  ok((await guest.html("/komunitas")).text.includes('class="chat-shell'), "Chat komunitas: tata letak layar penuh (tanpa kartu)");

  // Profil anggota & seller
  const pr = await guest.html("/@rina");
  ok(pr.res.status === 200 && pr.text.includes("Rina Pratiwi") && pr.text.includes("postingan forum") && pr.text.includes("Ulasan yang ditulis") && pr.text.includes("KasirKu Offline"), "Profil anggota: statistik forum & ulasan yang ditulis");
  const ps = await guest.html("/@nusantaralabs");
  ok(ps.text.includes("Karya dari Nusantara Labs") && ps.text.includes(" pengikut</span>") && ps.text.includes(`/masuk?next=${encodeURIComponent("/@nusantaralabs")}`), "Profil seller: karya & jumlah pengikut, tamu diajak masuk untuk mengikuti");
  ok((await guest.req("/@akun-yang-tidak-ada-xyz")).status === 404, "Profil yang tidak ada → 404");
  ok(!(await sel.html("/@nusantaralabs")).text.includes('data-follow="seller"'), "Profil: tidak bisa mengikuti diri sendiri");

  // Ikuti seller → notifikasi pengikut baru
  const mp = await maya.html("/@nusantaralabs");
  const before = countOf(mp.text);
  await maya.submitForm("/u/nusantaralabs", mp.text, 'data-follow="seller"', {});
  const mp2 = await maya.html("/@nusantaralabs");
  ok(mp2.text.includes("Mengikuti") && countOf(mp2.text) === before + 1, "Ikuti seller: tombol berubah & jumlah pengikut naik");
  ok((await notifs(sel)).some((n) => n.type === "new_follower" && n.actor?.username === "maya23"), "Notifikasi: seller dapat kabar pengikut baru");
  await maya.submitForm("/u/nusantaralabs", mp2.text, 'data-follow="seller"', {});
  ok(countOf((await maya.html("/@nusantaralabs")).text) === before, "Berhenti mengikuti seller: jumlah kembali");

  // Ikuti update produk (toggle dua arah)
  const kp = await maya.html("/p/kasirku-offline");
  const kasirkuId = kp.text.match(/data-follow="product"[\s\S]*?name="targetId" value="([0-9a-f-]{36})"/)?.[1];
  const was = kp.text.includes("Mengikuti update");
  const c0 = countOf(kp.text);
  await maya.submitForm("/p/kasirku-offline", kp.text, 'data-follow="product"', {});
  const kp2 = await maya.html("/p/kasirku-offline");
  ok(Boolean(kasirkuId) && kp2.text.includes(was ? "Ikuti update" : "Mengikuti update") && countOf(kp2.text) === c0 + (was ? -1 : 1), "Ikuti update produk: bisa diikuti / dihentikan");
  if (!kp2.text.includes("Mengikuti update")) await maya.submitForm("/p/kasirku-offline", kp2.text, 'data-follow="product"', {});

  // Karya baru (disetujui di bagian 4) & versi baru → pengikut dapat notifikasi
  ok((await notifs(rina)).some((n) => n.type === "product_new" && n.title.includes("Aplikasi Uji Smoke Test")), "Karya baru tayang → pengikut seller dapat notifikasi");
  const rv = await adm.html(`/admin/review/${kasirkuId}`);
  const appr = await adm.submitForm(`/admin/review/${kasirkuId}`, rv.text, "Setujui rilis v2.1.0");
  ok(appr.status === 303, "Admin menyetujui rilis KasirKu Offline v2.1.0");
  const upd = (list) => list.some((n) => n.type === "product_update" && n.title.includes("v2.1.0"));
  ok(upd(await notifs(maya)) && upd(await notifs(rina)), "Versi baru → semua pengikut dapat notifikasi (termasuk pemilik yang otomatis mengikuti)");

  // Devlog seller → tampil di halaman produk & pengikut dapat kabar
  const df = await sel.html("/forum/baru?kategori=devlog&produk=kasirku-offline");
  const devCat = df.text.match(/<option value="([0-9a-f-]{36})" selected="">/)?.[1];
  await sleep(3200);
  const devTitle = `Devlog uji ${Date.now().toString(36)}: rencana v2.2`;
  const dv = await sel.submitForm("/forum/baru", df.text, 'data-form="new-thread"', { categoryId: devCat, title: devTitle, body: "Catatan pengembangan KasirKu untuk pengikut: v2.2 fokus ke laporan pajak sederhana." });
  ok(dv.status === 303 && Boolean(devCat), "Seller menulis devlog untuk produknya");
  const kpage = await guest.html("/p/kasirku-offline");
  ok(kpage.text.includes('id="devlog"') && kpage.text.includes(devTitle) && !(kpage.text.split('id="diskusi"')[1] ?? "").split("<script")[0].includes(devTitle), "Devlog tampil di bagian Devlog (bukan Diskusi) halaman produk");
  ok((await notifs(rina)).some((n) => n.type === "product_devlog" && n.title.includes(devTitle.slice(0, 20))), "Devlog baru → pengikut produk dapat notifikasi");

  // Lapor produk & akun
  // Form lapor punya data-target (form "Ikuti update" juga memuat input targetType=product + targetId)
  const PROD = 'data-form="report" data-target="product"';
  const ik = await maya.html("/p/ikon-kuliner-nusantara");
  const ikId = ik.text.match(/value="product"\/><input type="hidden" name="targetId" value="([0-9a-f-]{36})"/)?.[1];
  ok(clean(await (await maya.submitForm("/p/ikon-kuliner-nusantara", ik.text, PROD, { reason: "palsu" })).text()).includes("Alasan laporan tidak cocok"), "Lapor produk: alasan yang tidak relevan ditolak server");
  ok(clean(await (await maya.submitForm("/p/ikon-kuliner-nusantara", ik.text, PROD, { reason: "bajakan", note: "Mirip paket ikon berbayar" })).text()).includes("laporan terkirim"), "Lapor produk: laporan terkirim");
  const kcS = await sel.html("/p/petualangan-si-kancil");
  ok(clean(await (await sel.submitForm("/p/petualangan-si-kancil", kcS.text, PROD, { targetId: kasirkuId, reason: "spam" }, { override: true })).text()).includes("Tidak bisa melaporkan karya sendiri"), "Lapor produk: seller tidak bisa melaporkan karyanya sendiri");
  const ag = await maya.html("/@agus18");
  const agusId = ag.text.match(/value="user"\/><input type="hidden" name="targetId" value="([0-9a-f-]{36})"/)?.[1];
  ok(clean(await (await maya.submitForm("/u/agus18", ag.text, 'data-form="report" data-target="user"', { reason: "spam" })).text()).includes("laporan terkirim"), "Lapor akun: laporan terkirim");
  const q = await adm.html("/admin/laporan/konten");
  ok(q.text.includes("Tangguhkan produk") && q.text.includes("Ikon Kuliner Nusantara") && q.text.includes("@agus18"), "Moderasi: laporan produk & akun masuk antrean");
  await adm.submitForm("/admin/laporan/konten", q.text, `name="targetId" value="${ikId}"/><label`, { reason: "Uji smoke: dugaan bajakan" });
  ok((await guest.req("/p/ikon-kuliner-nusantara")).status === 404, "Moderasi: produk yang dilaporkan bisa ditangguhkan (hilang dari publik)");
  await adm.submitForm("/admin/laporan/konten", (await adm.html("/admin/laporan/konten")).text, `name="targetId" value="${agusId}"/><button`, {});
  ok(Boolean(agusId) && !(await adm.html("/admin/laporan/konten")).text.includes(`value="${agusId}"`), "Moderasi: laporan akun bisa ditolak");

  // Halaman Diikuti + otomatis mengikuti saat unduh pertama
  const dk = await rina.html("/akun/diikuti");
  ok(dk.text.includes("Nusantara Labs") && dk.text.includes("KasirKu Offline"), "Halaman Diikuti: seller & karya yang diikuti");
  const sk = await rina.html("/p/starter-kit-next-js-bahasa-indonesia");
  const skFile = sk.text.match(/action="\/api\/download\/([0-9a-f-]{36})"/)?.[1];
  const skId = sk.text.match(/data-follow="product"[\s\S]*?name="targetId" value="([0-9a-f-]{36})"/)?.[1];
  const dl = await rina.req(`/api/download/${skFile}`, { method: "POST" });
  const dk2 = await rina.html("/akun/diikuti");
  ok(dl.status === 303 && dk2.text.includes("Starter Kit Next.js Bahasa Indonesia"), "Unduh pertama kali → otomatis mengikuti update karya");
  await rina.submitForm("/akun/diikuti", dk2.text, `name="targetId" value="${skId}"`, {});
  ok(Boolean(skId) && !(await rina.html("/akun/diikuti")).text.includes("Starter Kit Next.js Bahasa Indonesia"), "Halaman Diikuti: bisa berhenti mengikuti");
}

// ─── 10. Fase 4: Turnstile, rate limit bersama, tugas harian & backup, antivirus ─
{
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const as = async (email) => {
    const s = new Session();
    await s.login(email);
    return s;
  };
  const daftar = await guest.html("/daftar");
  const testKeys = daftar.text.includes(`data-turnstile="${TURNSTILE_TEST_SITEKEY}"`);
  if (testKeys) {
    const csp = daftar.res.headers.get("content-security-policy") ?? "";
    ok(csp.includes("frame-src https://challenges.cloudflare.com") && daftar.text.includes("challenges.cloudflare.com/turnstile/v0/api.js"), "Turnstile: script & iframe Cloudflare diizinkan CSP di halaman daftar");
    const bot = new Session();
    const page = await bot.html("/daftar");
    await sleep(1600);
    const noToken = await bot.submitForm("/daftar", page.text, 'name="displayName"', { displayName: "Bot Tanpa Token", username: `bot${Date.now().toString(36)}`, email: `bot${Date.now().toString(36)}@contoh.test`, password: "Kopi-Susu-Gula-Aren-99" }, { noTurnstile: true });
    ok(clean(await noToken.text()).includes("Selesaikan verifikasi keamanan"), "Turnstile: daftar tanpa token verifikasi ditolak");
    // Login adaptif: 3× salah dari satu jaringan → wajib verifikasi
    const tebak = new Session();
    for (let i = 0; i < 3; i++) await tebak.login("akun-yang-tidak-ada-xyz@contoh.test", `salah-${i}`);
    const lp = await tebak.html("/masuk");
    ok(lp.text.includes(`data-turnstile="${TURNSTILE_TEST_SITEKEY}"`), "Turnstile: setelah 3× gagal masuk, halaman masuk menampilkan verifikasi");
    const blocked = await tebak.submitForm("/masuk", lp.text, 'name="identifier"', { identifier: "akun-yang-tidak-ada-xyz@contoh.test", password: "salah-lagi", next: "/" }, { noTurnstile: true });
    ok(clean(await blocked.text()).includes("Selesaikan verifikasi keamanan"), "Turnstile: percobaan berikutnya tanpa verifikasi ditolak");
  } else {
    console.log("  (Turnstile memakai kunci asli / mode lunak — uji token dummy dilewati; sudah diuji di CI)");
  }

  // Rate limit bersama (database): 12× minta reset dari satu jaringan → pasti ada yang ditolak.
  // 12 (bukan 6): jendela fixed-window 15 menit bisa berganti tepat di tengah banjir, membagi hitungan ke dua
  // ember. 12 permintaan terbagi ke maksimal 2 ember → salah satunya pasti melewati batas 5 (pigeonhole),
  // jadi uji tidak lagi bergantung pada keberuntungan waktu.
  const flood = new Session();
  let ditolak = 0;
  for (let i = 0; i < 12; i++) {
    const page = await flood.html("/lupa-password");
    await sleep(1600);
    const teks = clean(await (await flood.submitForm("/lupa-password", page.text, 'data-form="forgot-password"', { email: `banjir${i}@contoh.test` })).text());
    if (teks.includes("Terlalu banyak permintaan")) ditolak++;
  }
  ok(ditolak > 0, `Rate limit bersama: permintaan reset dari jaringan yang sama ditolak (${ditolak}/12)`);

  // Tugas harian (cron) & halaman Sistem
  const cronRes = await guest.req("/api/cron/harian");
  ok(cronRes.status === 401 || cronRes.status === 503, "Cron harian: tanpa rahasia ditolak");
  const adm = await as("admin@rilisin.test");
  if (process.env.CRON_SECRET) {
    const run = await fetch(`${BASE}/api/cron/harian`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    const body = await run.json().catch(() => ({}));
    ok(run.status === 200 && body.cleaned?.ok === true && body.backup?.ok === true && body.backup?.details?.bytes > 0, `Cron harian: pembersihan + backup terenkripsi berhasil (${body.backup?.details?.rows ?? "?"} baris)`);
    const sys = await adm.html("/admin/sistem");
    const bakKey = sys.text.match(/\/admin\/sistem\/unduh\?key=([^"&]+)/)?.[1];
    ok(sys.res.status === 200 && sys.text.includes("Status pengaman") && Boolean(bakKey), "Halaman Sistem: status pengaman & daftar backup");
    const dl = await adm.req(`/admin/sistem/unduh?key=${bakKey}`);
    ok(dl.status === 200 || dl.status === 303, "Admin bisa mengunduh file backup terenkripsi");
  } else {
    console.log("  (CRON_SECRET tidak diberikan ke smoke test — uji cron dengan rahasia dilewati)");
  }
  const modS = await as("dimas24@contoh.test");
  ok((await modS.req("/admin/sistem")).status === 404, "Halaman Sistem khusus admin (moderator 404)");

  // Antivirus: protokol worker (smoke test berperan sebagai worker palsu)
  const noAuth = await fetch(`${BASE}/api/internal/scan/claim`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  ok(noAuth.status === 401 || noAuth.status === 503, "Antivirus: klaim antrean tanpa token worker ditolak");
  if (process.env.SCAN_WORKER_TOKEN) {
    const W = { authorization: `Bearer ${process.env.SCAN_WORKER_TOKEN}`, "content-type": "application/json" };
    const claim = await fetch(`${BASE}/api/internal/scan/claim`, { method: "POST", headers: W, body: JSON.stringify({ limit: 10, worker: "smoke", engine: "ClamAV 0.0.0-smoke/1" }) });
    const { files = [] } = await claim.json();
    ok(claim.status === 200 && files.length > 0 && files.every((f) => f.url && f.sha256), `Antivirus: worker mengklaim ${files.length} file + URL unduh bertanda tangan`);
    const target = files.find((f) => f.filename === "apk-premium-pack.apk");
    for (const f of files) {
      const r = await fetch(`${BASE}/api/internal/scan/result`, { method: "POST", headers: W, body: JSON.stringify({ fileId: f.fileId, status: f === target ? "infected" : "clean", engine: "ClamAV 0.0.0-smoke/1", signature: f === target ? "Uji.Smoke.Malware" : null }) });
      if (r.status !== 200) throw new Error(`hasil scan ditolak: ${r.status}`);
    }
    ok(Boolean(target), "Antivirus: hasil scan tiap file diterima");
    const again = await (await fetch(`${BASE}/api/internal/scan/claim`, { method: "POST", headers: W, body: JSON.stringify({ limit: 10, worker: "smoke", engine: "x" }) })).json();
    ok(!again.files.some((f) => files.some((g) => g.fileId === f.fileId)), "Antivirus: file yang sudah dipindai tidak diklaim ulang");
    const queue = await adm.html("/admin/review");
    const apkId = queue.text.match(/href="\/admin\/review\/([0-9a-f-]{36})"[^>]*>[\s\S]{0,400}?Kumpulan APK Premium Gratis/)?.[1] ?? queue.text.match(/Kumpulan APK Premium Gratis[\s\S]{0,600}?\/admin\/review\/([0-9a-f-]{36})/)?.[1];
    const det = apkId ? await adm.html(`/admin/review/${apkId}`) : { text: "" };
    ok(det.text.includes("MALWARE: Uji.Smoke.Malware"), "Antivirus: file terinfeksi ditandai MALWARE di halaman review moderator");
    const fid = target.fileId;
    ok((await adm.req(`/api/download/${fid}`, { method: "POST" })).status === 451, "Antivirus: file terinfeksi tidak bisa diunduh siapa pun (termasuk admin)");
    const rv = await adm.html(`/admin/review/${apkId}`);
    const approve = await adm.submitForm(`/admin/review/${apkId}`, rv.text, "Setujui &amp; tayangkan");
    ok(approve.status === 303 && (approve.headers.get("location") ?? "").includes("error=malware"), "Antivirus: produk berisi malware tidak bisa disetujui moderator");
  } else {
    console.log("  (SCAN_WORKER_TOKEN tidak diberikan ke smoke test — uji protokol worker dilewati)");
  }
}

console.log(`\nSemua ${passed} pengecekan lulus.`);
