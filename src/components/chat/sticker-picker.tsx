"use client";

import Image from "next/image";
import { useState } from "react";
import { STICKER_PACKS } from "@/lib/chat/stickers";
import { cn } from "../ui";

/** Panel pilih stiker: tab pak + grid. Ketuk = langsung kirim (ala WA). */
export function StickerPicker({ onPick }: { onPick: (key: string) => void }) {
  const [packId, setPackId] = useState(STICKER_PACKS[0]?.id ?? "");
  const pack = STICKER_PACKS.find((x) => x.id === packId) ?? STICKER_PACKS[0];
  if (!pack) return null;
  return (
    <div className="anim-slide-up mb-2 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-lg">
      <div className="flex gap-1 border-b border-slate-100 pb-2" role="tablist" aria-label="Paket stiker">
        {STICKER_PACKS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={x.id === pack.id}
            onClick={() => setPackId(x.id)}
            className={cn(
              "min-h-[36px] rounded-full px-3 text-xs font-bold",
              x.id === pack.id ? "bg-brand-100 text-brand-700" : "text-slate-500 hover:bg-slate-100",
            )}
          >
            {x.name}
          </button>
        ))}
      </div>
      <div className="grid max-h-56 grid-cols-4 gap-1 overflow-y-auto pt-2" role="tabpanel">
        {pack.stickers.map((s) => (
          <button
            key={s.id}
            type="button"
            title={s.label}
            aria-label={`Kirim stiker ${s.label}`}
            onClick={() => onPick(`${pack.id}/${s.id}`)}
            className="rounded-xl p-1 transition hover:bg-slate-100 active:scale-95"
          >
            <Image src={`/stickers/${pack.id}/${s.file}`} alt={s.label} width={96} height={96} className="h-auto w-full" loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}
