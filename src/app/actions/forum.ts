"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser, isStaff } from "@/lib/auth/current-user";
import { ContentError } from "@/lib/community/guard";
import { hideContent, restoreContent } from "@/lib/community/reports";
import { threadPath } from "@/lib/community/shared";
import { db } from "@/lib/db";
import { forumCategories, forumReplies, forumThreads } from "@/lib/db/schema";
import {
  createReply,
  createThread,
  deleteReply,
  deleteThread,
  moderateThread,
  setAcceptedAnswer,
  toggleVote,
  updateReply,
  updateThread,
} from "@/lib/forum";
import { checkFormGuard } from "@/lib/security/form-guard";
import type { FormState } from "./form-state";

const uuid = z.string().uuid();

function fail(e: unknown, values: Record<string, string>): FormState {
  if (e instanceof ContentError) return { error: e.message, fieldErrors: e.field ? { [e.field]: e.message } : undefined, values };
  throw e;
}

function refreshForum(threadId?: string) {
  if (threadId) revalidatePath(threadPath(threadId));
  revalidatePath("/forum", "layout");
}

export async function createThreadAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Masuk dulu untuk membuat thread." };
  const values = {
    categoryId: String(formData.get("categoryId") ?? ""),
    title: String(formData.get("title") ?? "").slice(0, 400),
    body: String(formData.get("body") ?? "").slice(0, 25_000),
    productId: String(formData.get("productId") ?? ""),
  };
  if (!checkFormGuard(formData, { minMs: 3000 })) return { error: "Form terlalu cepat dikirim atau kedaluwarsa. Muat ulang halaman lalu coba lagi.", values };
  if (!uuid.safeParse(values.categoryId).success) return { error: "Pilih kategori.", fieldErrors: { categoryId: "Pilih kategori." }, values };
  let id: string;
  try {
    ({ id } = await createThread(user, {
      categoryId: values.categoryId,
      title: values.title,
      body: values.body,
      productId: uuid.safeParse(values.productId).success ? values.productId : null,
    }));
  } catch (e) {
    return fail(e, values);
  }
  refreshForum();
  redirect(threadPath(id));
}

export async function updateThreadAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Masuk dulu." };
  const threadId = uuid.safeParse(formData.get("threadId"));
  if (!threadId.success) return { error: "Thread tidak valid." };
  const values = { title: String(formData.get("title") ?? "").slice(0, 400), body: String(formData.get("body") ?? "").slice(0, 25_000) };
  try {
    await updateThread(user, threadId.data, values);
  } catch (e) {
    return fail(e, values);
  }
  refreshForum(threadId.data);
  redirect(threadPath(threadId.data));
}

export async function deleteThreadAction(formData: FormData) {
  const user = await getCurrentUser();
  const threadId = uuid.safeParse(formData.get("threadId"));
  if (!user || !threadId.success) return;
  const [cat] = await db
    .select({ slug: forumCategories.slug })
    .from(forumThreads)
    .innerJoin(forumCategories, eq(forumCategories.id, forumThreads.categoryId))
    .where(eq(forumThreads.id, threadId.data));
  try {
    await deleteThread(user, threadId.data);
  } catch (e) {
    if (e instanceof ContentError) return;
    throw e;
  }
  refreshForum(threadId.data);
  redirect(`/forum/${cat?.slug ?? ""}?dihapus=1`);
}

export async function replyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Masuk dulu untuk membalas." };
  const threadId = uuid.safeParse(formData.get("threadId"));
  if (!threadId.success) return { error: "Thread tidak valid." };
  const body = String(formData.get("body") ?? "").slice(0, 12_000);
  const parentId = uuid.safeParse(formData.get("parentId"));
  let url: string;
  try {
    ({ url } = await createReply(user, threadId.data, body, parentId.success ? parentId.data : null));
  } catch (e) {
    return fail(e, { body });
  }
  refreshForum(threadId.data);
  redirect(url);
}

export async function updateReplyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Masuk dulu." };
  const replyId = uuid.safeParse(formData.get("replyId"));
  if (!replyId.success) return { error: "Balasan tidak valid." };
  const body = String(formData.get("body") ?? "").slice(0, 12_000);
  let r: { threadId: string; url: string };
  try {
    r = await updateReply(user, replyId.data, body);
  } catch (e) {
    return fail(e, { body });
  }
  refreshForum(r.threadId);
  redirect(r.url);
}

export async function deleteReplyAction(formData: FormData) {
  const user = await getCurrentUser();
  const replyId = uuid.safeParse(formData.get("replyId"));
  if (!user || !replyId.success) return;
  try {
    const r = await deleteReply(user, replyId.data);
    refreshForum(r.threadId);
  } catch (e) {
    if (!(e instanceof ContentError)) throw e;
  }
}

export async function voteAction(formData: FormData) {
  const user = await getCurrentUser();
  const targetId = uuid.safeParse(formData.get("targetId"));
  const targetType = formData.get("targetType");
  if (!user || !targetId.success || (targetType !== "thread" && targetType !== "reply")) return;
  try {
    const r = await toggleVote(user, targetType, targetId.data);
    refreshForum(r.threadId);
  } catch (e) {
    if (!(e instanceof ContentError)) throw e;
  }
}

export async function acceptAnswerAction(formData: FormData) {
  const user = await getCurrentUser();
  const threadId = uuid.safeParse(formData.get("threadId"));
  if (!user || !threadId.success) return;
  const replyId = uuid.safeParse(formData.get("replyId"));
  try {
    await setAcceptedAnswer(user, threadId.data, replyId.success ? replyId.data : null);
  } catch (e) {
    if (!(e instanceof ContentError)) throw e;
  }
  refreshForum(threadId.data);
}

/** Moderator: sematkan / kunci / sembunyikan thread. */
export async function moderateThreadAction(formData: FormData) {
  const user = await getCurrentUser();
  const threadId = uuid.safeParse(formData.get("threadId"));
  const action = String(formData.get("action") ?? "");
  if (!user || !isStaff(user) || !threadId.success) return;
  if (action === "pin" || action === "unpin" || action === "lock" || action === "unlock") await moderateThread(user, threadId.data, action);
  else if (action === "hide") await hideContent(user.id, "forum_thread", threadId.data, String(formData.get("reason") ?? ""));
  else if (action === "restore") await restoreContent(user.id, "forum_thread", threadId.data);
  refreshForum(threadId.data);
  revalidatePath("/admin", "layout");
}

export async function moderateReplyAction(formData: FormData) {
  const user = await getCurrentUser();
  const replyId = uuid.safeParse(formData.get("replyId"));
  const action = String(formData.get("action") ?? "");
  if (!user || !isStaff(user) || !replyId.success) return;
  if (action === "hide") await hideContent(user.id, "forum_reply", replyId.data, String(formData.get("reason") ?? ""));
  else if (action === "restore") await restoreContent(user.id, "forum_reply", replyId.data);
  const [r] = await db.select({ threadId: forumReplies.threadId }).from(forumReplies).where(eq(forumReplies.id, replyId.data));
  refreshForum(r?.threadId);
  revalidatePath("/admin", "layout");
}
