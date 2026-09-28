import { readUnsubscribeToken, setEmailPrefs } from "@/lib/notifications/server";

/**
 * Berhenti berlangganan satu klik (RFC 8058) — dipanggil server Gmail/Yahoo, bukan browser user.
 * Tanpa sesi & tanpa cek Origin; otorisasinya token HMAC per user+kategori di URL.
 */
export async function POST(req: Request) {
  const t = readUnsubscribeToken(new URL(req.url).searchParams.get("t"));
  if (!t) return new Response("Token tidak valid", { status: 400, headers: { "Cache-Control": "no-store" } });
  await setEmailPrefs(t.userId, { [t.category]: false });
  return new Response("Berhenti berlangganan berhasil", { status: 200, headers: { "Cache-Control": "no-store" } });
}
