#!/usr/bin/env node
/**
 * Smoke test end-to-end (tanpa browser): jalankan server dulu (npm run start), lalu
 *   node scripts/smoke-test.mjs [http://localhost:3000]
 * Menguji: halaman publik, login, download (signed URL), library, alur seller
 * (buat produk → upload gambar & file → kirim review), dan approve oleh admin.
 * PERHATIAN: menambah data ke database. Jalankan `npm run db:seed` untuk reset.
 */
import { createHash } from "node:crypto";
import sharp from "sharp";
import { strToU8, zipSync } from "fflate";

const BASE = process.argv[2] ?? "http://localhost:3000";
const ORIGIN = new URL(BASE).origin;
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

class Session {
  cookies = new Map();
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
    const headers = new Headers(init.headers);
    if (this.cookies.size) headers.set("cookie", this.cookieHeader());
    if (init.method && init.method !== "GET") headers.set("origin", ORIGIN);
    const res = await fetch(path.startsWith("http") ? path : BASE + path, { redirect: "manual", ...init, headers });
    this.store(res);
    return res;
  }
  async html(path) {
    const res = await this.req(path);
    return { res, text: clean(await res.text()) };
  }
  /** Kirim <form> server action seperti browser tanpa JS (progressive enhancement). */
  async submitForm(pagePath, html, marker, fields = {}) {
    const chunks = html.split("<form").slice(1).map((c) => c.split("</form>")[0]);
    const form = chunks.find((c) => c.includes(marker));
    if (!form) throw new Error(`Form dengan penanda "${marker}" tidak ditemukan di ${pagePath}`);
    const fd = new FormData();
    for (const tag of form.match(/<input[^>]*>/g) ?? []) {
      if (!/type="hidden"/.test(tag)) continue;
      const name = tag.match(/name="([^"]*)"/)?.[1];
      if (!name) continue;
      fd.append(decode(name), decode(tag.match(/value="([^"]*)"/)?.[1] ?? ""));
    }
    for (const [k, v] of Object.entries(fields)) {
      for (const item of Array.isArray(v) ? v : [v]) fd.append(k, item);
    }
    return this.req(pagePath, { method: "POST", body: fd });
  }
  async login(email) {
    const { text } = await this.html("/masuk");
    const res = await this.submitForm("/masuk", text, 'name="identifier"', { identifier: email, password: "rilisin123", next: "/" });
    return res;
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

// ─── 1. Halaman publik ──────────────────────────────────────────────────────
const guest = new Session();
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
  const traversal = await guest.req("/media/..%2F..%2F.env.local");
  ok(traversal.status === 404, "Path traversal di /media ditolak");
  const csrf = await fetch(`${BASE}/api/download/00000000-0000-0000-0000-000000000000`, { method: "POST", headers: { origin: "https://situs-jahat.example" }, redirect: "manual" });
  ok(csrf.status === 403, "POST dari origin asing ditolak (CSRF)");
}

// ─── 2. Login user & download ───────────────────────────────────────────────
const user = new Session();
{
  const bad = await (async () => {
    const s = new Session();
    const { text } = await s.html("/masuk");
    const r = await s.submitForm("/masuk", text, 'name="identifier"', { identifier: "user@rilisin.test", password: "salah-banget", next: "/" });
    return { status: r.status, body: clean(await r.text()), cookie: s.cookies.has("rilisin_session") };
  })();
  ok(!bad.cookie && bad.body.includes("password salah"), "Password salah ditolak");

  const res = await user.login("user@rilisin.test");
  ok(res.status === 303 && user.cookies.has("rilisin_session"), "Login user berhasil (cookie session diset)");

  const { text } = await user.html("/p/catat-duit");
  const fileId = text.match(/action="\/api\/download\/([0-9a-f-]{36})"/)?.[1];
  const shownHash = text.match(/<code class="mt-1 block break-all font-mono">([0-9a-f]{64})<\/code>/)?.[1];
  ok(Boolean(fileId), "Tombol download muncul untuk user yang login");
  const dl = await user.req(`/api/download/${fileId}`, { method: "POST" });
  const location = dl.headers.get("location") ?? "";
  ok(dl.status === 303 && location.startsWith("/api/storage/file?token="), "POST download → 303 ke signed URL");
  const file = await user.req(location);
  const buf = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(buf).digest("hex");
  ok(file.status === 200 && /attachment/.test(file.headers.get("content-disposition") ?? ""), "Signed URL mengirim file sebagai attachment");
  ok(hash === shownHash, "SHA-256 file yang diunduh cocok dengan yang ditampilkan");
  const stolen = await guest.req(location);
  ok(stolen.status === 403, "Signed URL tidak bisa dipakai akun lain / tanpa login");

  const lib = await user.html("/library");
  ok(lib.text.includes("Catat Duit") && lib.text.includes("Update v1.3.0"), "Library berisi produk + tanda update tersedia");
}

// ─── 3. Seller: buat produk → upload → kirim review ─────────────────────────
const seller = new Session();
let productId;
let slug;
{
  await seller.login("seller@rilisin.test");
  ok(seller.cookies.has("rilisin_session"), "Login seller berhasil");
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

console.log(`\nSemua ${passed} pengecekan lulus.`);
