/**
 * Helper bersama untuk tes keamanan (tests/security). Pola sama dengan
 * scripts/smoke-test.mjs: POST form seperti browser tanpa JS (progressive
 * enhancement), cookie per sesi, dan "IP" berbeda per sesi lewat X-Forwarded-For
 * supaya limit per-IP tidak saling mengganggu.
 *
 * Dipakai oleh: tests/security/proving-tests.mjs
 */
export const BASE = process.argv[2] ?? "http://localhost:3000";
export const ORIGIN = new URL(BASE).origin;
const BASIC = process.env.SMOKE_BASIC_AUTH
  ? `Basic ${Buffer.from(process.env.SMOKE_BASIC_AUTH).toString("base64")}`
  : null;
export const DEMO_PW = process.env.SMOKE_DEMO_PASSWORD || process.env.SEED_DEMO_PASSWORD || "rilisin123";

export const clean = (t) => t.replaceAll("<!-- -->", "");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const uuid = () => crypto.randomUUID();

let passed = 0;
export function ok(cond, label) {
  if (!cond) {
    console.error(`✗ ${label}`);
    process.exit(1);
  }
  passed++;
  console.log(`✓ ${label}`);
}
export function passedCount() {
  return passed;
}

let ipCounter = 200;

/** Sesi uji: cookie sendiri + X-Forwarded-For sendiri. */
export class Session {
  cookies = new Map();
  ip = `10.7.${Math.floor(Math.random() * 200)}.${ipCounter++}`;

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
  /** POST <form> server action seperti browser tanpa JS. */
  async submitForm(pagePath, html, marker, fields = {}) {
    const chunks = html.split("<form").slice(1).map((c) => c.split("</form>")[0]);
    const form = chunks.find((c) => c.includes(marker));
    if (!form) throw new Error(`Form "${marker}" tidak ditemukan di ${pagePath}`);
    const fd = new FormData();
    for (const tag of form.match(/<input[^>]*>/g) ?? []) {
      if (!/type="hidden"/.test(tag)) continue;
      const name = tag.match(/name="([^"]*)"/)?.[1];
      if (!name) continue;
      if (Object.hasOwn(fields, name)) continue;
      fd.append(name, tag.match(/value="([^"]*)"/)?.[1] ?? "");
    }
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    return this.req(pagePath, { method: "POST", body: fd });
  }
  async login(identifier, password = DEMO_PW) {
    const { text } = await this.html("/masuk");
    return this.submitForm("/masuk", text, 'name="identifier"', { identifier, password, next: "/" });
  }
  /** Panggil API JSON; mengembalikan { status, data, res }. */
  async api(path, body, extraHeaders = {}) {
    const init =
      body === undefined
        ? {}
        : { method: "POST", headers: { "content-type": "application/json", ...extraHeaders }, body: JSON.stringify(body) };
    const res = await this.req(path, init);
    const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
    return { status: res.status, data, res };
  }
}
