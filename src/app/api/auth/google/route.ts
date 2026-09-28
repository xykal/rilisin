import { NextResponse, type NextRequest } from "next/server";
import { googleConfig, startGoogleLogin } from "@/lib/auth/oauth";
import { safeNextPath } from "@/lib/slug";

/**
 * Langkah 1 login Google: arahkan pengguna ke halaman izin Google.
 * Hanya dipakai kalau GOOGLE_CLIENT_ID/SECRET sudah diisi — kalau belum, balik ke
 * /masuk dengan pesan jujur daripada menampilkan tombol yang pasti gagal.
 */
export async function GET(request: NextRequest) {
  const cfg = googleConfig();
  if (!cfg) return NextResponse.redirect(new URL("/masuk?oauth=belum-aktif", request.url));

  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const { state, challenge } = await startGoogleLogin(next);

  const url = new URL(cfg.authUrl);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return NextResponse.redirect(url);
}
