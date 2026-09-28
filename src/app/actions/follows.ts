"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ContentError } from "@/lib/community/guard";
import { toggleFollow } from "@/lib/follows";

const schema = z.object({ targetType: z.enum(["seller", "product"]), targetId: z.string().uuid(), path: z.string().max(300) });

/** Ikuti / berhenti mengikuti seller atau produk (form biasa — jalan tanpa JavaScript). */
export async function followAction(formData: FormData) {
  const user = await getCurrentUser();
  const parsed = schema.safeParse({ targetType: formData.get("targetType"), targetId: formData.get("targetId"), path: formData.get("path") ?? "/" });
  if (!user || !parsed.success) return;
  try {
    await toggleFollow(user, parsed.data.targetType, parsed.data.targetId);
  } catch (e) {
    if (!(e instanceof ContentError)) throw e;
  }
  const path = parsed.data.path.startsWith("/") && !parsed.data.path.startsWith("//") ? parsed.data.path : "/";
  revalidatePath(path);
  revalidatePath("/akun/diikuti");
}
