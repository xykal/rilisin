#!/usr/bin/env node
/**
 * Google OAuth PALSU untuk CI (tests/security/fake-google.mjs).
 *
 * Dipakai hanya oleh workflow CI untuk membuktikan alur login Google end-to-end
 * (PKCE, state, penautan akun, penolakan email belum terverifikasi) tanpa memakai
 * kredensial Google sungguhan. JANGAN dipakai di produksi: server ini mengembalikan
 * token untuk siapa saja yang meminta.
 *
 * Endpoint:
 *   GET  /auth?client_id&redirect_uri&state&code_challenge&code_challenge_method
 *        → 302 ke redirect_uri?code=<acak>&state=<sama>
 *   POST /token  (form: code, code_verifier)
 *        → cek code_verifier = S256(code_challenge). Salah → 400 (membuktikan PKCE benar).
 *   GET  /userinfo (Bearer token) → { sub, email, email_verified, name }
 *   POST /__identity  { email, sub, emailVerified, name } → ganti identitas yang dikembalikan
 *   GET  /__state → identitas & jumlah code yang sudah diterbitkan (diagnosa)
 *
 * Port: env FAKE_GOOGLE_PORT (default 9090). Identitas awal dari env
 * FAKE_GOOGLE_EMAIL / FAKE_GOOGLE_SUB / FAKE_GOOGLE_VERIFIED / FAKE_GOOGLE_NAME.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.FAKE_GOOGLE_PORT ?? 9090);
const b64url = (buf) => buf.toString("base64url");

let identity = {
  email: process.env.FAKE_GOOGLE_EMAIL ?? `oauth-${b64url(randomBytes(6))}@rilisin.test`,
  sub: process.env.FAKE_GOOGLE_SUB ?? `sub-${b64url(randomBytes(8))}`,
  emailVerified: process.env.FAKE_GOOGLE_VERIFIED !== "0",
  name: process.env.FAKE_GOOGLE_NAME ?? "Pengguna Google",
};
/** code → { challenge, email, sub, verified } (dipakai sekali) */
const codes = new Map();
const tokens = new Set();

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };

  if (url.pathname === "/auth") {
    const challenge = url.searchParams.get("code_challenge") ?? "";
    const state = url.searchParams.get("state") ?? "";
    const method = url.searchParams.get("code_challenge_method") ?? "";
    const redirectUri = url.searchParams.get("redirect_uri") ?? "";
    if (!challenge || !state || !redirectUri) return send(400, { error: "invalid_request" });
    if (method !== "S256") return send(400, { error: "unsupported_code_challenge_method" });
    const code = b64url(randomBytes(24));
    codes.set(code, { challenge, email: identity.email, sub: identity.sub, verified: identity.emailVerified });
    const target = new URL(redirectUri);
    target.searchParams.set("code", code);
    target.searchParams.set("state", state);
    return send(302, "", { location: target.toString() });
  }

  if (url.pathname === "/token" && req.method === "POST") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
      const code = form.get("code") ?? "";
      const verifier = form.get("code_verifier") ?? "";
      const entry = codes.get(code);
      if (!entry) return send(400, { error: "invalid_grant" });
      codes.delete(code); // sekali pakai
      const expected = createHash("sha256").update(verifier).digest("base64url");
      if (expected !== entry.challenge) return send(400, { error: "invalid_grant", detail: "pkce_mismatch" });
      const token = b64url(randomBytes(24));
      tokens.add(token);
      return send(200, { access_token: token, token_type: "Bearer", expires_in: 3600 });
    });
    return;
  }

  if (url.pathname === "/userinfo") {
    const auth = req.headers.authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!tokens.has(token)) return send(401, { error: "invalid_token" });
    return send(200, { sub: identity.sub, email: identity.email, email_verified: identity.emailVerified, name: identity.name });
  }

  if (url.pathname === "/__identity" && req.method === "POST") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      identity = {
        email: String(body.email ?? identity.email),
        sub: String(body.sub ?? identity.sub),
        emailVerified: body.emailVerified !== false,
        name: String(body.name ?? identity.name),
      };
      return send(200, identity);
    });
    return;
  }

  if (url.pathname === "/__state") {
    return send(200, { identity, codesPending: codes.size, tokens: tokens.size });
  }

  send(404, { error: "not_found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`fake google OAuth siap di http://localhost:${PORT} (email awal: ${identity.email})`);
});
