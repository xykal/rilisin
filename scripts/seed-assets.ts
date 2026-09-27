/**
 * Generator aset demo: ikon, cover, screenshot (SVG → WEBP via sharp) dan file rilis
 * (APK/ZIP berisi placeholder, PDF sederhana). Semua dibuat on-the-fly — tanpa file eksternal.
 */
import { randomBytes } from "node:crypto";
import { strToU8, zipSync, type Zippable } from "fflate";
import sharp from "sharp";

const FONT = "DejaVu Sans";

export function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function wrap(text: string, maxChars: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > maxChars && line) {
      lines.push(line);
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    cut[maxLines - 1] = cut[maxLines - 1]!.replace(/\s*\S*$/, "") + "…";
    return cut;
  }
  return lines;
}

function initialsOf(title: string) {
  return title
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 || /\d/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function defs(c1: string, c2: string) {
  return `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
  <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="2" fill="#fff" opacity="0.13"/></pattern>
</defs>`;
}

async function toWebp(svg: string, quality = 84) {
  return sharp(Buffer.from(svg)).webp({ quality }).toBuffer({ resolveWithObject: true });
}

// ─── Ikon ──────────────────────────────────────────────────────────────────
export async function makeIcon(title: string, c1: string, c2: string) {
  const text = initialsOf(title);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">${defs(c1, c2)}
  <rect width="512" height="512" fill="url(#bg)"/>
  <circle cx="430" cy="70" r="170" fill="#fff" opacity="0.12"/>
  <circle cx="40" cy="500" r="150" fill="#000" opacity="0.10"/>
  <rect x="96" y="96" width="320" height="320" rx="80" fill="#fff" opacity="0.14"/>
  <text x="256" y="${text.length > 1 ? 318 : 322}" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="${text.length > 1 ? 168 : 200}" fill="#fff">${esc(text)}</text>
</svg>`;
  return toWebp(svg, 88);
}

// ─── Cover ─────────────────────────────────────────────────────────────────
export type Visual = "phone" | "game" | "browser" | "book" | "grid";

function coverDevice(visual: Visual, c1: string, c2: string) {
  if (visual === "phone" || visual === "game") {
    const bars = visual === "phone"
      ? [0, 1, 2, 3].map((i) => `<rect x="34" y="${150 + i * 92}" width="232" height="74" rx="16" fill="#f1f3f9"/><rect x="50" y="${168 + i * 92}" width="38" height="38" rx="10" fill="${c1}" opacity="0.8"/><rect x="100" y="${172 + i * 92}" width="130" height="12" rx="6" fill="#cbd2e1"/><rect x="100" y="${192 + i * 92}" width="86" height="10" rx="5" fill="#e0e4ee"/>`).join("")
      : `<rect x="14" y="14" width="272" height="532" rx="32" fill="${c1}"/><circle cx="210" cy="120" r="44" fill="#fff4c2"/><path d="M14 380 Q 90 300 160 360 T 286 330 V 546 H 14 Z" fill="${c2}" opacity="0.9"/><path d="M14 440 Q 120 380 200 430 T 286 420 V 546 H 14 Z" fill="#000" opacity="0.25"/><rect x="118" y="330" width="56" height="60" rx="14" fill="#fff"/><circle cx="134" cy="352" r="7" fill="#0f1222"/><circle cx="158" cy="352" r="7" fill="#0f1222"/><text x="36" y="70" font-family="${FONT}" font-weight="bold" font-size="24" fill="#fff">Skor 12.400</text>`;
    return `<g transform="translate(880 96) rotate(7)">
      <rect width="300" height="560" rx="44" fill="#0f1222"/>
      <rect x="14" y="14" width="272" height="532" rx="32" fill="#fff"/>
      ${visual === "phone" ? `<rect x="14" y="14" width="272" height="110" rx="32" fill="${c1}"/><rect x="14" y="80" width="272" height="44" fill="${c1}"/><rect x="36" y="56" width="140" height="16" rx="8" fill="#fff" opacity="0.9"/><rect x="36" y="84" width="90" height="12" rx="6" fill="#fff" opacity="0.6"/>` : ""}
      ${bars}
    </g>`;
  }
  if (visual === "browser") {
    return `<g transform="translate(760 150) rotate(4)">
      <rect width="440" height="330" rx="20" fill="#0f1222" opacity="0.25" transform="translate(10 14)"/>
      <rect width="440" height="330" rx="20" fill="#fff"/>
      <rect width="440" height="44" rx="20" fill="#eef0f6"/><rect y="24" width="440" height="20" fill="#eef0f6"/>
      <circle cx="26" cy="22" r="7" fill="#ff6b6b"/><circle cx="48" cy="22" r="7" fill="#ffd166"/><circle cx="70" cy="22" r="7" fill="#06d6a0"/>
      <rect x="24" y="68" width="220" height="22" rx="8" fill="${c1}"/>
      <rect x="24" y="102" width="300" height="12" rx="6" fill="#cbd2e1"/><rect x="24" y="122" width="250" height="12" rx="6" fill="#e0e4ee"/>
      <rect x="24" y="150" width="110" height="34" rx="10" fill="${c2}"/>
      ${[0, 1, 2].map((i) => `<rect x="${24 + i * 136}" y="208" width="120" height="96" rx="14" fill="#f1f3f9"/><rect x="${38 + i * 136}" y="222" width="36" height="36" rx="10" fill="${c1}" opacity="0.7"/><rect x="${38 + i * 136}" y="270" width="80" height="10" rx="5" fill="#cbd2e1"/>`).join("")}
    </g>`;
  }
  if (visual === "book") {
    return `<g transform="translate(900 110) rotate(-6)">
      <rect width="300" height="420" rx="12" fill="#000" opacity="0.25" transform="translate(14 16)"/>
      <rect width="300" height="420" rx="12" fill="#fff"/>
      <rect width="300" height="170" rx="12" fill="${c2}"/><rect y="150" width="300" height="20" fill="${c2}"/>
      <rect x="0" y="0" width="22" height="420" fill="#000" opacity="0.15"/>
      <rect x="44" y="52" width="200" height="18" rx="9" fill="#fff" opacity="0.95"/><rect x="44" y="82" width="150" height="18" rx="9" fill="#fff" opacity="0.8"/>
      ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="44" y="${200 + i * 26}" width="${i % 3 === 2 ? 150 : 212}" height="10" rx="5" fill="#d7dbe7"/>`).join("")}
    </g>`;
  }
  // grid
  const shapes = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
    const x = 800 + (i % 3) * 130;
    const y = 150 + Math.floor(i / 3) * 130;
    const inner = i % 3 === 0 ? `<circle cx="${x + 55}" cy="${y + 55}" r="30" fill="${c1}"/>` : i % 3 === 1 ? `<rect x="${x + 25}" y="${y + 25}" width="60" height="60" rx="16" fill="${c2}"/>` : `<path d="M${x + 55} ${y + 22} L${x + 90} ${y + 88} H${x + 20} Z" fill="${c1}" opacity="0.8"/>`;
    return `<rect x="${x}" y="${y}" width="110" height="110" rx="24" fill="#fff"/>${inner}`;
  });
  return `<g transform="rotate(4 1000 350)">${shapes.join("")}</g>`;
}

export async function makeCover(p: { title: string; summary: string; category: string; c1: string; c2: string; visual: Visual }) {
  const titleLines = wrap(p.title, 17, 3);
  const summaryLines = wrap(p.summary, 44, 3);
  const titleStart = 250;
  const summaryStart = titleStart + titleLines.length * 76 + 20;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">${defs(p.c1, p.c2)}
  <rect width="1280" height="720" fill="url(#bg)"/>
  <rect width="1280" height="720" fill="url(#dots)"/>
  <circle cx="1150" cy="-60" r="330" fill="#fff" opacity="0.09"/>
  <circle cx="960" cy="780" r="260" fill="#000" opacity="0.10"/>
  <text font-family="${FONT}" font-weight="bold" font-size="62" fill="#fff">${titleLines.map((l, i) => `<tspan x="88" y="${titleStart + i * 76}">${esc(l)}</tspan>`).join("")}</text>
  <text font-family="${FONT}" font-size="25" fill="#fff" opacity="0.88">${summaryLines.map((l, i) => `<tspan x="90" y="${summaryStart + i * 38}">${esc(l)}</tspan>`).join("")}</text>
  ${coverDevice(p.visual, p.c1, p.c2)}
</svg>`;
  return toWebp(svg);
}

// ─── Screenshot ────────────────────────────────────────────────────────────
export type ScreenSpec = { title: string; subtitle: string; stats?: [string, string][]; items: string[] };

function phoneScreen(s: ScreenSpec, c1: string, c2: string) {
  const stats = s.stats ?? [];
  const statsSvg = stats.slice(0, 2).map(([label, value], i) => `
    <rect x="${40 + i * 340}" y="250" width="300" height="170" rx="30" fill="#fff"/>
    <text x="${72 + i * 340}" y="318" font-family="${FONT}" font-size="26" fill="#6b7390">${esc(label)}</text>
    <text x="${72 + i * 340}" y="380" font-family="${FONT}" font-weight="bold" font-size="44" fill="#0f1222">${esc(value)}</text>`).join("");
  const listTop = stats.length ? 460 : 260;
  const items = s.items.slice(0, stats.length ? 5 : 7).map((item, i) => {
    const y = listTop + i * 146;
    return `<rect x="40" y="${y}" width="640" height="122" rx="28" fill="#fff"/>
      <rect x="68" y="${y + 26}" width="70" height="70" rx="20" fill="${i % 2 ? c2 : c1}" opacity="0.18"/>
      <circle cx="103" cy="${y + 61}" r="16" fill="${i % 2 ? c2 : c1}"/>
      <text x="164" y="${y + 58}" font-family="${FONT}" font-weight="bold" font-size="28" fill="#0f1222">${esc(item)}</text>
      <rect x="164" y="${y + 76}" width="${180 + ((i * 53) % 160)}" height="14" rx="7" fill="#dfe3ee"/>
      <rect x="600" y="${y + 44}" width="48" height="34" rx="12" fill="${c1}" opacity="0.14"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1440">${defs(c1, c2)}
  <rect width="720" height="1440" fill="#f3f5fa"/>
  <rect width="720" height="210" fill="url(#bg)"/>
  <rect x="40" y="36" width="80" height="12" rx="6" fill="#fff" opacity="0.5"/>
  <text x="44" y="126" font-family="${FONT}" font-weight="bold" font-size="46" fill="#fff">${esc(s.title)}</text>
  <text x="46" y="172" font-family="${FONT}" font-size="26" fill="#fff" opacity="0.85">${esc(s.subtitle)}</text>
  ${statsSvg}
  ${items}
  <rect y="1316" width="720" height="124" fill="#fff"/>
  ${[0, 1, 2, 3].map((i) => `<circle cx="${110 + i * 166}" cy="1370" r="18" fill="${i === 0 ? c1 : "#c3c9d8"}"/><rect x="${80 + i * 166}" y="1398" width="60" height="10" rx="5" fill="${i === 0 ? c1 : "#dfe3ee"}"/>`).join("")}
</svg>`;
}

function gameScreen(s: ScreenSpec, c1: string, c2: string, i: number) {
  const skies = [["#7dd3fc", "#e0f2fe"], ["#fb923c", "#fde68a"], ["#1e1b4b", "#4c1d95"]][i % 3]!;
  const night = i % 3 === 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skies[0]}"/><stop offset="1" stop-color="${skies[1]}"/></linearGradient></defs>
  <rect width="1600" height="900" fill="url(#sky)"/>
  <circle cx="1180" cy="270" r="80" fill="${night ? "#f8fafc" : "#fff4c2"}" opacity="0.95"/>
  ${night ? [0, 1, 2, 3, 4, 5, 6, 7].map((k) => `<circle cx="${120 + k * 170}" cy="${80 + ((k * 67) % 200)}" r="3" fill="#fff"/>`).join("") : `<ellipse cx="380" cy="170" rx="120" ry="40" fill="#fff" opacity="0.8"/><ellipse cx="760" cy="120" rx="90" ry="30" fill="#fff" opacity="0.7"/>`}
  <path d="M0 560 Q 260 420 520 540 T 1040 520 T 1600 500 V 900 H 0 Z" fill="${c2}" opacity="${night ? 0.7 : 0.55}"/>
  <path d="M0 650 Q 300 560 640 640 T 1300 620 T 1600 640 V 900 H 0 Z" fill="${c1}"/>
  <rect y="760" width="1600" height="140" fill="#000" opacity="0.18"/>
  ${[0, 1, 2].map((k) => `<rect x="${980 + k * 150}" y="${560 - k * 60}" width="120" height="30" rx="10" fill="#fff" opacity="0.85"/>`).join("")}
  <g transform="translate(520 560)">
    <ellipse cx="60" cy="120" rx="70" ry="14" fill="#000" opacity="0.2"/>
    <rect x="10" y="10" width="100" height="100" rx="30" fill="#a16207"/>
    <circle cx="44" cy="48" r="10" fill="#0f1222"/><circle cx="80" cy="48" r="10" fill="#0f1222"/>
    <path d="M40 78 Q 62 94 84 78" stroke="#0f1222" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M20 16 L 8 -30 L 44 8 Z" fill="#a16207"/><path d="M100 16 L 112 -30 L 76 8 Z" fill="#a16207"/>
  </g>
  ${[0, 1, 2, 3].map((k) => `<circle cx="${1100 + k * 70}" cy="${480 - k * 50}" r="18" fill="#facc15" stroke="#ca8a04" stroke-width="5"/>`).join("")}
  <rect x="40" y="36" width="520" height="92" rx="24" fill="#000" opacity="0.35"/>
  <text x="72" y="96" font-family="${FONT}" font-weight="bold" font-size="40" fill="#fff">${esc(s.title)}</text>
  <rect x="1180" y="36" width="380" height="92" rx="24" fill="#000" opacity="0.35"/>
  <text x="1212" y="96" font-family="${FONT}" font-weight="bold" font-size="38" fill="#fde047">${esc(s.subtitle)}</text>
  ${[0, 1, 2].map((k) => `<path transform="translate(${60 + k * 64} 160)" d="M24 44 C 4 30 0 16 8 8 C 16 0 24 6 24 14 C 24 6 32 0 40 8 C 48 16 44 30 24 44 Z" fill="#ef4444"/>`).join("")}
</svg>`;
}

function browserScreen(s: ScreenSpec, c1: string, c2: string, i: number) {
  const rows = s.items.slice(0, 6);
  const chart = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => `${780 + k * 90},${860 - ((k * 37 + i * 23) % 150) - k * 28}`).join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000">${defs(c1, c2)}
  <rect width="1600" height="1000" fill="#e9ecf4"/>
  <rect x="0" y="0" width="1600" height="64" fill="#f8f9fc"/>
  <circle cx="36" cy="32" r="9" fill="#ff6b6b"/><circle cx="64" cy="32" r="9" fill="#ffd166"/><circle cx="92" cy="32" r="9" fill="#06d6a0"/>
  <rect x="420" y="16" width="760" height="32" rx="16" fill="#e5e8f0"/>
  <text x="800" y="39" text-anchor="middle" font-family="${FONT}" font-size="17" fill="#6b7390">localhost:3000/${esc(s.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}</text>
  <rect x="0" y="64" width="300" height="936" fill="#0f1222"/>
  <rect x="32" y="100" width="44" height="44" rx="12" fill="url(#bg)"/>
  <rect x="92" y="112" width="140" height="18" rx="9" fill="#fff" opacity="0.85"/>
  ${["Dashboard", "Produk", "Pesanan", "Pelanggan", "Laporan", "Pengaturan"].map((m, k) => `<rect x="20" y="${184 + k * 64}" width="260" height="48" rx="12" fill="${k === i % 6 ? c1 : "transparent"}" opacity="${k === i % 6 ? 0.9 : 1}"/><text x="48" y="${215 + k * 64}" font-family="${FONT}" font-size="20" fill="#fff" opacity="${k === i % 6 ? 1 : 0.6}">${m}</text>`).join("")}
  <text x="360" y="150" font-family="${FONT}" font-weight="bold" font-size="40" fill="#0f1222">${esc(s.title)}</text>
  <text x="362" y="190" font-family="${FONT}" font-size="21" fill="#6b7390">${esc(s.subtitle)}</text>
  <rect x="1330" y="116" width="220" height="56" rx="14" fill="url(#bg)"/><text x="1440" y="152" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="20" fill="#fff">+ Tambah</text>
  ${(s.stats ?? [["Total", "1.284"], ["Aktif", "342"], ["Baru", "57"]]).slice(0, 3).map(([l, v], k) => `<rect x="${360 + k * 400}" y="230" width="370" height="150" rx="22" fill="#fff"/><text x="${392 + k * 400}" y="286" font-family="${FONT}" font-size="21" fill="#6b7390">${esc(l)}</text><text x="${392 + k * 400}" y="346" font-family="${FONT}" font-weight="bold" font-size="42" fill="#0f1222">${esc(v)}</text>`).join("")}
  <rect x="360" y="410" width="360" height="540" rx="22" fill="#fff"/>
  ${rows.map((r, k) => `<rect x="384" y="${438 + k * 84}" width="48" height="48" rx="12" fill="${k % 2 ? c2 : c1}" opacity="0.2"/><text x="448" y="${470 + k * 84}" font-family="${FONT}" font-size="20" fill="#0f1222">${esc(r)}</text>`).join("")}
  <rect x="740" y="410" width="810" height="540" rx="22" fill="#fff"/>
  <text x="772" y="462" font-family="${FONT}" font-weight="bold" font-size="24" fill="#0f1222">Grafik 30 hari</text>
  ${[0, 1, 2, 3].map((k) => `<line x1="772" x2="1518" y1="${520 + k * 100}" y2="${520 + k * 100}" stroke="#eef0f6" stroke-width="2"/>`).join("")}
  <polyline points="${chart}" fill="none" stroke="${c1}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
  ${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => `<rect x="${790 + k * 90}" y="${880 - ((k * 29 + i * 17) % 120) - 30}" width="46" height="${((k * 29 + i * 17) % 120) + 30}" rx="8" fill="${c2}" opacity="0.35"/>`).join("")}
</svg>`;
}

function bookScreen(s: ScreenSpec, c1: string, c2: string, i: number) {
  const code = i % 2 === 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1400">${defs(c1, c2)}
  <rect width="1000" height="1400" fill="#fbfaf7"/>
  <rect width="1000" height="16" fill="url(#bg)"/>
  <text x="90" y="150" font-family="${FONT}" font-size="24" fill="${c2}" font-weight="bold">${esc(s.subtitle.toUpperCase())}</text>
  <text font-family="${FONT}" font-weight="bold" font-size="52" fill="#0f1222">${wrap(s.title, 26, 2).map((l, k) => `<tspan x="88" y="${230 + k * 66}">${esc(l)}</tspan>`).join("")}</text>
  ${[0, 1, 2, 3, 4, 5].map((k) => `<rect x="90" y="${380 + k * 36}" width="${k === 5 ? 420 : 820}" height="14" rx="7" fill="#d9dce6"/>`).join("")}
  ${code
    ? `<rect x="90" y="620" width="820" height="330" rx="20" fill="#0f1222"/>${s.items.slice(0, 7).map((line, k) => `<text x="126" y="${676 + k * 40}" font-family="DejaVu Sans Mono" font-size="22" fill="${["#93c5fd", "#fca5a5", "#86efac", "#fde68a"][k % 4]}">${esc(line)}</text>`).join("")}`
    : `<rect x="90" y="620" width="820" height="330" rx="20" fill="${c1}" opacity="0.1"/><rect x="90" y="620" width="10" height="330" fill="${c1}"/>${s.items.slice(0, 5).map((t, k) => `<circle cx="150" cy="${690 + k * 56}" r="12" fill="${c1}"/><text x="180" y="${698 + k * 56}" font-family="${FONT}" font-size="26" fill="#1e2235">${esc(t)}</text>`).join("")}`}
  ${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => `<rect x="90" y="${1010 + k * 36}" width="${k % 4 === 3 ? 520 : 820}" height="14" rx="7" fill="#d9dce6"/>`).join("")}
  <text x="500" y="1360" text-anchor="middle" font-family="${FONT}" font-size="20" fill="#9aa1b5">${12 + i * 7}</text>
</svg>`;
}

function gridScreen(s: ScreenSpec, c1: string, c2: string, i: number) {
  const palette = [c1, c2, "#f59e0b", "#10b981", "#ef4444", "#3b82f6"];
  const tiles = s.items.slice(0, 12).map((label, k) => {
    const x = 90 + (k % 4) * 360;
    const y = 190 + Math.floor(k / 4) * 260;
    const col = palette[(k + i) % palette.length]!;
    const shape = k % 3 === 0
      ? `<circle cx="${x + 160}" cy="${y + 90}" r="52" fill="${col}"/><circle cx="${x + 160}" cy="${y + 90}" r="24" fill="#fff" opacity="0.6"/>`
      : k % 3 === 1
        ? `<rect x="${x + 108}" y="${y + 40}" width="104" height="104" rx="30" fill="${col}"/><rect x="${x + 136}" y="${y + 68}" width="48" height="48" rx="12" fill="#fff" opacity="0.55"/>`
        : `<path d="M${x + 160} ${y + 34} L${x + 222} ${y + 146} H${x + 98} Z" fill="${col}"/><circle cx="${x + 160}" cy="${y + 108}" r="16" fill="#fff" opacity="0.6"/>`;
    return `<rect x="${x}" y="${y}" width="320" height="220" rx="28" fill="#fff"/>${shape}<text x="${x + 160}" y="${y + 196}" text-anchor="middle" font-family="${FONT}" font-size="22" fill="#39405a">${esc(label)}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000">
  <rect width="1600" height="1000" fill="#f1f3f8"/>
  <text x="90" y="110" font-family="${FONT}" font-weight="bold" font-size="42" fill="#0f1222">${esc(s.title)}</text>
  <text x="92" y="150" font-family="${FONT}" font-size="22" fill="#6b7390">${esc(s.subtitle)}</text>
  ${tiles}
</svg>`;
}

export async function makeScreenshot(visual: Visual, spec: ScreenSpec, c1: string, c2: string, index: number) {
  const svg =
    visual === "phone"
      ? phoneScreen(spec, c1, c2)
      : visual === "game"
        ? gameScreen(spec, c1, c2, index)
        : visual === "browser"
          ? browserScreen(spec, c1, c2, index)
          : visual === "book"
            ? bookScreen(spec, c1, c2, index)
            : gridScreen(spec, c1, c2, index);
  return toWebp(svg, 80);
}

// ─── File rilis demo ───────────────────────────────────────────────────────
const DEMO_NOTE = `FILE DEMO — RILISIN (PROTOTYPE)
================================
File ini dibuat otomatis oleh skrip seed untuk keperluan demo.
Isinya bukan aplikasi sungguhan dan tidak bisa dijalankan/diinstal.
`;

export function makeZip(files: Record<string, string>, padBytes = 0) {
  const entries: Zippable = {};
  for (const [name, content] of Object.entries(files)) entries[name] = [strToU8(content), { level: 6 }];
  if (padBytes > 0) entries["assets/demo-data.bin"] = [new Uint8Array(randomBytes(padBytes)), { level: 0 }];
  entries["BACA-SAYA-DEMO.txt"] = [strToU8(DEMO_NOTE), { level: 6 }];
  return Buffer.from(zipSync(entries));
}

export function makeApk(pkg: string, versionName: string, padBytes: number) {
  return makeZip(
    {
      "AndroidManifest.xml": `<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${pkg}" android:versionName="${versionName}">\n  <!-- placeholder demo, bukan manifest biner asli -->\n</manifest>\n`,
      "classes.dex": "dex\n035\u0000 placeholder demo",
      "resources.arsc": "placeholder demo",
      "META-INF/MANIFEST.MF": "Manifest-Version: 1.0\nCreated-By: rilisin-seed\n",
    },
    padBytes,
  );
}

export function makePdf(title: string, lines: string[]) {
  const ascii = (s: string) => s.normalize("NFKD").replace(/[^\x20-\x7e]/g, "");
  const pdfEsc = (s: string) => ascii(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const content = [
    "BT",
    "/F2 22 Tf",
    "72 740 Td",
    `(${pdfEsc(title)}) Tj`,
    "/F1 12 Tf",
    "0 -36 Td",
    ...lines.flatMap((l) => [`(${pdfEsc(l)}) Tj`, "0 -18 Td"]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
