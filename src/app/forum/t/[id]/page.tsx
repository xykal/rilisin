import {
  CheckCircle2,
  ChevronRight,
  CircleSlash,
  EyeOff,
  Lock,
  LockOpen,
  MessageCircle,
  PencilLine,
  Pin,
  PinOff,
  Reply,
  RotateCcw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { acceptAnswerAction, deleteReplyAction, deleteThreadAction, moderateReplyAction, moderateThreadAction } from "@/app/actions/forum";
import { Avatar, ProductIcon } from "@/components/bits";
import { ReplyComposer } from "@/components/forum/forum-forms";
import { Pager, RoleBadge, VoteButton } from "@/components/forum/forum-parts";
import { Markdown } from "@/components/markdown";
import { ReportDialog } from "@/components/report-dialog";
import { SubmitButton } from "@/components/submit-button";
import { Alert, ButtonLink, Card, buttonStyles, cn, inputStyles } from "@/components/ui";
import { getCurrentUser, isStaff } from "@/lib/auth/current-user";
import { plainSnippet, replyPath, threadPath } from "@/lib/community/shared";
import { formatDateTime, timeAgo } from "@/lib/format";
import { getAcceptedReply, getQuoteTarget, getThread, listReplies, productBadges, replyPageOf, viewerVotes, type ReplyDTO } from "@/lib/forum";
import { pageOg } from "@/lib/og";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const loadThread = cache(async (id: string) => {
  const user = await getCurrentUser();
  return { user, t: UUID_RE.test(id) ? await getThread(id, user) : null };
});

export async function generateMetadata({ params }: PageProps<"/forum/t/[id]">): Promise<Metadata> {
  const { id } = await params;
  const { t } = await loadThread(id);
  if (!t || t.state !== "visible") return { title: "Thread", robots: { index: false } };
  const desc = plainSnippet(t.thread.body, 160);
  return { title: t.thread.title, description: desc, ...pageOg(t.thread.title, desc, `/forum/t/${id}`) };
}

function ModForm({ action, children, fields }: { action: (fd: FormData) => Promise<void>; children: React.ReactNode; fields: Record<string, string> }) {
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
    </form>
  );
}

export default async function ThreadPage({ params, searchParams }: PageProps<"/forum/t/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { user, t } = await loadThread(id);
  if (!t) notFound();
  const thread = t.thread;
  const staff = isStaff(user);
  const isAuthor = user?.id === thread.authorId;

  const target = typeof sp.balasan === "string" && UUID_RE.test(sp.balasan) ? sp.balasan : null;
  const page = target ? await replyPageOf(thread.id, target) : Math.max(1, Number.parseInt(typeof sp.hal === "string" ? sp.hal : "1", 10) || 1);
  const [replies, accepted] = await Promise.all([listReplies(thread.id, { viewer: user, page }), getAcceptedReply(thread.id, thread.acceptedReplyId)]);
  const quoteTarget = t.canReply && typeof sp.kutip === "string" && UUID_RE.test(sp.kutip) ? await getQuoteTarget(thread.id, sp.kutip, user) : null;
  const replyIds = [...replies.items.map((r) => r.id), ...(accepted ? [accepted.reply.id] : [])];
  const [votes, badges] = await Promise.all([
    viewerVotes(user?.id, thread.id, replyIds),
    productBadges(t.product ? { id: t.product.id, sellerId: t.product.sellerId } : null, [t.author.id, ...replies.items.map((r) => r.author.id), ...(accepted ? [accepted.author.id] : [])]),
  ]);
  const loginHref = `/masuk?next=${encodeURIComponent(threadPath(thread.id))}`;
  const voteState = (authorId: string) => (!user ? "guest" : user.id === authorId ? "own" : "can") as "guest" | "own" | "can";

  const replyItem = (r: ReplyDTO, index: number) => {
    const n = (replies.page - 1) * replies.pageSize + index + 1;
    const mine = user?.id === r.author.id;
    const isAccepted = thread.acceptedReplyId === r.id;
    if (r.body === null) {
      return (
        <li key={r.id} id={`b-${r.id}`} className="scroll-mt-24 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-4 text-sm italic text-slate-400">
          <CircleSlash className="mr-1.5 inline h-4 w-4" />
          {r.state === "deleted" ? "Balasan ini dihapus penulisnya." : r.state === "hidden" ? "Balasan ini disembunyikan moderator." : "Balasan ini sedang ditinjau moderator."}
        </li>
      );
    }
    return (
      <li
        key={r.id}
        id={`b-${r.id}`}
        className={cn(
          "scroll-mt-24 rounded-2xl border bg-white p-4 shadow-sm sm:p-5",
          isAccepted ? "border-emerald-300" : "border-slate-200/80",
          target === r.id && "ring-4 ring-brand-100",
        )}
      >
        <div className="flex items-start gap-3">
          <Link href={`/@${r.author.username}`} className="shrink-0" aria-label={`Profil ${r.author.displayName}`}>
            <Avatar name={r.author.displayName} avatarKey={r.author.avatarKey} size={36} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link href={`/@${r.author.username}`} className="min-w-0 truncate font-semibold text-ink hover:text-brand-700">
                {r.author.displayName}
              </Link>
              <RoleBadge role={r.author.role} productBadge={badges.get(r.author.id)} />
              {isAccepted && (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                  <CheckCircle2 className="h-3 w-3" /> Jawaban terbaik
                </span>
              )}
            </p>
            <p className="text-xs text-slate-500">
              <a href={`#b-${r.id}`} className="hover:underline" title={formatDateTime(r.createdAt)}>
                #{n} · {timeAgo(r.createdAt)}
              </a>
              {r.editedAt && <span> · diedit</span>}
            </p>
          </div>
          {user && !mine && r.state === "visible" && <ReportDialog targetType="forum_reply" targetId={r.id} />}
        </div>
        {r.state !== "visible" && (
          <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
            {r.state === "deleted"
              ? "Dihapus penulis (terlihat karena kamu moderator)."
              : r.state === "hidden"
                ? `Disembunyikan moderator: ${r.hiddenReason ?? "-"}`
                : "Disembunyikan otomatis — dilaporkan beberapa anggota."}
          </p>
        )}
        {r.quoted && (
          <Link href={replyPath(thread.id, r.quoted.id)} className="mt-3 block rounded-xl border-l-4 border-brand-300 bg-slate-50 px-3 py-2 text-sm hover:bg-slate-100">
            <span className="font-semibold text-ink">{r.quoted.authorName}</span>
            <span className="mt-0.5 line-clamp-2 block text-slate-600">{r.quoted.snippet}</span>
          </Link>
        )}
        <div className="mt-3 min-w-0">
          <Markdown mentions compact>
            {r.body}
          </Markdown>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
          {r.state === "visible" && (
            <VoteButton targetType="reply" targetId={r.id} score={r.score} voted={votes.has(`reply:${r.id}`)} state={voteState(r.author.id)} loginHref={loginHref} />
          )}
          {t.canAccept && r.state === "visible" && (
            <form action={acceptAnswerAction}>
              <input type="hidden" name="threadId" value={thread.id} />
              {!isAccepted && <input type="hidden" name="replyId" value={r.id} />}
              <SubmitButton variant="ghost" className={cn("!rounded-full !py-1.5 !text-xs", isAccepted ? "!text-slate-500" : "!text-emerald-700")}>
                <CheckCircle2 className="h-4 w-4" /> {isAccepted ? "Batalkan jawaban terbaik" : "Tandai jawaban terbaik"}
              </SubmitButton>
            </form>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {user && r.state === "visible" && !thread.lockedAt && (
              <Link href={`${threadPath(thread.id)}?kutip=${r.id}#balas`} className={cn(buttonStyles.ghost, "!px-2 !py-1 !text-xs")}>
                <Reply className="h-3.5 w-3.5" /> Balas
              </Link>
            )}
            {(mine || staff) && r.state !== "deleted" && (!thread.lockedAt || staff) && (
              <Link href={`/forum/balasan/${r.id}/ubah`} className={cn(buttonStyles.ghost, "!px-2 !py-1 !text-xs")}>
                <PencilLine className="h-3.5 w-3.5" /> Ubah
              </Link>
            )}
            {(mine || staff) && r.state !== "deleted" && (
              <form action={deleteReplyAction}>
                <input type="hidden" name="replyId" value={r.id} />
                <SubmitButton variant="ghost" className="!px-2 !py-1 !text-xs !text-red-600" confirm="Hapus balasan ini?">
                  <Trash2 className="h-3.5 w-3.5" /> Hapus
                </SubmitButton>
              </form>
            )}
          </div>
        </div>
        {staff && r.state !== "deleted" && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            {r.state === "visible" ? (
              <ModForm action={moderateReplyAction} fields={{ replyId: r.id, action: "hide" }}>
                <label className="sr-only" htmlFor={`hide-r-${r.id}`}>
                  Alasan menyembunyikan
                </label>
                <input id={`hide-r-${r.id}`} name="reason" placeholder="Alasan (moderator)" className={cn(inputStyles, "!w-44 !py-1 !text-xs")} />
                <SubmitButton variant="ghost" className="!px-1 !text-xs !text-amber-700">
                  <EyeOff className="h-3.5 w-3.5" /> Sembunyikan
                </SubmitButton>
              </ModForm>
            ) : (
              <ModForm action={moderateReplyAction} fields={{ replyId: r.id, action: "restore" }}>
                <SubmitButton variant="ghost" className="!px-1 !text-xs !text-emerald-700">
                  <RotateCcw className="h-3.5 w-3.5" /> Pulihkan balasan
                </SubmitButton>
              </ModForm>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <nav className="mb-5 flex min-w-0 items-center gap-1.5 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/forum" className="-my-1 shrink-0 py-1 hover:text-ink">
          Forum
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <Link href={`/forum/${t.category.slug}`} className="-my-1 min-w-0 truncate py-1 hover:text-ink">
          {t.category.emoji} {t.category.name}
        </Link>
      </nav>

      {t.state !== "visible" && (
        <Alert tone="warning" className="mb-4" title="Thread ini tidak tampil untuk publik">
          {t.state === "deleted"
            ? "Sudah dihapus penulisnya (kamu melihatnya sebagai moderator)."
            : t.state === "hidden"
              ? `Disembunyikan moderator: ${thread.hiddenReason ?? "-"}`
              : "Disembunyikan otomatis karena dilaporkan beberapa anggota — menunggu peninjauan moderator."}
        </Alert>
      )}

      <article className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="p-5 sm:p-7">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
            {thread.pinnedAt && (
              <span className="inline-flex items-center gap-1 text-brand-700">
                <Pin className="h-3.5 w-3.5" /> Disematkan
              </span>
            )}
            {thread.lockedAt && (
              <span className="inline-flex items-center gap-1 text-slate-500">
                <Lock className="h-3.5 w-3.5" /> Dikunci
              </span>
            )}
            {accepted && (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> Terjawab
              </span>
            )}
          </div>
          <h1 className="break-words text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-3xl">{thread.title}</h1>
          <div className="mt-4 flex items-center gap-3">
            <Link href={`/@${t.author.username}`} className="shrink-0" aria-label={`Profil ${t.author.displayName}`}>
              <Avatar name={t.author.displayName} avatarKey={t.author.avatarKey} size={40} />
            </Link>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link href={`/@${t.author.username}`} className="min-w-0 truncate font-semibold text-ink hover:text-brand-700">
                  {t.author.displayName}
                </Link>
                <RoleBadge role={t.author.role} productBadge={badges.get(t.author.id)} />
              </p>
              <p className="text-xs text-slate-500" title={formatDateTime(thread.createdAt)}>
                {timeAgo(thread.createdAt)}
                {thread.editedAt && " · diedit"}
              </p>
            </div>
          </div>
          {t.product && t.product.status === "published" && (
            <Link href={`/p/${t.product.slug}`} className="mt-4 flex max-w-full items-center gap-3 rounded-xl border border-slate-200 p-2.5 pr-4 hover:border-brand-200 hover:bg-brand-50/40 sm:inline-flex">
              <ProductIcon iconKey={t.product.iconKey} title={t.product.title} size={32} />
              <span className="min-w-0">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">Diskusi produk</span>
                <span className="block truncate text-sm font-semibold text-ink">{t.product.title}</span>
              </span>
            </Link>
          )}
          <div className="mt-5 min-w-0">
            <Markdown mentions>{thread.body}</Markdown>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3 sm:px-7">
          {t.state === "visible" && (
            <VoteButton targetType="thread" targetId={thread.id} score={thread.score} voted={votes.has(`thread:${thread.id}`)} state={voteState(thread.authorId)} loginHref={loginHref} />
          )}
          <span className="inline-flex items-center gap-1 px-2 text-sm text-slate-500">
            <MessageCircle className="h-4 w-4" /> {thread.replyCount} balasan
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {t.canEdit && (
              <Link href={`/forum/t/${thread.id}/ubah`} className={cn(buttonStyles.ghost, "!px-2 !py-1 !text-xs")}>
                <PencilLine className="h-3.5 w-3.5" /> Ubah
              </Link>
            )}
            {(isAuthor || staff) && t.state !== "deleted" && (
              <form action={deleteThreadAction}>
                <input type="hidden" name="threadId" value={thread.id} />
                <SubmitButton variant="ghost" className="!px-2 !py-1 !text-xs !text-red-600" confirm="Hapus thread ini? Balasan di dalamnya ikut hilang dari forum.">
                  <Trash2 className="h-3.5 w-3.5" /> Hapus
                </SubmitButton>
              </form>
            )}
            {user && !isAuthor && t.state === "visible" && <ReportDialog targetType="forum_thread" targetId={thread.id} />}
          </div>
        </div>
        {staff && t.state !== "deleted" && (
          <div className="flex flex-wrap items-center gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50 px-5 py-3 sm:px-7">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Moderator</span>
            <ModForm action={moderateThreadAction} fields={{ threadId: thread.id, action: thread.pinnedAt ? "unpin" : "pin" }}>
              <SubmitButton variant="secondary" className={buttonStyles.small}>
                {thread.pinnedAt ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />} {thread.pinnedAt ? "Lepas sematan" : "Sematkan"}
              </SubmitButton>
            </ModForm>
            <ModForm action={moderateThreadAction} fields={{ threadId: thread.id, action: thread.lockedAt ? "unlock" : "lock" }}>
              <SubmitButton variant="secondary" className={buttonStyles.small}>
                {thread.lockedAt ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />} {thread.lockedAt ? "Buka kunci" : "Kunci"}
              </SubmitButton>
            </ModForm>
            {t.state === "visible" ? (
              <ModForm action={moderateThreadAction} fields={{ threadId: thread.id, action: "hide" }}>
                <label className="sr-only" htmlFor="hide-thread-reason">
                  Alasan menyembunyikan
                </label>
                <input id="hide-thread-reason" name="reason" placeholder="Alasan sembunyikan" className={cn(inputStyles, "!w-40 !py-1 !text-xs")} />
                <SubmitButton variant="secondary" className={cn(buttonStyles.small, "!text-amber-700")}>
                  <EyeOff className="h-3.5 w-3.5" /> Sembunyikan
                </SubmitButton>
              </ModForm>
            ) : (
              <ModForm action={moderateThreadAction} fields={{ threadId: thread.id, action: "restore" }}>
                <SubmitButton variant="secondary" className={cn(buttonStyles.small, "!text-emerald-700")}>
                  <RotateCcw className="h-3.5 w-3.5" /> Pulihkan
                </SubmitButton>
              </ModForm>
            )}
          </div>
        )}
      </article>

      {accepted && replies.page === 1 && (
        <section className="mt-6 rounded-2xl border-2 border-emerald-300 bg-emerald-50/50 p-5" aria-label="Jawaban terbaik">
          <p className="flex items-center gap-2 text-sm font-bold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" /> Jawaban terbaik — dari {accepted.author.displayName}
          </p>
          <div className="mt-2 min-w-0">
            <Markdown mentions compact>
              {accepted.reply.body.length > 900 ? `${accepted.reply.body.slice(0, 900)}…` : accepted.reply.body}
            </Markdown>
          </div>
          <Link href={replyPath(thread.id, accepted.reply.id)} className="mt-2 inline-block text-sm font-semibold text-emerald-800 hover:underline">
            Lihat di percakapan →
          </Link>
        </section>
      )}

      <section className="mt-8" aria-labelledby="balasan">
        <h2 id="balasan" className="mb-4 text-lg font-bold text-ink">
          {thread.replyCount ? `${thread.replyCount} balasan` : "Belum ada balasan"}
        </h2>
        {replies.items.length > 0 && <ol className="space-y-3">{replies.items.map(replyItem)}</ol>}
        {replies.pages > 1 && (
          <div className="mt-4">
            <Pager page={replies.page} totalPages={replies.pages} hrefFor={(p) => (p > 1 ? `${threadPath(thread.id)}?hal=${p}` : threadPath(thread.id))} label="Halaman balasan" />
          </div>
        )}
      </section>

      <div id="balas" className="scroll-mt-24">
      <Card className="mt-6 p-5 sm:p-6">
        {t.canReply ? (
          <ReplyComposer threadId={thread.id} quote={quoteTarget} />
        ) : !user ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">Masuk untuk membalas, upvote, atau menandai jawaban.</p>
            <ButtonLink href={loginHref}>Masuk</ButtonLink>
          </div>
        ) : thread.lockedAt ? (
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <Lock className="h-4 w-4" /> Thread ini dikunci moderator — tidak menerima balasan baru.
          </p>
        ) : (
          <p className="text-sm text-slate-600">Thread ini sedang ditinjau moderator.</p>
        )}
      </Card>
      </div>
    </div>
  );
}
