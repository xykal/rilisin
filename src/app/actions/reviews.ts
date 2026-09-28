"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser, isStaff } from "@/lib/auth/current-user";
import { hideContent, restoreContent } from "@/lib/community/reports";
import { ContentError } from "@/lib/community/guard";
import { db } from "@/lib/db";
import { productReviews, products } from "@/lib/db/schema";
import { deleteReview, deleteReviewReply, replyToReview, saveReview } from "@/lib/reviews";
import { eq } from "drizzle-orm";
import type { FormState } from "./form-state";

const uuid = z.string().uuid();

function refresh(slug: string | null | undefined) {
  if (!slug) return;
  revalidatePath(`/p/${slug}`);
  revalidatePath(`/p/${slug}/ulasan`);
}

function contentError(e: unknown, values: Record<string, string>): FormState {
  if (e instanceof ContentError) return { error: e.message, fieldErrors: e.field ? { [e.field]: e.message } : undefined, values };
  throw e;
}

export async function saveReviewAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Masuk dulu untuk memberi ulasan." };
  const productId = uuid.safeParse(formData.get("productId"));
  if (!productId.success) return { error: "Produk tidak valid." };
  const rating = String(formData.get("rating") ?? "");
  const body = String(formData.get("body") ?? "").slice(0, 5000);
  try {
    const r = await saveReview(user, productId.data, { rating: Number(rating), body });
    refresh(r.slug);
    return { success: r.created ? "Terima kasih! Ulasanmu sudah tayang." : "Ulasan diperbarui." };
  } catch (e) {
    return contentError(e, { rating, body });
  }
}

export async function deleteReviewAction(formData: FormData) {
  const user = await getCurrentUser();
  const productId = uuid.safeParse(formData.get("productId"));
  if (!user || !productId.success) return;
  refresh(await deleteReview(user, productId.data));
}

export async function replyReviewAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Masuk dulu." };
  const reviewId = uuid.safeParse(formData.get("reviewId"));
  if (!reviewId.success) return { error: "Ulasan tidak valid." };
  const reply = String(formData.get("reply") ?? "").slice(0, 4000);
  try {
    const r = await replyToReview(user, reviewId.data, reply);
    refresh(r.slug);
    return { success: "Balasan tersimpan." };
  } catch (e) {
    return contentError(e, { reply });
  }
}

export async function deleteReviewReplyAction(formData: FormData) {
  const user = await getCurrentUser();
  const reviewId = uuid.safeParse(formData.get("reviewId"));
  if (!user || !reviewId.success) return;
  refresh(await deleteReviewReply(user, reviewId.data));
}

/** Moderator: sembunyikan / pulihkan ulasan langsung dari halaman produk. */
export async function moderateReviewAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) return;
  const reviewId = uuid.safeParse(formData.get("reviewId"));
  if (!reviewId.success) return;
  const action = formData.get("action");
  if (action === "hide") await hideContent(user.id, "review", reviewId.data, String(formData.get("reason") ?? ""));
  else if (action === "restore") await restoreContent(user.id, "review", reviewId.data);
  const [p] = await db
    .select({ slug: products.slug })
    .from(productReviews)
    .innerJoin(products, eq(products.id, productReviews.productId))
    .where(eq(productReviews.id, reviewId.data));
  refresh(p?.slug);
  revalidatePath("/admin", "layout");
}
