"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { fieldErrorsFrom, type FormState } from "./form-state";

const profileSchema = z.object({
  displayName: z.string().trim().min(2, "Nama minimal 2 karakter").max(50, "Nama maksimal 50 karakter"),
  bio: z.string().trim().max(300, "Bio maksimal 300 karakter"),
});

/** Edit profil (nama tampil + bio). Username disengaja tidak bisa diubah (dipakai URL & mention). */
export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Masuk dulu." };
  const values = {
    displayName: String(formData.get("displayName") ?? ""),
    bio: String(formData.get("bio") ?? ""),
  };
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };
  await db
    .update(users)
    .set({ displayName: parsed.data.displayName, bio: parsed.data.bio || null })
    .where(eq(users.id, user.id));
  revalidatePath("/akun/profil");
  revalidatePath(`/u/${user.username}`);
  revalidatePath("/", "layout");
  return { success: "Profil tersimpan." };
}
