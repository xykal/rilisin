"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Sembunyikan elemen (misal footer) di rute tertentu — dipakai supaya chat tampil penuh seperti aplikasi. */
export function HideOnRoutes({ pattern, children }: { pattern: string; children: ReactNode }) {
  const pathname = usePathname();
  if (new RegExp(pattern).test(pathname)) return null;
  return <>{children}</>;
}
