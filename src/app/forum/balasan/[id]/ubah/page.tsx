import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EditReplyForm } from "@/components/forum/forum-forms";
import { Card } from "@/components/ui";
import { isStaff } from "@/lib/auth/current-user";
import { requireUser } from "@/lib/auth/guards";
import { replyPath } from "@/lib/community/shared";
import { getReplyForEdit } from "@/lib/forum";

export const metadata: Metadata = { title: "Ubah balasan", robots: { index: false } };

export default async function EditReplyPage({ params }: PageProps<"/forum/balasan/[id]/ubah">) {
  const { id } = await params;
  const user = await requireUser(`/forum/balasan/${id}/ubah`);
  const r = /^[0-9a-f-]{36}$/i.test(id) ? await getReplyForEdit(id, user) : null;
  if (!r || (r.thread.lockedAt && !isStaff(user))) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href={replyPath(r.thread.id, id)} className="-my-1 mb-5 inline-flex items-center gap-1 py-1 text-sm font-medium text-slate-500 hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Kembali ke thread
      </Link>
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">Ubah balasan</h1>
      <p className="mb-6 mt-1 truncate text-sm text-slate-500">di “{r.thread.title}”</p>
      <Card className="p-5 sm:p-7">
        <EditReplyForm replyId={id} body={r.reply.body} />
      </Card>
    </div>
  );
}
