import { NextResponse } from "next/server";
import { findValidReset, setResetCookie } from "@/lib/auth/password-reset";

const seeOther = (location: string) => new NextResponse(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

/**
 * Link dari email. Token dipindah ke cookie httpOnly (path /atur-ulang-password) lalu redirect ke URL tanpa token,
 * supaya token tidak tertinggal di riwayat browser / header Referer. Token belum dipakai di sini
 * (pemindai link email yang membuka URL ini tidak menghanguskannya).
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const valid = await findValidReset(token);
  if (!valid || !token) return seeOther("/lupa-password?kedaluwarsa=1");
  await setResetCookie(token);
  return seeOther("/atur-ulang-password");
}
