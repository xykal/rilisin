import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ThreadForm } from "@/components/forum/forum-forms";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth/guards";
import { threadPath } from "@/lib/community/shared";
import { getThread } from "@/lib/forum";

export const metadata: Metadata = { title: "Ubah thread", robots: { index: false } };

export default async function EditThreadPage({ params }: PageProps<"/forum/t/[id]/ubah">) {
  const { id } = await params;
  const user = await requireUser(`/forum/t/${id}/ubah`);
  const t = /^[0-9a-f-]{36}$/i.test(id) ? await getThread(id, user) : null;
  if (!t || !t.canEdit) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href={threadPath(id)} className="-my-1 mb-5 inline-flex items-center gap-1 py-1 text-sm font-medium text-slate-500 hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Kembali ke thread
      </Link>
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight text-ink">Ubah thread</h1>
      <Card className="p-5 sm:p-7">
        <ThreadForm mode="edit" categories={[]} thread={{ id, title: t.thread.title, body: t.thread.body }} />
      </Card>
    </div>
  );
}
