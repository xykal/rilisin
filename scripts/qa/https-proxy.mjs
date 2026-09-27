// Proxy HTTPS lokal khusus testing WebKit (Safari): https://localhost:3443 → http://127.0.0.1:3000, mendukung SSE.
// Cookie session memakai prefix __Host- + Secure, dan WebKit hanya menerimanya lewat HTTPS.
//   node scripts/qa/https-proxy.mjs          (sertifikat self-signed dibuat otomatis di folder temp)
//   BASE=https://localhost:3443 node scripts/qa/responsive-audit.mjs webkit
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
const dir = path.join(os.tmpdir(), "rilisin-qa");
fs.mkdirSync(dir, { recursive: true });
const key = path.join(dir, "key.pem");
const cert = path.join(dir, "cert.pem");
if (!fs.existsSync(key) || !fs.existsSync(cert)) {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "30", "-subj", "/CN=localhost"], { stdio: "ignore" });
}
const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
  const headers = { ...req.headers, "x-forwarded-proto": "https", "x-forwarded-host": req.headers.host, "x-forwarded-for": "127.0.0.1" };
  const up = http.request({ host: "127.0.0.1", port: 3000, method: req.method, path: req.url, headers }, (upRes) => {
    res.writeHead(upRes.statusCode ?? 502, upRes.headers);
    upRes.pipe(res);
  });
  up.on("error", (e) => { if (!res.headersSent) res.writeHead(502); res.end(String(e)); });
  res.on("close", () => { if (!res.writableFinished) up.destroy(); }); // klien putus (mis. SSE ditutup) → putuskan upstream
  req.pipe(up);
});
server.listen(3443, "127.0.0.1", () => console.log("HTTPS test proxy: https://localhost:3443 → http://127.0.0.1:3000"));
