#!/usr/bin/env node
/**
 * PROVING TESTS keamanan Rilisin (jalan di CI setelah server menyala):
 *   node tests/security/proving-tests.mjs [http://localhost:3000]
 *
 * Melengkapi scripts/smoke-test.mjs (yang sudah menguji anti-bot, 2FA, kunci
 * akun, CSRF dasar). Di sini fokus pada hal yang HARING dibuktikan tiap run:
 *   1. Rate limit benar-benar membalas 429 setelah ambang (bukan cuma ada kodenya)
 *   2. Payload injeksi/traversal/XSS ditolak atau dinetralkan, data tidak berubah
 *   3. Otorisasi per-objek: akun A tidak bisa menyentuh objek akun B (IDOR)
 *   4. Endpoint mutasi wajib login + origin benar (CSRF/auth boundary)
 *   5. Header keamanan & flag cookie session
 *
 * PERHATIAN: menambah data (pesan chat) ke database — aman dijalankan berulang.
 * Butuh seed demo: user@rilisin.test & seller@rilisin.test (password SEED_DEMO_PASSWORD).
 */
import { Session, ok, uuid, DEMO_PW, clean } from "./lib.mjs";

const ROOM = "nongkrong";

/**
 * Login demo + diagnosa jujur kalau gagal: status, lokasi redirect, isi form,
 * dan pesan server dicetak ke log CI supaya penyebabnya kelihatan (bukan tebakan).
 */
async function loginDemo(label, session, identifier = "user@rilisin.test") {
  const page = await session.html("/masuk");
  const form = page.text
    .split("<form")
    .slice(1)
    .map((c) => c.split("</form>")[0])
    .find((c) => c.includes('name="identifier"'));
  const res = await session.submitForm("/masuk", page.text, 'name="identifier"', {
    identifier,
    password: DEMO_PW,
    next: "/",
  });
  if (res.status !== 303 || !session.hasSession()) {
    const openTag = form ? `<form${form.split(">")[0]}>` : "(form tidak ditemukan)";
    const hidden = [...(form?.matchAll(/<input[^>]*>/g) ?? [])]
      .map((m) => m[0])
      .filter((t) => /type="hidden"/.test(t))
      .map((t) => t.replace(/\s+/g, " ").slice(0, 200));
    const body = res.status === 303 ? "(tanpa body — redirect)" : clean(await res.text()).replace(/\s+/g, " ").slice(0, 400);
    console.error(`DEBUG login "${label}": status=${res.status} location=${res.headers.get("location")} session=${session.hasSession()}`);
    console.error(`DEBUG tag pembuka form: ${openTag}`);
    console.error(`DEBUG hidden inputs form login: ${JSON.stringify(hidden, null, 1)}`);
    console.error(`DEBUG respons server: ${body}`);
  }
  return res;
}

// ─── 1. Header keamanan ─────────────────────────────────────────────────────
{
  const guest = new Session();
  const res = await guest.req("/");
  ok(
    res.headers.get("cross-origin-opener-policy") === "same-origin" &&
      res.headers.get("x-content-type-options") === "nosniff" &&
      Boolean(res.headers.get("permissions-policy")),
    "Header COOP/nosniff/Permissions-Policy terpasang di halaman",
  );
  // Halaman unduhan gagal (token palsu) tetap membawa CSP ketat + sandbox
  const bad = await guest.req(`/api/storage/file?token=${encodeURIComponent("../../../etc/passwd")}`);
  const csp = bad.headers.get("content-security-policy") ?? "";
  ok(bad.status === 403, "Token download palsu → 403 (bukan isi file)");
  ok(csp.includes("default-src 'none'") && csp.includes("sandbox"), "Halaman /api/storage/file membawa CSP default-src 'none' + sandbox");
  ok(bad.headers.get("x-content-type-options") === "nosniff", "Respons unduhan gagal tetap nosniff");
}

// ─── 2. Batas auth: mutasi tanpa login = 401, bukan 500 ─────────────────────
{
  const guest = new Session();
  const chat = await guest.api(`/api/chat/rooms/${ROOM}/messages`, { body: "hai", clientId: "guest-12345678" });
  ok(chat.status === 401, "POST chat tanpa login → 401");
  const up = await guest.api("/api/uploads/init", { purpose: "icon", targetId: uuid(), filename: "a.png", size: 10 });
  ok(up.status === 401, "POST uploads/init tanpa login → 401");
  const notif = await guest.api("/api/notifications");
  ok(notif.status === 401, "GET notifikasi tanpa login → 401");
  const act = await guest.api(`/api/chat/messages/${uuid()}`, { action: "edit", body: "x" });
  ok(act.status === 401, "Aksi pesan tanpa login → 401");
  const order = await guest.api(`/api/orders/${uuid()}/status`);
  ok(order.status === 401, "Status pesanan tanpa login → 401");
}

// ─── 3. CSRF: origin asing & content-type salah ditolak ─────────────────────
{
  const user = new Session();
  const login = await loginDemo("csrf", user);
  ok(login.status === 303 && user.hasSession(), "Login user demo untuk tes CSRF/IDOR");

  const evil = await user.api(
    `/api/chat/rooms/${ROOM}/messages`,
    { body: "csrf", clientId: "evil-origin1" },
    { origin: "https://situs-jahat.example" },
  );
  ok(evil.status === 403, "POST chat dengan Origin asing → 403");

  const evilUp = await user.req("/api/uploads/init", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://situs-jahat.example" },
    body: JSON.stringify({ purpose: "icon", targetId: uuid(), filename: "a.png", size: 10 }),
  });
  ok(evilUp.status === 403, "POST uploads/init dengan Origin asing → 403");

  const plain = await user.req(`/api/chat/rooms/${ROOM}/messages`, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: JSON.stringify({ body: "x", clientId: "plain-type12" }),
  });
  ok(plain.status === 415, "POST chat dengan Content-Type non-JSON → 415");

  const crossSite = await user.req(`/api/chat/rooms/${ROOM}/messages`, { headers: { "sec-fetch-site": "cross-site" } });
  ok(crossSite.status === 403, "GET chat dengan Sec-Fetch-Site: cross-site → 403");
}

// ─── 4. Injeksi, traversal, XSS ─────────────────────────────────────────────
{
  const guest = new Session();
  // Traversal lewat token & path: tidak boleh pernah membocorkan isi file
  for (const tok of ["../../../etc/passwd", "..%2f..%2fetc%2fpasswd", "%2e%2e%2f", "", "a".repeat(500)]) {
    const res = await guest.req(`/api/storage/file?token=${encodeURIComponent(tok)}`);
    ok(res.status === 403 || res.status === 404, `Token traversal/rusak (${tok.slice(0, 24) || "kosong"}) → ${res.status}, tidak ada isi file`);
  }
  // SQLi di pencarian: halaman tetap 200 & tidak error 500
  const sqli = await guest.html("/jelajahi?q=%27%3B%20DROP%20TABLE%20products%3B--");
  ok(sqli.res.status === 200, "Pencarian dengan payload SQLi tetap 200 (parameterized)");
  const sqli2 = await guest.html("/jelajahi?q=%27%20OR%201%3D1--");
  ok(sqli2.res.status === 200, "Pencarian 'OR 1=1-- tetap 200");
  // Data tidak berubah setelah payload injeksi
  const after = await guest.html("/jelajahi");
  ok(after.res.status === 200 && after.text.includes("KasirKu Offline"), "Tabel products masih utuh setelah payload injeksi");
  // XSS refleksi: payload harus ter-escape, bukan script nyata
  const xss = await guest.html("/jelajahi?q=%3Cscript%3Ealert(1)%3C/script%3E");
  ok(xss.res.status === 200 && !xss.text.includes("<script>alert(1)"), "Payload <script> di pencarian ter-escape (tidak dieksekusi)");
  // SQLi di form login: pesan generik, tidak ada session, tidak 500
  const s = new Session();
  const { text } = await s.html("/masuk");
  const inj = await s.submitForm("/masuk", text, 'name="identifier"', { identifier: "' OR '1'='1' --", password: "apa aja" });
  const injText = (await inj.text()).replaceAll("<!-- -->", "");
  ok(!s.hasSession() && injText.includes("Email/username atau password salah"), "SQLi di form login → pesan generik, tidak masuk");
}

// ─── 5. Validasi body & parameter ───────────────────────────────────────────
{
  const user = new Session();
  await user.login("user@rilisin.test");
  const big = "x".repeat(40 * 1024);
  const tooBig = await user.api(`/api/chat/rooms/${ROOM}/messages`, { body: big, clientId: "too-big-1234" });
  ok(tooBig.status === 400, "Body 40 KB (> batas 32 KB) → 400");
  const broken = await user.req(`/api/chat/rooms/${ROOM}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "bukan-json",
  });
  ok(broken.status === 400, "Body JSON rusak → 400");
  const badId = await user.api(`/api/chat/rooms/${ROOM}/messages`, { body: "hai", clientId: "x" });
  ok(badId.status === 400, "clientId tidak sesuai pola → 400");
  const notUuid = await user.api(`/api/chat/messages/bukan-uuid`, { action: "edit", body: "x" });
  ok(notUuid.status === 404, "ID pesan bukan UUID → 404");
}

// ─── 6. IDOR: akun B tidak bisa menyentuh objek akun A ──────────────────────
{
  const a = new Session();
  await loginDemo("idor-a", a);
  const sent = await a.api(`/api/chat/rooms/${ROOM}/messages`, { body: "pesan uji IDOR", clientId: `idor-${Date.now().toString(36)}` });
  ok(sent.status === 201 && sent.data.message?.id, "Akun A kirim pesan (201)");
  const msgId = sent.data.message.id;

  const b = new Session();
  await loginDemo("idor-b", b, "seller@rilisin.test");
  const edit = await b.api(`/api/chat/messages/${msgId}`, { action: "edit", body: "dialekalkan" });
  ok(edit.status === 403, "Akun B edit pesan akun A → 403");
  const del = await b.api(`/api/chat/messages/${msgId}`, { action: "delete", scope: "everyone" });
  ok(del.status === 403, "Akun B hapus pesan akun A → 403");
  const pin = await b.api(`/api/chat/messages/${msgId}`, { action: "pin" });
  ok(pin.status === 403, "Akun B (non-staf) sematkan pesan → 403");
  const ownReport = await a.api(`/api/chat/messages/${msgId}`, { action: "report", reason: "spam" });
  ok(ownReport.status === 400, "Melaporkan pesan sendiri → 400");
  // Isi pesan tidak berubah setelah percobaan ilegal
  const list = await a.api(`/api/chat/rooms/${ROOM}/messages`);
  const same = (list.data.messages ?? []).find((m) => m.id === msgId);
  ok(Boolean(same) && same.body === "pesan uji IDOR", "Isi pesan akun A tidak berubah setelah percobaan IDOR");

  const order = await b.api(`/api/orders/${uuid()}/status`);
  ok(order.status === 404, "Status pesanan orang lain / tidak ada → 404");
}

// ─── 7. Flag cookie session ─────────────────────────────────────────────────
{
  const s = new Session();
  const res = await loginDemo("cookie", s);
  const cookie = (res.headers.getSetCookie?.() ?? []).find((c) => /rilisin_session/.test(c)) ?? "";
  ok(/HttpOnly/i.test(cookie), "Cookie session HttpOnly");
  ok(/SameSite=Lax/i.test(cookie), "Cookie session SameSite=Lax di lingkungan non-HTTPS");
}

// ─── 8. Rate limit benar-benar membalas 429 setelah ambang ──────────────────
// Dilakukan TERAKHIR: tes ini menghabiskan kuota user demo dalam window-nya.
{
  const user = new Session();
  await loginDemo("limit", user);

  // Chat: batas 30 pesan/menit per user (sharedLimit)
  let chatBlocked = 0;
  let chatOk = 0;
  for (let i = 0; i < 35; i++) {
    const r = await user.api(`/api/chat/rooms/${ROOM}/messages`, { body: `pesan uji limit ${i}`, clientId: `lim-${Date.now().toString(36)}-${i}` });
    if (r.status === 201) chatOk++;
    else if (r.status === 429) chatBlocked++;
    else break; // status tak terduga → gagal di bawah
  }
  ok(chatOk >= 1 && chatBlocked >= 1, `Rate limit chat: ${chatOk} pesan lolos lalu ${chatBlocked} diblokir 429`);

  // Upload init: batas 60/10 menit per user (sharedLimit)
  let upBlocked = 0;
  let upPassed = 0;
  for (let i = 0; i < 65; i++) {
    const r = await user.api("/api/uploads/init", { purpose: "icon", targetId: uuid(), filename: "a.png", size: 10 });
    if (r.status === 429) upBlocked++;
    else upPassed++;
  }
  ok(upPassed >= 1 && upBlocked >= 1, `Rate limit upload: ${upPassed} lolos lalu ${upBlocked} diblokir 429`);

  // Notifikasi: batas 60/menit per user (rateLimit memori)
  let notifBlocked = 0;
  for (let i = 0; i < 65; i++) {
    const r = await user.api("/api/notifications");
    if (r.status === 429) notifBlocked++;
  }
  ok(notifBlocked >= 1, `Rate limit notifikasi: ${notifBlocked} permintaan diblokir 429`);
}

console.log(`\nSemua proving test keamanan lolos.`);
