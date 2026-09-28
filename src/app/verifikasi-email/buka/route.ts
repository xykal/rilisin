import { NextResponse } from "next/server";
import { findValidVerification, setVerifyCookie } from "@/lib/auth/email-verification";

const seeOther = (location: string) =>
  new NextResponse(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

/**
 * Link dari email verifikasi. Token dipindah ke cookie httpOnly (path /verifikasi-email)
 * lalu redirect ke URL tanpa token, supaya token tidak tertinggal di riwayat browser atau
 * header Referer. Token belum dipakai di sini: pemindai link email yang membuka URL ini
 * tidak menghanguskannya, dan verifikasi tetap butuh konfirmasi pengguna.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const valid = await findValidVerification(token);
  if (!valid || !token) return seeOther("/verifikasi-email?kedaluwarsa=1");
  await setVerifyCookie(token);
  return seeOther("/verifikasi-email");
}
