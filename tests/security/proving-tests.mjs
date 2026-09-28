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
 *   9. Login Google (OAuth 2.0 + PKCE): state, sekali pakai, email harus terverifikasi
 *
 * PERHATIAN: menambah data (pesan chat) ke database — aman dijalankan berulang.
 * Butuh seed demo: user@rilisin.test & seller@rilisin.test (password SEED_DEMO_PASSWORD).
 */
import { randomBytes } from "node:crypto";
import { BASE, Session, ok, uuid, DEMO_PW, clean } from "./lib.mjs";

const b64url = (buf) => buf.toString("base64url");

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
  const secure = /(?:^|;\s*)Secure/i.test(cookie);
  ok(/HttpOnly/i.test(cookie), "Cookie session HttpOnly");
  // Mode cookie mengikuti lingkungan (src/lib/auth/session.ts): HTTPS/produksi →
  // Secure + SameSite=None + Partitioned (app bisa dibuka di iframe preview);
  // non-HTTPS → SameSite=Lax. Proteksi CSRF tetap dari pengecekan Origin (bagian 3).
  ok(
    secure ? /SameSite=None/i.test(cookie) && /Partitioned/i.test(cookie) : /SameSite=Lax/i.test(cookie),
    `Cookie session SameSite sesuai mode (${secure ? "Secure+None+Partitioned" : "Lax"})`,
  );
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

// ─── 9. Login Google (OAuth 2.0 + PKCE) ─────────────────────────────────────
// Hanya jalan kalau CI mengisi GOOGLE_CLIENT_ID + endpoint Google palsu. Membuktikan:
//   a. halaman masuk menawarkan tautan Google
//   b. /api/auth/google memakai PKCE S256 + state di cookie HttpOnly
//   c. callback dengan state palsu/kosong → ditolak, TIDAK ada session
//   d. alur penuh (code → token → userinfo) membuat session & akun baru
//   e. email Google yang belum diverifikasi ditolak (tidak bisa dipakai mengambil alih akun)
//   f. email Google yang sama dengan akun lama yang emailnya BELUM diverifikasi → ditolak
{
  const GOOGLE_ID = process.env.GOOGLE_CLIENT_ID;
  const FAKE = process.env.GOOGLE_AUTH_URL;
  // Nama cookie tiket OAuth bergantung mode env server (CI = produksi → prefix __Secure-),
  // jadi jangan dihitung dari URL: cari dari header Set-Cookie yang benar-benar dikirim.
  const ticketCookie = (res) => (res.headers.getSetCookie?.() ?? []).find((c) => /rilisin_oauth/.test(c)) ?? "";
  const hasTicket = (session) => [...session.cookies.keys()].some((k) => k.includes("rilisin_oauth"));

  if (GOOGLE_ID && FAKE) {
    const setIdentity = async (payload) => {
      const r = await fetch(`${new URL(FAKE).origin}/__identity`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`gagal mengatur identitas Google palsu: ${r.status}`);
    };

    // a. tautan Google tampil di halaman masuk
    const guest = new Session();
    const loginPage = await guest.html("/masuk");
    ok(loginPage.text.includes('data-testid="google-login"'), "Halaman /masuk menampilkan tautan \"Lanjutkan dengan Google\"");

    // b. redirect ke Google dengan PKCE S256 + state di cookie HttpOnly
    const start = await guest.req("/api/auth/google?next=/akun/keamanan");
    ok(start.status === 307, "GET /api/auth/google → 307 redirect ke Google");
    const authorize = new URL(start.headers.get("location") ?? "");
    ok(authorize.origin + authorize.pathname === new URL(FAKE).origin + new URL(FAKE).pathname, "Redirect menuju halaman izin Google");
    ok(authorize.searchParams.get("client_id") === GOOGLE_ID, "client_id dikirim ke Google");
    ok(authorize.searchParams.get("redirect_uri")?.endsWith("/api/auth/google/callback"), "redirect_uri menunjuk ke callback aplikasi");
    ok(authorize.searchParams.get("code_challenge_method") === "S256", "PKCE memakai S256 (bukan plain)");
    const challenge = authorize.searchParams.get("code_challenge") ?? "";
    ok(/^[A-Za-z0-9_-]{43}$/.test(challenge), "code_challenge berupa base64url 32 byte (43 karakter)");
    ok(authorize.searchParams.get("state")?.length >= 30, "state acak panjang dikirim ke Google");
    const stateSetCookie = ticketCookie(start);
    ok(Boolean(stateSetCookie), "Cookie tiket OAuth (state + PKCE verifier) dipasang server");
    ok(/HttpOnly/i.test(stateSetCookie), "Cookie tiket OAuth HttpOnly (state tidak bisa dibaca JS)");
    ok(/SameSite=Lax/i.test(stateSetCookie), "Cookie tiket OAuth SameSite=Lax supaya kembali dari Google");
    ok(/Max-Age=600/i.test(stateSetCookie), "Cookie tiket OAuth kedaluwarsa 10 menit");

    // c. callback dengan state palsu → ditolak, tanpa session
    const forged = new Session();
    const rejected = await forged.req(`/api/auth/google/callback?code=${encodeURIComponent("code-palsu")}&state=${encodeURIComponent("state-palsu")}`);
    ok(rejected.status === 307, "Callback tanpa tiket valid → 307 (bukan 500)");
    ok(!forged.hasSession(), "Callback dengan state palsu TIDAK membuat session");
    ok(!(await forged.req("/api/chat/rooms/nongkrong/messages")).status.toString().startsWith("2"), "Session tidak terbuat: endpoint login tetap menolak");
    const emptyState = await forged.req("/api/auth/google/callback?code=x");
    ok(emptyState.status === 307 && !forged.hasSession(), "Callback tanpa state/code → ditolak");

    // d. alur penuh dengan email Google terverifikasi (akun baru dibuat)
    const fresh = new Session();
    const freshEmail = `oauth-${b64url(randomBytes(6))}@rilisin.test`;
    await setIdentity({ email: freshEmail, sub: `sub-${b64url(randomBytes(8))}`, emailVerified: true, name: "Pengguna Baru" });
    const start2 = await fresh.req("/api/auth/google");
    const googleRedirect = await fetch(new URL(start2.headers.get("location")), { redirect: "manual" });
    const callbackUrl = new URL(googleRedirect.headers.get("location"));
    const callback = await fresh.req(`${callbackUrl.pathname}${callbackUrl.search}`);
    ok(callback.status === 307, "Callback Google valid → 307");
    ok(fresh.hasSession(), "Login Google penuh membuat session cookie");
    const landed = await fresh.req(callback.headers.get("location") ?? "/");
    ok(landed.status === 200, "Setelah login Google, halaman tujuan terbuka (200)");
    const me = await fresh.req("/api/notifications");
    ok(me.status === 200, "Akun hasil login Google benar-benar terautentikasi");
    // tiket OAuth harus sudah dihapus (sekali pakai)
    ok(!hasTicket(fresh), "Tiket OAuth dihapus setelah dipakai");

    // e. email Google belum diverifikasi → ditolak
    const unverified = new Session();
    await setIdentity({ email: `belum-verif-${b64url(randomBytes(6))}@rilisin.test`, sub: `sub-${b64url(randomBytes(8))}`, emailVerified: false, name: "Belum Verif" });
    const start3 = await unverified.req("/api/auth/google");
    const redirect3 = await fetch(new URL(start3.headers.get("location")), { redirect: "manual" });
    const cbUrl3 = new URL(redirect3.headers.get("location"));
    const cb3 = await unverified.req(`${cbUrl3.pathname}${cbUrl3.search}`);
    ok(cb3.status === 307 && !unverified.hasSession(), "email_verified=false dari Google → login ditolak, tanpa session");

    // f. pra-pendaftaran: akun lokal (email + password, email BELUM diverifikasi) tidak boleh
    //    diambil alih lewat login Google dengan email yang sama. Sesi uji dipakai hanya untuk
    //    mendaftar; percobaan Google memakai sesi BARU tanpa cookie sama sekali.
    const localEmail = `pra-daftar-${b64url(randomBytes(6))}@rilisin.test`;
    const localUsername = ("pra" + b64url(randomBytes(5)).replace(/[^a-z0-9]/g, "0")).slice(0, 20);
    const signup = new Session();
    const signupPage = await signup.html("/daftar");
    ok(signupPage.text.includes('data-testid="google-login"'), "Halaman /daftar menawarkan \"Daftar dengan Google\"");
    const signupRes = await signup.submitForm("/daftar", signupPage.text, 'name="username"', {
      displayName: "Pra Daftar",
      username: localUsername,
      email: localEmail,
      password: `Kuat-${b64url(randomBytes(9))}7`,
      next: "/",
    });
    ok(signupRes.status === 303 && signup.hasSession(), "Pendaftaran email + password biasa membuat akun + session");

    await setIdentity({ email: localEmail, sub: `sub-${b64url(randomBytes(8))}`, emailVerified: true, name: "Pengambil Alih" });
    const attacker = new Session(); // tanpa cookie apa pun
    const start4 = await attacker.req("/api/auth/google");
    const redirect4 = await fetch(new URL(start4.headers.get("location")), { redirect: "manual" });
    const cbUrl4 = new URL(redirect4.headers.get("location"));
    const cb4 = await attacker.req(`${cbUrl4.pathname}${cbUrl4.search}`);
    ok(cb4.status === 307 && !attacker.hasSession(), "Email yang sama dengan akun lokal belum terverifikasi → login Google DITOLAK (anti pengambilalihan)");
    ok((cb4.headers.get("location") ?? "").includes("perlu-password"), "Penolakan diarahkan ke /masuk?oauth=perlu-password (instruksi jelas ke pengguna)");

    // g. kalau email akun itu sudah terverifikasi (login Google yang tadi berhasil), penautan boleh
    await setIdentity({ email: freshEmail, sub: `sub-${b64url(randomBytes(8))}`, emailVerified: true, name: "Pengguna Baru" });
    const again = new Session();
    const start5 = await again.req("/api/auth/google");
    const redirect5 = await fetch(new URL(start5.headers.get("location")), { redirect: "manual" });
    const cbUrl5 = new URL(redirect5.headers.get("location"));
    const cb5 = await again.req(`${cbUrl5.pathname}${cbUrl5.search}`);
    ok(cb5.status === 307 && again.hasSession(), "Email yang sudah terverifikasi Google → login langsung (identitas yang sama dipakai ulang)");

    // h. halaman /verifikasi-email aman diakses tanpa token
    const verifyPage = await guest.html("/verifikasi-email");
    ok(verifyPage.status === 200, "Halaman /verifikasi-email terbuka tanpa error (500)");
    const buka = await guest.req("/verifikasi-email/buka?token=token-ngawur");
    ok(buka.status === 303, "Link verifikasi palsu → 303 ke halaman status");
  } else {
    console.log("· Lewati tes login Google (GOOGLE_CLIENT_ID/GOOGLE_AUTH_URL tidak diisi)");
  }
}

console.log(`\nSemua proving test keamanan lolos.`);
