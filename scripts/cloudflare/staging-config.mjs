// Membuat wrangler.staging.json dari wrangler.jsonc untuk deploy staging.
// Beda dari config utama: tanpa r2_buckets (R2 belum diaktifkan di akun; staging memakai driver vercel-blob).
import { readFileSync, writeFileSync } from "node:fs";

const raw = readFileSync("wrangler.jsonc", "utf8");
// buang komentar baris penuh (//...) saja; file ini tidak memakai komentar inline atau blok
const json = raw
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");
const cfg = JSON.parse(json);
delete cfg.r2_buckets;
writeFileSync("wrangler.staging.json", JSON.stringify(cfg, null, 2));
console.log("wrangler.staging.json:", Object.keys(cfg).join(", "));
