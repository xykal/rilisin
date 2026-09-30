import { cn } from "./ui";

/**
 * Logo Rilisin dari brand kit resmi (public/brand/*.svg).
 * - LogoMark: ikon "R" (mark) — auth pages, avatar fallback, tempat sempit.
 * - Logo: lockup horizontal (mark + wordmark) — header & footer (latar terang).
 */
export function LogoMark({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- SVG statis brand kit, bukan konten dinamis
  return <img src="/brand/rilisin-icon.svg" alt="Rilisin" width={32} height={32} className={cn("h-8 w-8", className)} />;
}

export function Logo({ className, dark = false }: { className?: string; dark?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element -- SVG statis brand kit, bukan konten dinamis
  return (
    <img
      src={dark ? "/brand/rilisin-logo-horizontal-dark.svg" : "/brand/rilisin-logo-horizontal-light.svg"}
      alt="Rilisin"
      width={140}
      height={32}
      className={cn("h-8 w-auto", className)}
    />
  );
}
