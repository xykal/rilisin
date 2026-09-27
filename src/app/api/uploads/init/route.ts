import { getCurrentUser } from "@/lib/auth/current-user";
import { isSameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { UploadError, initUpload } from "@/lib/uploads";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return Response.json({ error: "Origin tidak diizinkan" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Silakan masuk dulu" }, { status: 401 });

  const rl = rateLimit(`upload-init:${user.id}`, 60, 10 * 60 * 1000);
  if (!rl.ok) return Response.json({ error: "Terlalu banyak upload. Coba lagi sebentar." }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body tidak valid" }, { status: 400 });
  }

  try {
    const result = await initUpload(user, {
      purpose: String(body.purpose ?? ""),
      targetId: String(body.targetId ?? ""),
      filename: String(body.filename ?? ""),
      size: Number(body.size),
      platform: body.platform ? String(body.platform) : undefined,
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof UploadError) return Response.json({ error: err.message }, { status: err.status });
    console.error("upload init error", err);
    return Response.json({ error: "Terjadi kesalahan server" }, { status: 500 });
  }
}
