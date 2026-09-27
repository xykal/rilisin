"use server";

import { or, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fakePasswordCheck, hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { RESERVED_USERNAMES } from "@/lib/config";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getClientIp } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { safeNextPath } from "@/lib/slug";
import { fieldErrorsFrom, type FormState } from "./form-state";

const registerSchema = z.object({
  displayName: z.string().trim().min(2, "Nama minimal 2 karakter").max(50, "Nama maksimal 50 karakter"),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{2,19}$/, "3–20 karakter: huruf kecil, angka, atau _ (diawali huruf)"),
  email: z.string().trim().toLowerCase().max(200).pipe(z.email("Format email tidak valid")),
  password: z.string().min(8, "Password minimal 8 karakter").max(200, "Password terlalu panjang"),
});

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ip = await getClientIp();
  const rl = rateLimit(`register:${ip}`, 10, 60 * 60 * 1000);
  if (!rl.ok) return { error: "Terlalu banyak percobaan daftar. Coba lagi nanti." };

  const values = {
    displayName: String(formData.get("displayName") ?? ""),
    username: String(formData.get("username") ?? ""),
    email: String(formData.get("email") ?? ""),
  };
  const parsed = registerSchema.safeParse({ ...values, password: formData.get("password") ?? "" });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };

  const { displayName, username, email, password } = parsed.data;
  if (RESERVED_USERNAMES.has(username)) {
    return { fieldErrors: { username: "Username ini tidak bisa dipakai" }, values };
  }

  const existing = await db
    .select({ email: users.email, username: users.username })
    .from(users)
    .where(or(sql`lower(${users.email}) = ${email}`, sql`lower(${users.username}) = ${username}`));
  const fieldErrors: Record<string, string> = {};
  if (existing.some((u) => u.email.toLowerCase() === email)) fieldErrors.email = "Email sudah terdaftar — silakan masuk";
  if (existing.some((u) => u.username.toLowerCase() === username)) fieldErrors.username = "Username sudah dipakai";
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  let userId: string;
  try {
    const [user] = await db
      .insert(users)
      .values({ email, username, displayName, passwordHash: await hashPassword(password) })
      .returning({ id: users.id });
    userId = user!.id;
  } catch {
    return { error: "Gagal membuat akun (mungkin email/username baru saja dipakai). Coba lagi.", values };
  }

  await createSession(userId);
  redirect(safeNextPath(formData.get("next"), "/"));
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const identifier = String(formData.get("identifier") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const values = { identifier };
  if (!identifier || !password) return { error: "Isi email/username dan password.", values };

  const ip = await getClientIp();
  const rlIp = rateLimit(`login-ip:${ip}`, 30, 10 * 60 * 1000);
  const rlId = rateLimit(`login-id:${identifier}`, 10, 10 * 60 * 1000);
  if (!rlIp.ok || !rlId.ok) {
    return { error: "Terlalu banyak percobaan masuk. Tunggu beberapa menit lalu coba lagi.", values };
  }

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash, bannedAt: users.bannedAt })
    .from(users)
    .where(
      identifier.includes("@")
        ? sql`lower(${users.email}) = ${identifier}`
        : sql`lower(${users.username}) = ${identifier}`,
    )
    .limit(1);

  const valid = user?.passwordHash
    ? await verifyPassword(password, user.passwordHash)
    : await fakePasswordCheck();
  if (!user || !valid) return { error: "Email/username atau password salah.", values };
  if (user.bannedAt) return { error: "Akun ini sedang dinonaktifkan. Hubungi admin.", values };

  await createSession(user.id);
  redirect(safeNextPath(formData.get("next"), "/"));
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}
