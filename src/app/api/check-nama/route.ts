import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getClientIp } from "@/lib/http";
import { checkName } from "@/lib/names";
import { sharedLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Live-check ketersediaan username / nama toko (?tipe=username|toko&nilai=...). Pemilik toko boleh menyimpan namanya sendiri. */
export async function GET(req: Request) {
  const ip = await getClientIp();
  const rl = await sharedLimit(`check-nama:${ip}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ tersedia: false, pesan: "Terlalu sering. Tunggu sebentar." }, { status: 429 });
  const { searchParams } = new URL(req.url);
  const tipe = searchParams.get("tipe");
  const nilai = (searchParams.get("nilai") ?? "").slice(0, 60);
  if (tipe !== "username" && tipe !== "toko") return NextResponse.json({ tersedia: false, pesan: "Tipe harus username atau toko." }, { status: 400 });
  const user = await getCurrentUser().catch(() => null);
  return NextResponse.json(await checkName(tipe, nilai, user?.id ?? null));
}
