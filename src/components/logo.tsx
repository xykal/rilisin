import { SITE } from "@/lib/config";
import { cn } from "./ui";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("h-8 w-8", className)}>
      <defs>
        <linearGradient id="rilisin-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c6cff" />
          <stop offset="1" stopColor="#4b34d9" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#rilisin-g)" />
      {/* kotak terbuka + panah keluar = "merilis" */}
      <path d="M9 17.5v5.2c0 .7.6 1.3 1.3 1.3h11.4c.7 0 1.3-.6 1.3-1.3v-5.2" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M16 19V8.5m0 0-4.2 4.2M16 8.5l4.2 4.2" fill="none" stroke="#ffd166" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-lg font-extrabold tracking-tight text-ink">{SITE.name}</span>
    </span>
  );
}
