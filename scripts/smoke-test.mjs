#!/usr/bin/env node
/**
 * Smoke test end-to-end (tanpa browser): jalankan server dulu (npm run start), lalu
 *   node scripts/smoke-test.mjs [http://localhost:3000]
 * Menguji: header keamanan, halaman publik, login, download (signed URL), library, alur seller
 * (buat produk → upload gambar & file → kirim review), approve admin, komunitas chat
 * (kirim/balas/edit/hapus/reaksi/lapor/bisukan/realtime SSE/gambar), dan keamanan akun
 * (anti-bot, password policy, 2FA + kode cadangan, kunci akun, ganti password).
 * PERHATIAN: menambah data ke database. Jalankan `npm run db:seed` untuk reset.
 */
import { createHash, createHmac } from "node:crypto";
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
    const headers = new Headers(init.headers);
    if (this.cookies.size) headers.set("cookie", this.cookieHeader());
    if (init.method && init.method !== "GET" && !headers.has("origin")) headers.set("origin", ORIGIN);
    headers.set("x-forwarded-for", this.ip);
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
  async login(email, password = "rilisin123") {
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

console.log(`\nSemua ${passed} pengecekan lulus.`);
