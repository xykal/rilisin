#!/usr/bin/env node
/**
 * Worker antivirus Rilisin (tanpa dependensi, Node ≥ 20).
 * Alur: klaim antrean dari app → unduh file lewat URL bertanda tangan → pindai dengan clamd (protokol INSTREAM) → laporkan hasil.
 * Hanya butuh koneksi HTTPS KELUAR ke app — tidak perlu port masuk (bisa di VPS murah, NAS, atau PC rumah).
 *
 * Env:
 *   RILISIN_URL         mis. https://rilisin.xyverse.my.id
 *   SCAN_WORKER_TOKEN   sama dengan env SCAN_WORKER_TOKEN di app
 *   CLAMD_HOST / CLAMD_PORT   default 127.0.0.1 : 3310
 *   INTERVAL_SEC        jeda saat antrean kosong (default 60)
 *   ONCE=1              proses antrean sampai habis lalu keluar (untuk uji / cron)
 *   WORKER_NAME         nama worker di halaman Sistem (default hostname)
 */
import net from "node:net";
import os from "node:os";

const APP = (process.env.RILISIN_URL ?? "").replace(/\/$/, "");
const TOKEN = process.env.SCAN_WORKER_TOKEN ?? "";
const HOST = process.env.CLAMD_HOST ?? "127.0.0.1";
const PORT = Number(process.env.CLAMD_PORT ?? 3310);
const INTERVAL = Math.max(10, Number(process.env.INTERVAL_SEC ?? 60)) * 1000;
const ONCE = process.env.ONCE === "1";
const NAME = process.env.WORKER_NAME ?? os.hostname();
const MAX_BYTES = Number(process.env.MAX_FILE_MB ?? 100) * 1024 * 1024;

if (!APP || TOKEN.length < 32) {
  console.error("Isi RILISIN_URL dan SCAN_WORKER_TOKEN (min. 32 karakter).");
  process.exit(1);
}

let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString(), ...a);

/** Kirim perintah ke clamd; untuk INSTREAM `feed` menulis potongan data. Balasan diakhiri NUL. */
function clamd(command, feed) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: HOST, port: PORT });
    const chunks = [];
    sock.setTimeout(10 * 60_000, () => sock.destroy(new Error("clamd timeout")));
    sock.on("data", (d) => chunks.push(d));
    sock.on("error", reject);
    sock.on("close", () => resolve(Buffer.concat(chunks).toString("utf8").replace(/\0/g, "").trim()));
    sock.on("connect", async () => {
      sock.write(`z${command}\0`);
      try {
        if (feed) await feed(sock);
      } catch (err) {
        sock.destroy(err);
      }
    });
  });
}

async function engine() {
  return (await clamd("VERSION")) || "ClamAV (versi tidak diketahui)";
}

/** Streaming unduhan → clamd INSTREAM ([panjang uint32 BE][data] … [0]) tanpa menyimpan file ke disk. */
async function scan(url) {
  const headers = url.startsWith(APP) ? { authorization: `Bearer ${TOKEN}` } : {};
  const res = await fetch(url, { headers, redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`unduh gagal (${res.status})`);
  let total = 0;
  const reply = await clamd("INSTREAM", async (sock) => {
    const write = (buf) => new Promise((ok) => (sock.write(buf) ? ok() : sock.once("drain", ok)));
    for await (const chunk of res.body) {
      total += chunk.length;
      if (total > MAX_BYTES) throw new Error(`file lebih dari ${MAX_BYTES / 1024 / 1024} MB`);
      const len = Buffer.alloc(4);
      len.writeUInt32BE(chunk.length);
      await write(len);
      await write(Buffer.from(chunk));
    }
    await write(Buffer.alloc(4));
  });
  if (/: OK$/.test(reply)) return { status: "clean" };
  const found = reply.match(/: (.+) FOUND$/);
  if (found) return { status: "infected", signature: found[1] };
  return { status: "error", signature: reply.slice(0, 200) || "balasan clamd kosong" };
}

async function api(path, body) {
  const res = await fetch(`${APP}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function round() {
  const eng = await engine();
  const { files } = await api("/api/internal/scan/claim", { limit: 3, worker: NAME, engine: eng });
  for (const f of files) {
    let result;
    try {
      result = await scan(f.url);
    } catch (err) {
      result = { status: "error", signature: String(err.message ?? err).slice(0, 200) };
    }
    await api("/api/internal/scan/result", { fileId: f.fileId, status: result.status, engine: eng, signature: result.signature ?? null });
    log(`${result.status.toUpperCase().padEnd(8)} ${f.filename}${result.signature ? ` — ${result.signature}` : ""}${f.rescan ? " (pindai ulang)" : ""}`);
  }
  return files.length;
}

async function main() {
  // Tunggu clamd siap (database signature pertama kali diunduh bisa beberapa menit)
  for (let i = 0; ; i++) {
    try {
      if ((await clamd("PING")) === "PONG") break;
    } catch {
      /* belum siap */
    }
    if (i === 0) log(`menunggu clamd di ${HOST}:${PORT}…`);
    if (i > 180) throw new Error("clamd tidak merespons");
    await sleep(5000);
  }
  log(`worker "${NAME}" siap · ${await engine()} · app ${APP}`);
  while (!stopping) {
    let n = 0;
    try {
      n = await round();
    } catch (err) {
      log("gagal:", err.message ?? err);
      if (ONCE) process.exitCode = 1;
    }
    if (ONCE && n === 0) break;
    if (n === 0) await sleep(INTERVAL);
  }
  log("worker berhenti");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
