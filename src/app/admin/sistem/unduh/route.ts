import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { BACKUP_PREFIX } from "@/lib/backup";
import { logSecurityEvent } from "@/lib/security/events";
import { storage, storageDriverName } from "@/lib/storage";

/** Unduh file backup TERENKRIPSI (untuk salinan offline). Isinya hanya bisa dibuka dengan kunci privat pemilik. Khusus admin. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("Tidak ditemukan", { status: 404 });
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!key.startsWith(BACKUP_PREFIX) || !/^private\/backups\/rilisin-[0-9-]+\.rlsbak$/.test(key)) return new Response("Tidak ditemukan", { status: 404 });
  await logSecurityEvent("admin_maintenance", { userId: user.id, meta: { download: key } });
  const filename = key.split("/").pop()!;
  if (storageDriverName() === "local") {
    const data = await storage().read(key).catch(() => null);
    if (!data) return new Response("Tidak ditemukan", { status: 404 });
    return new Response(new Uint8Array(data), { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
  }
  const url = await storage().downloadUrl(key, { filename, userId: user.id, ttlSec: 300 });
  return new NextResponse(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store" } });
}
