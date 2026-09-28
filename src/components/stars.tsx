import { Star } from "lucide-react";
import { cn } from "./ui";

/** Tampilan bintang (bisa pecahan, mis. 4,6). */
export function Stars({ value, size = 16, className, label }: { value: number; size?: number; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  const text = label ?? `Rating ${value.toLocaleString("id-ID", { maximumFractionDigits: 1 })} dari 5`;
  const row = (cls: string) => (
    <span className={cn("flex", cls)} style={{ gap: Math.round(size * 0.12) }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} className="shrink-0" style={{ width: size, height: size }} fill="currentColor" strokeWidth={0} />
      ))}
    </span>
  );
  return (
    <span role="img" aria-label={text} title={text} className={cn("relative inline-flex shrink-0 align-middle", className)}>
      {row("text-slate-200")}
      <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${pct}%` }} aria-hidden="true">
        {row("text-amber-400")}
      </span>
    </span>
  );
}

/** Ringkasan kecil untuk kartu produk: ★ 4,7 (12). */
export function RatingPill({ sum, count, className }: { sum: number; count: number; className?: string }) {
  if (!count) return null;
  const avg = Math.round((sum / count) * 10) / 10;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold text-slate-600", className)} title={`${count} ulasan`}>
      <Star className="h-3.5 w-3.5 text-amber-400" fill="currentColor" strokeWidth={0} />
      {avg.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
      <span className="font-normal text-slate-400">({count})</span>
    </span>
  );
}
