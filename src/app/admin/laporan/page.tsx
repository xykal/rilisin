import { desc, eq, inArray, sql } from "drizzle-orm";
import { Ban, CheckCircle2, EyeOff, Flag, MessageSquareX, RotateCcw, Trash2, VolumeX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  banUserAction,
  deleteReportedMessageAction,
  dismissReportsAction,
  muteAuthorFromReportAction,
  restoreReportedMessageAction,
} from "@/app/actions/moderation";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, EmptyState } from "@/components/ui";
import { requireStaff } from "@/lib/auth/guards";
import { MUTE_OPTIONS, reportReasonLabel } from "@/lib/chat/shared";
import { db } from "@/lib/db";
import { chatMessageEdits, chatMessages, reports, users } from "@/lib/db/schema";
import { formatDateTime, timeAgo } from "@/lib/format";
import { mediaUrl } from "@/lib/storage";

export const metadata: Metadata = { title: "Laporan chat" };

type Snapshot = { body?: string; imageKey?: string | null; authorId?: string; authorName?: string; authorUsername?: string; roomSlug?: string; roomName?: string; sentAt?: string };

export default async function ReportsPage() {
  const staff = await requireStaff("/admin/laporan");
  const groups = await db.execute<{
    target_id: string;
    n: number;
    reasons: string[];
    last_at: Date;
    snapshot: Snapshot;
    items: { reporter: string; reason: string; note: string | null; at: string }[];
  }>(sql`
    select r.target_id, count(*)::int as n, array_agg(distinct r.reason) as reasons, max(r.created_at) as last_at,
      (array_agg(r.snapshot order by r.created_at))[1] as snapshot,
      json_agg(json_build_object('reporter', u.username, 'reason', r.reason, 'note', r.note, 'at', r.created_at) order by r.created_at) as items
    from ${reports} r join ${users} u on u.id = r.reporter_id
    where r.status = 'open' and r.target_type = 'chat_message'
    group by r.target_id
    order by count(*) desc, max(r.created_at) desc
    limit 50
  `);

  const ids = groups.map((g) => g.target_id);
  const current = ids.length
    ? await db
        .select({
          id: chatMessages.id,
          deletedAt: chatMessages.deletedAt,
          hiddenAt: chatMessages.reportHiddenAt,
          authorId: chatMessages.authorId,
          authorCreatedAt: users.createdAt,
          authorBanned: users.bannedAt,
          authorRole: users.role,
        })
        .from(chatMessages)
        .innerJoin(users, eq(users.id, chatMessages.authorId))
        .where(inArray(chatMessages.id, ids))
    : [];
  const edits = ids.length
    ? await db.select().from(chatMessageEdits).where(inArray(chatMessageEdits.messageId, ids)).orderBy(desc(chatMessageEdits.editedAt))
    : [];
  const byId = new Map(current.map((c) => [c.id, c]));

  const history = await db
    .select({
      id: reports.id,
      status: reports.status,
      resolution: reports.resolution,
      resolvedAt: reports.resolvedAt,
      reason: reports.reason,
      moderator: users.username,
    })
    .from(reports)
    .leftJoin(users, eq(users.id, reports.resolvedBy))
    .where(sql`${reports.status} <> 'open'`)
    .orderBy(desc(reports.resolvedAt))
    .limit(10);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold text-brand-700">Moderasi</p>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Laporan chat</h1>
      <p className="mt-1 text-sm text-slate-500">
        Pesan yang dilaporkan anggota. Isi yang tampil adalah salinan saat dilaporkan (tetap ada walau pelaku mengedit/menghapus).
      </p>

      <div className="mt-8 space-y-5">
        {groups.length === 0 && (
          <EmptyState icon={<CheckCircle2 className="h-10 w-10" />} title="Tidak ada laporan terbuka">
            Komunitas lagi adem 😌
          </EmptyState>
        )}
        {groups.map((g) => {
          const snap = g.snapshot ?? {};
          const now = byId.get(g.target_id);
          const img = mediaUrl(snap.imageKey ?? null);
          const msgEdits = edits.filter((e) => e.messageId === g.target_id);
          return (
            <Card key={g.target_id} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3 text-sm">
                <Flag className="h-4 w-4 text-red-600" />
                <b className="text-ink">{g.n} laporan</b>
                {g.reasons.map((r) => (
                  <Badge key={r} tone="red">{reportReasonLabel(r)}</Badge>
                ))}
                {now?.hiddenAt && !now.deletedAt && (
                  <Badge tone="amber">
                    <EyeOff className="h-3 w-3" /> Disembunyikan otomatis
                  </Badge>
                )}
                {now?.deletedAt && <Badge tone="slate">Sudah dihapus</Badge>}
                <span className="ml-auto text-xs text-slate-500">terakhir {timeAgo(g.last_at)}</span>
              </div>
              <div className="grid gap-5 p-5 md:grid-cols-[1.3fr_1fr]">
                <div>
                  <p className="text-xs text-slate-500">
                    <b className="text-slate-700">{snap.authorName}</b> @{snap.authorUsername} · di{" "}
                    <Link href={`/komunitas/${snap.roomSlug}`} className="font-semibold text-brand-700 hover:underline">
                      #{snap.roomSlug}
                    </Link>{" "}
                    · {formatDateTime(snap.sentAt)}
                    {now && <> · akun dibuat {timeAgo(now.authorCreatedAt)}</>}
                  </p>
                  <div className="mt-2 whitespace-pre-wrap break-words rounded-2xl bg-white px-4 py-3 text-[15px] text-ink shadow-sm ring-1 ring-slate-200">
                    {snap.body || <i className="text-slate-400">(tanpa teks)</i>}
                    {img && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt="Gambar yang dilaporkan" className="mt-2 max-h-48 rounded-lg" />
                    )}
                  </div>
                  {msgEdits.length > 0 && (
                    <details className="mt-2 text-xs text-slate-600">
                      <summary className="cursor-pointer font-semibold">Riwayat edit/hapus ({msgEdits.length})</summary>
                      <ul className="mt-1 space-y-1">
                        {msgEdits.map((e) => (
                          <li key={e.id} className="rounded-lg bg-slate-50 px-2 py-1">
                            <span className="text-slate-400">{formatDateTime(e.editedAt)}:</span> {e.previousBody}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <ul className="mt-3 space-y-1 text-xs text-slate-600">
                    {g.items.map((it, i) => (
                      <li key={i}>
                        <b>@{it.reporter}</b> — {reportReasonLabel(it.reason)}
                        {it.note ? `: “${it.note}”` : ""} <span className="text-slate-400">({timeAgo(it.at)})</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2">
                  {!now?.deletedAt && (
                    <form action={deleteReportedMessageAction}>
                      <input type="hidden" name="messageId" value={g.target_id} />
                      <SubmitButton variant="danger" className="w-full" pendingText="Menghapus…">
                        <Trash2 className="h-4 w-4" /> Hapus pesan untuk semua
                      </SubmitButton>
                    </form>
                  )}
                  {now && now.authorRole === "user" && (
                    <form action={muteAuthorFromReportAction} className="flex gap-2">
                      <input type="hidden" name="messageId" value={g.target_id} />
                      <select name="minutes" className="flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm" defaultValue={String(24 * 60)} aria-label="Durasi bisu">
                        {MUTE_OPTIONS.map((o) => (
                          <option key={o.minutes} value={o.minutes}>
                            Bisukan {o.label}
                          </option>
                        ))}
                      </select>
                      <SubmitButton variant="secondary" pendingText="…">
                        <VolumeX className="h-4 w-4" /> Bisukan
                      </SubmitButton>
                    </form>
                  )}
                  {now?.hiddenAt && !now.deletedAt ? (
                    <form action={restoreReportedMessageAction}>
                      <input type="hidden" name="messageId" value={g.target_id} />
                      <SubmitButton variant="secondary" className="w-full" pendingText="…">
                        <RotateCcw className="h-4 w-4" /> Pulihkan pesan &amp; tolak laporan
                      </SubmitButton>
                    </form>
                  ) : (
                    <form action={dismissReportsAction}>
                      <input type="hidden" name="messageId" value={g.target_id} />
                      <SubmitButton variant="secondary" className="w-full" pendingText="…">
                        <MessageSquareX className="h-4 w-4" /> Tolak laporan (tidak melanggar)
                      </SubmitButton>
                    </form>
                  )}
                  {staff.role === "admin" && now && now.authorRole === "user" && !now.authorBanned && (
                    <form action={banUserAction} className="rounded-xl border border-red-100 bg-red-50/50 p-3">
                      <input type="hidden" name="userId" value={now.authorId} />
                      <input type="hidden" name="messageId" value={g.target_id} />
                      <input name="reason" placeholder="Alasan blokir" className="mb-2 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm" />
                      <SubmitButton variant="danger" className="w-full" pendingText="Memblokir…" confirm="Blokir akun ini? Semua sesinya dicabut dan tidak bisa login.">
                        <Ban className="h-4 w-4" /> Blokir akun penulis
                      </SubmitButton>
                    </form>
                  )}
                  {now?.authorBanned && <Badge tone="red">Akun penulis sudah diblokir</Badge>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <section className="mt-12">
        <h2 className="mb-3 text-lg font-bold text-ink">Riwayat penanganan</h2>
        <Card className="divide-y divide-slate-100 text-sm">
          {history.length === 0 && <p className="p-4 text-slate-500">Belum ada.</p>}
          {history.map((h) => (
            <div key={h.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <Badge tone={h.status === "resolved" ? "green" : "slate"}>{h.status === "resolved" ? "Ditindak" : "Ditolak"}</Badge>
              <span className="text-slate-600">{reportReasonLabel(h.reason)}</span>
              <span className="text-slate-400">→ {h.resolution}</span>
              <span className="ml-auto text-xs text-slate-400">
                {h.moderator ? `@${h.moderator} · ` : ""}
                {formatDateTime(h.resolvedAt)}
              </span>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
