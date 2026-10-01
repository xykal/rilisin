import { cn } from "./ui";

/**
 * Logo Rilisin dari brand kit resmi (public/brand/*.svg).
 * - LogoMark: ikon "R" statis (mark) — auth pages, avatar fallback, tempat sempit.
 * - Logo: lockup ANIMASI (mark + teks, CSS/SMIL di dalam SVG jalan otomatis di <img>).
 *   Varian navbar (default, header) / footer — masing-masing ada light & dark.
 *   Animasi HANYA di header & footer; tempat lain statis.
 */
export function LogoMark({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- SVG statis brand kit, bukan konten dinamis
  return <img src="/brand/rilisin-icon.svg" alt="Rilisin" width={32} height={32} className={cn("h-8 w-8", className)} />;
}

export function Logo({ className, dark = false, footer = false }: { className?: string; dark?: boolean; footer?: boolean }) {
  const file = `${footer ? "rilisin-footer-logo" : "rilisin-navbar-logo"}-${dark ? "dark" : "light"}.svg`;
  const dims = footer ? { width: 520, height: 148 } : { width: 450, height: 116 };
  // eslint-disable-next-line @next/next/no-img-element -- SVG animasi mandiri brand kit
  return <img src={`/brand/${file}`} alt="Rilisin" width={dims.width} height={dims.height} className={cn("h-8 w-auto", className)} />;
}
