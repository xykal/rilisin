"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "./ui";

/** Dropdown ringan berbasis <details>: tetap jalan tanpa JS, auto-tutup saat pindah halaman / klik di luar. */
export function Dropdown({
  summary,
  children,
  align = "right",
  className,
  panelClassName,
  label,
}: {
  summary: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
  panelClassName?: string;
  label: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname, searchParams]);

  useEffect(() => {
    function onPointer(e: MouseEvent) {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && ref.current) ref.current.open = false;
    }
    document.addEventListener("click", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <details ref={ref} className={cn("relative", className)}>
      <summary aria-label={label} className="cursor-pointer select-none rounded-xl">
        {summary}
      </summary>
      <div
        className={cn(
          "absolute z-50 mt-2 min-w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10",
          align === "right" ? "right-0" : "left-0",
          panelClassName,
        )}
      >
        {children}
      </div>
    </details>
  );
}
