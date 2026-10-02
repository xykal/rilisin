// EKSPERIMEN UKUR (bukan perubahan produk): ubah src/proxy.ts (Node middleware, memuat runtime Next
// ke bundle kedua) menjadi src/middleware.ts edge-safe, supaya CI bisa mengukur selisih ukuran Worker.
// Hanya dijalankan di job CI pada checkout sekali pakai.
import { readFileSync, rmSync, writeFileSync } from "node:fs";

let s = readFileSync("src/proxy.ts", "utf8");
const must = (cond, msg) => {
  if (!cond) throw new Error(`pola tidak ditemukan: ${msg}`);
};

must(s.includes('import { timingSafeEqual } from "node:crypto";\n'), "import node:crypto");
s = s.replace('import { timingSafeEqual } from "node:crypto";\n', "");

const a = s.indexOf("function sameSecret");
const b = s.indexOf("function siteLockOk");
must(a > 0 && b > a, "sameSecret");
s =
  s.slice(0, a) +
  `function sameSecret(a: string, b: string) {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

` +
  s.slice(b);

must(s.includes('Buffer.from(header.slice(6), "base64").toString("utf8")'), "decode basic auth");
s = s.replace(
  'Buffer.from(header.slice(6), "base64").toString("utf8")',
  "new TextDecoder().decode(Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0)))",
);
must(s.includes('Buffer.from(crypto.randomUUID()).toString("base64")'), "nonce");
s = s.replace('Buffer.from(crypto.randomUUID()).toString("base64")', "btoa(crypto.randomUUID())");
must(s.includes("export function proxy("), "export proxy");
s = s.replace("export function proxy(", "export function middleware(");

writeFileSync("src/middleware.ts", s);
rmSync("src/proxy.ts");
console.log("src/proxy.ts -> src/middleware.ts (edge-safe)");
