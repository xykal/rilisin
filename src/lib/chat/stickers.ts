/** Katalog stiker bawaan. Berkas di public/stickers/<pack>/<file>. Dipakai server (validasi) & browser (picker). */
export type StickerPack = { id: string; name: string; stickers: { id: string; file: string; label: string }[] };

export const STICKER_PACKS: StickerPack[] = [
  {
    id: "kancil",
    name: "Si Kancil",
    stickers: [
      { id: "halo", file: "halo.png", label: "Halo!" },
      { id: "makasih", file: "makasih.png", label: "Makasih!" },
      { id: "haha", file: "haha.png", label: "Haha" },
      { id: "semangat", file: "semangat.png", label: "Semangat!" },
      { id: "setuju", file: "setuju.png", label: "Setuju" },
      { id: "mikir", file: "mikir.png", label: "Mikir dulu" },
      { id: "keren", file: "keren.png", label: "Keren!" },
      { id: "sabar", file: "sabar.png", label: "Sabar ya" },
    ],
  },
];

/** Kunci stiker format "pack/id". Kembali null kalau tidak dikenal (jangan percaya input user/API). */
export function parseStickerKey(key: string): { pack: string; id: string; url: string; label: string } | null {
  const m = /^([a-z0-9-]{1,20})\/([a-z0-9-]{1,20})$/.exec(key);
  if (!m) return null;
  const pack = STICKER_PACKS.find((x) => x.id === m[1]);
  const s = pack?.stickers.find((x) => x.id === m[2]);
  if (!pack || !s) return null;
  return { pack: pack.id, id: s.id, url: `/stickers/${pack.id}/${s.file}`, label: s.label };
}
