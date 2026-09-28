import { ArrowBigUp, MessagesSquare, ScrollText } from "lucide-react";
import Link from "next/link";
import { voteAction } from "@/app/actions/forum";
import { FORUM_SORTS, type ForumSort } from "@/lib/community/shared";
import { formatCompact } from "@/lib/format";
import { ButtonLink, buttonStyles, cn } from "../ui";

export type SidebarCategory = { slug: string; name: string; emoji: string; description: string; threads: number };

export function ForumSidebar({ categories, active }: { categories: SidebarCategory[]; active?: string | null }) {
  return (
    <aside className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:self-start">
      <nav aria-label="Kategori forum" className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
        <p className="px-2 pb-2 pt-1 text-xs font-bold uppercase tracking-wider text-slate-400">Kategori</p>
        <Link
          href="/forum"
          aria-current={!active ? "page" : undefined}
          className={cn("flex items-center gap-3 rounded-xl px-2 py-2 text-sm font-semibold", !active ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-50")}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-base" aria-hidden="true">
            🧭
          </span>
          Semua thread
        </Link>
        {categories.map((c) => (
          <Link
            key={c.slug}
            href={`/forum/${c.slug}`}
            aria-current={active === c.slug ? "page" : undefined}
            className={cn("flex items-center gap-3 rounded-xl px-2 py-2 text-sm", active === c.slug ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-50")}
            title={c.description}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-base" aria-hidden="true">
              {c.emoji}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
            <span className="text-xs tabular-nums text-slate-400">{formatCompact(c.threads)}</span>
          </Link>
        ))}
      </nav>
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 text-sm shadow-sm">
        <p className="font-semibold text-ink">Butuh jawaban cepat?</p>
        <p className="mt-1 text-slate-500">Forum untuk yang perlu diarsip & dicari lagi. Obrolan santai lebih cocok di chat komunitas.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/komunitas" className={cn(buttonStyles.secondary, buttonStyles.small)}>
            <MessagesSquare className="h-3.5 w-3.5" /> Chat komunitas
          </Link>
          <Link href="/komunitas/aturan" className={cn(buttonStyles.ghost, buttonStyles.small)}>
            <ScrollText className="h-3.5 w-3.5" /> Aturan
          </Link>
        </div>
      </div>
    </aside>
  );
}

/** Kategori sebagai chip gulir horizontal (HP & tablet — sidebar hanya di desktop). */
export function CategoryChips({ categories, active }: { categories: SidebarCategory[]; active?: string | null }) {
  return (
    <nav aria-label="Kategori forum" className="scroll-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-2 lg:hidden">
      <Link
        href="/forum"
        className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm font-medium", !active ? "bg-ink text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}
      >
        Semua
      </Link>
      {categories.map((c) => (
        <Link
          key={c.slug}
          href={`/forum/${c.slug}`}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium",
            active === c.slug ? "bg-ink text-white" : "bg-white text-slate-600 ring-1 ring-slate-200",
          )}
        >
          <span aria-hidden="true">{c.emoji}</span> {c.name}
        </Link>
      ))}
    </nav>
  );
}

export function SortTabs({ hrefFor, sort, hideUnanswered }: { hrefFor: (s: ForumSort) => string; sort: ForumSort; hideUnanswered?: boolean }) {
  return (
    <div className="scroll-thin -mx-1 flex gap-1 overflow-x-auto px-1" role="tablist" aria-label="Urutkan thread">
      {FORUM_SORTS.filter((s) => !(hideUnanswered && s.id === "belum-terjawab")).map((s) => (
        <Link
          key={s.id}
          href={hrefFor(s.id)}
          role="tab"
          aria-selected={sort === s.id}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium",
            sort === s.id ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100",
          )}
        >
          {s.label}
        </Link>
      ))}
    </div>
  );
}

export function Pager({ page, totalPages, hrefFor, label = "Halaman" }: { page: number; totalPages: number; hrefFor: (p: number) => string; label?: string }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="flex items-center justify-between gap-3" aria-label={label}>
      {page > 1 ? (
        <ButtonLink href={hrefFor(page - 1)} variant="secondary">
          ← Sebelumnya
        </ButtonLink>
      ) : (
        <span />
      )}
      <span className="text-sm text-slate-500">
        Halaman {page} dari {totalPages}
      </span>
      {page < totalPages ? (
        <ButtonLink href={hrefFor(page + 1)} variant="secondary">
          Berikutnya →
        </ButtonLink>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function RoleBadge({ role, productBadge }: { role: string; productBadge?: "seller" | "owner" }) {
  return (
    <>
      {role === "admin" && <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold text-brand-700 ring-1 ring-brand-200">Tim Rilisin</span>}
      {role === "moderator" && <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200">Moderator</span>}
      {productBadge === "seller" && <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-bold text-violet-700 ring-1 ring-violet-200">Pembuat</span>}
      {productBadge === "owner" && <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">Pemilik</span>}
    </>
  );
}

/** Tombol upvote: form biasa (jalan tanpa JS). Tamu diarahkan masuk, postingan sendiri hanya menampilkan skor. */
export function VoteButton({
  targetType,
  targetId,
  score,
  voted,
  state,
  loginHref,
}: {
  targetType: "thread" | "reply";
  targetId: string;
  score: number;
  voted: boolean;
  state: "can" | "own" | "guest";
  loginHref: string;
}) {
  const inner = (
    <>
      <ArrowBigUp className={cn("h-5 w-5", voted && "fill-current")} />
      <span className="tabular-nums">{formatCompact(score)}</span>
    </>
  );
  const base = "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors";
  if (state === "guest") {
    return (
      <Link href={loginHref} className={cn(base, "bg-slate-100 text-slate-600 hover:bg-slate-200")} aria-label={`Upvote (${score}) — masuk dulu`}>
        {inner}
      </Link>
    );
  }
  if (state === "own") {
    return (
      <span className={cn(base, "bg-slate-50 text-slate-400")} title="Upvote dari anggota lain">
        {inner}
      </span>
    );
  }
  return (
    <form action={voteAction}>
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <button
        type="submit"
        aria-pressed={voted}
        aria-label={voted ? `Batalkan upvote (${score})` : `Upvote (${score})`}
        className={cn(base, voted ? "bg-brand-600 text-white hover:bg-brand-700" : "bg-slate-100 text-slate-600 hover:bg-brand-50 hover:text-brand-700")}
      >
        {inner}
      </button>
    </form>
  );
}
