"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

const UI_SCALES = ["kecil", "normal", "besar"] as const;

/** Skala tampilan (cookie 1 tahun): kecil 15px / normal 16px / besar 18px di root — seluruh UI rem ikut membesar. */
export async function setUiScaleAction(formData: FormData) {
  const v = String(formData.get("scale") ?? "");
  const jar = await cookies();
  if ((UI_SCALES as readonly string[]).includes(v)) {
    jar.set("ui-scale", v, { path: "/", maxAge: 365 * 24 * 3600, sameSite: "lax" });
  }
  revalidatePath("/", "layout");
}
