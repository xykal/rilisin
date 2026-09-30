import { revalidatePath } from "next/cache";
import { authBearer } from "@/lib/api-keys";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isSameOrigin } from "@/lib/http";
import { UploadError, completeUpload } from "@/lib/uploads";

export async function POST(req: Request) {
  // Dual-auth: session browser (wajib same-origin) ATAU API key seller:write (AI agent, tanpa origin).
  const via = await authBearer(req);
  if (!via && !isSameOrigin(req)) return Response.json({ error: "Origin tidak diizinkan" }, { status: 403 });
  const user = via?.user ?? (await getCurrentUser());
  if (!user) return Response.json({ error: "Silakan masuk dulu" }, { status: 401 });
  if (via && !via.scopes.includes("seller:write")) return Response.json({ error: "API key butuh scope seller:write." }, { status: 403 });

  let token = "";
  try {
    token = String((await req.json()).token ?? "");
  } catch {
    return Response.json({ error: "Body tidak valid" }, { status: 400 });
  }

  try {
    const result = await completeUpload(user, token);
    revalidatePath("/seller", "layout");
    return Response.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof UploadError) return Response.json({ error: err.message }, { status: err.status });
    console.error("upload complete error", err);
    return Response.json({ error: "Gagal memproses file" }, { status: 500 });
  }
}
