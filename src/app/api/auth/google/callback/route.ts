import { NextResponse, type NextRequest } from "next/server";
import { finishGoogleLogin } from "@/lib/auth/oauth";
import { getClientIp } from "@/lib/http";
import { sharedLimit } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security/events";

/**
 * Langkah 2 login Google: Google mengembalikan `code` + `state` di sini.
 * Semua kegagalan dialihkan ke /masuk dengan kode generik (jangan bocorkan apa pun
 * ke penyerang, dan jangan bocorkan ke pengguna jujur detail yang bisa dipakai).
 */
export async function GET(request: NextRequest) {
  const ip = await getClientIp();
  if (!(await sharedLimit(`oauth-callback:${ip}`, 30, 10 * 60 * 1000)).ok) {
    return NextResponse.redirect(new URL("/masuk?oauth=terlalu-banyak", request.url));
  }

  const code = request.nextUrl.searchParams.get("code")?.slice(0, 2000) ?? "";
  const state = request.nextUrl.searchParams.get("state")?.slice(0, 200) ?? "";
  if (!code || !state) {
    return NextResponse.redirect(new URL("/masuk?oauth=gagal", request.url));
  }

  const result = await finishGoogleLogin(code, state);
  if (result.ok) return NextResponse.redirect(new URL(result.next, request.url));
  await logSecurityEvent("oauth_rejected", { meta: { provider: "google", reason: result.error }, req: request });
  return NextResponse.redirect(new URL(result.next, request.url));
}
