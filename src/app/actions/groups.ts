"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { chatMembers, chatRooms } from "@/lib/db/schema";
import { sharedLimit } from "@/lib/rate-limit";
import { fieldErrorsFrom, type FormState } from "./form-state";

const groupSchema = z.object({
  name: z.string().trim().min(2, "Nama grup minimal 2 karakter").max(40, "Maksimal 40 karakter"),
  emoji: z
    .string()
    .trim()
    .max(8)
    .transform((v) => v || "💬"),
  description: z
    .string()
    .trim()
    .max(200, "Maksimal 200 karakter")
    .transform((v) => v || ""),
});

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return `${base || "grup"}-${randomBytes(2).toString("hex")}`;
}

/** Bikin grup chat baru. Grup privat dapat kode invite + sembunyi dari daftar publik. Pembuat otomatis jadi anggota. */
export async function createGroupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Masuk dulu untuk bikin grup." };
  const values = {
    name: String(formData.get("name") ?? ""),
    emoji: String(formData.get("emoji") ?? ""),
    description: String(formData.get("description") ?? ""),
  };
  const rl = await sharedLimit(`buat-grup:${user.id}`, 5, 60 * 60_000);
  if (!rl.ok) return { error: "Terlalu sering bikin grup. Coba lagi nanti.", values };
  const parsed = groupSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };
  const isPrivate = formData.get("isPrivate") === "on";
  const inviteCode = isPrivate ? randomBytes(9).toString("base64url") : null;
  // Slug acak 2 byte: tabrakan praktis tidak mungkin, tapi tetap coba ulang 3× kalau apes.
  let slug = "";
  for (let i = 0; i < 3; i++) {
    slug = slugify(parsed.data.name);
    try {
      const [room] = await db
        .insert(chatRooms)
        .values({
          slug,
          name: parsed.data.name,
          emoji: parsed.data.emoji,
          description: parsed.data.description,
          kind: "public",
          isPrivate,
          inviteCode,
          ownerId: user.id,
        })
        .returning({ id: chatRooms.id });
      await db.insert(chatMembers).values({ roomId: room!.id, userId: user.id }).onConflictDoNothing();
      break;
    } catch {
      slug = "";
    }
  }
  if (!slug) return { error: "Gagal bikin grup. Coba lagi.", values };
  revalidatePath("/komunitas");
  // Grup privat: redirect bawa ?invite= (pembuat auto-join idempoten → landing di URL bersih).
  redirect(`/komunitas/${slug}${isPrivate && inviteCode ? `?invite=${inviteCode}` : ""}`);
}
