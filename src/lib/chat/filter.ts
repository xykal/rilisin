import "server-only";

/**
 * Filter konten chat sisi server. Fokus: promosi judi online (judol) — spam paling umum di
 * komunitas Indonesia dan dilarang keras (UU ITE & penindakan Komdigi).
 * Teks dinormalisasi dulu: huruf kecil, buang aksen, angka "leet" (5l0t → slot), buang spasi/simbol.
 */
const LEET: Record<string, string> = { "0": "o", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g", "@": "a", $: "s", "!": "i", "|": "l" };

/** "1" bisa berarti i (m4xw1n) atau l (5l0t/s1ot) → hasilkan dua varian. */
function squashVariants(text: string) {
  const base = text.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "");
  return ["i", "l"].map((one) =>
    base.replace(/[0-9@$!|]/g, (c) => (c === "1" ? one : (LEET[c] ?? c))).replace(/[^a-z]/g, ""),
  );
}

function squashDigits(text: string) {
  return text.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]/g, "");
}

/** Istilah yang hampir pasti promosi judol (setelah dinormalisasi). */
const STRONG_TERMS = [
  "slotgacor", "gacormaxwin", "maxwin", "situsslot", "slotonline", "agenslot", "daftarslot", "bocoranslot",
  "polaslot", "rtpslot", "rtplive", "scatterhitam", "mahjongways", "bonusnewmember", "depositpulsa",
  "depopulsa", "wdlancar", "antirungkad", "situstogel", "bandartogel", "togelonline", "bandarjudi",
  "agenjudi", "judionline", "judibola", "sbobet", "pragmaticplay", "slotdemo", "linkslot",
];
const STRONG_DIGIT_TERMS = ["slot88", "slot777", "slot303", "togel4d", "hk4d", "sgp4d"];
const SLOT_COMBO = ["gacor", "maxwin", "rtp", "scatter", "deposit", "jackpot", "zeus", "olympus"];

export function detectGamblingPromo(text: string) {
  const d = squashDigits(text);
  if (STRONG_DIGIT_TERMS.some((t) => d.includes(t))) return true;
  return squashVariants(text).some(
    (s) =>
      STRONG_TERMS.some((t) => s.includes(t)) ||
      (s.includes("slot") && SLOT_COMBO.some((t) => s.includes(t))),
  );
}

/** Kunci pembanding untuk mendeteksi pesan yang sama dikirim berulang (flood). */
export function duplicateKey(text: string) {
  return squashDigits(text).slice(0, 200);
}
