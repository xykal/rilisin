import { ArrowBigUp, CheckCircle2, Lock, MessageCircle, Pin } from "lucide-react";
import Link from "next/link";
import { threadPath } from "@/lib/community/shared";
import { formatCompact, timeAgo } from "@/lib/format";
import type { ThreadListItem } from "@/lib/forum";
import { Avatar } from "../bits";
import { cn } from "../ui";

export function ThreadRow({ t, showCategory = true }: { t: ThreadListItem; showCategory?: boolean }) {
  return (
    <li className="relative flex gap-3 px-4 py-4 hover:bg-slate-50/80 sm:gap-4 sm:px-5">
      <Avatar name={t.author.displayName} avatarKey={t.author.avatarKey} size={40} className="mt-0.5 max-[359px]:hidden" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          {t.pinned && (
            <span className="inline-flex items-center gap-1 font-semibold text-brand-700">
              <Pin className="h-3.5 w-3.5" /> Disematkan
            </span>
          )}
          {showCategory && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
              <span aria-hidden="true">{t.category.emoji}</span> {t.category.name}
            </span>
          )}
          {t.product && (
            <span className="inline-flex min-w-0 max-w-full items-center rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700">
              <span className="truncate">{t.product.title}</span>
            </span>
          )}
        </div>
        <h3 className="mt-1 break-words font-bold leading-snug text-ink">
          <Link href={threadPath(t.id)} className="after:absolute after:inset-0 hover:text-brand-700">
            {t.title}
          </Link>
          {t.locked && <Lock className="ml-1.5 inline h-3.5 w-3.5 text-slate-400" aria-label="Dikunci" />}
        </h3>
        <p className="mt-1 line-clamp-2 break-words text-sm text-slate-500">{t.snippet}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="min-w-0 truncate font-medium text-slate-600">{t.author.displayName}</span>
          <span>{t.lastReplyBy ? `balasan terakhir ${timeAgo(t.lastActivityAt)} oleh ${t.lastReplyBy}` : `dibuat ${timeAgo(t.createdAt)}`}</span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 text-xs text-slate-500">
        {t.answered && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 ring-1 ring-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" /> <span className="max-sm:sr-only">Terjawab</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1" title={`${t.replyCount} balasan`}>
          <MessageCircle className="h-4 w-4" /> {formatCompact(t.replyCount)}
        </span>
        <span className={cn("inline-flex items-center gap-1", t.score > 0 && "text-brand-700")} title={`${t.score} upvote`}>
          <ArrowBigUp className="h-4 w-4" /> {formatCompact(t.score)}
        </span>
      </div>
    </li>
  );
}

export function ThreadList({ items, showCategory = true, empty }: { items: ThreadListItem[]; showCategory?: boolean; empty?: React.ReactNode }) {
  if (!items.length) return <div className="px-5 py-12 text-center text-sm text-slate-500">{empty ?? "Belum ada thread."}</div>;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((t) => (
        <ThreadRow key={t.id} t={t} showCategory={showCategory} />
      ))}
    </ul>
  );
}
