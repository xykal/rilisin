import { Ban, CheckCircle2, EyeOff, Flag, MessageSquareX, PackageX, RotateCcw, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { banContentAuthorAction, dismissContentReportsAction, hideContentAction, restoreContentAction, suspendReportedProductAction } from "@/app/actions/moderation";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, EmptyState } from "@/components/ui";
import { requireStaff } from "@/lib/auth/guards";
import { listContentReportGroups } from "@/lib/community/reports";
import { AUTO_HIDE_TARGETS, CONTENT_TARGET_LABEL, contentReportReasonLabel } from "@/lib/community/shared";
import { formatDateTime, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Laporan konten" };

export default async function ContentReportsPage() {
  const staff = await requireStaff("/admin/laporan/konten");
  const groups = await listContentReportGroups();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold text-brand-700">Moderasi</p>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Laporan konten</h1>
      <p className="mt-1 text-sm text-slate-500">
        Thread, balasan, ulasan, produk, dan akun yang dilaporkan anggota. Isi yang tampil adalah salinan saat dilaporkan. Postingan & ulasan otomatis disembunyikan
        setelah 3 pelapor berbeda; produk & akun selalu menunggu keputusan moderator.
      </p>

      <div className="mt-8 space-y-5">
        {groups.length === 0 && (
          <EmptyState icon={<CheckCircle2 className="h-10 w-10" />} title="Tidak ada laporan terbuka">
            Forum &amp; ulasan lagi aman.
          </EmptyState>
        )}
        {groups.map((g) => {
          const snap = g.snapshot;
          const st = g.state;
          const fields = (
            <>
              <input type="hidden" name="targetType" value={g.targetType} />
              <input type="hidden" name="targetId" value={g.targetId} />
            </>
          );
          return (
            <Card key={`${g.targetType}:${g.targetId}`} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3 text-sm">
                <Flag className="h-4 w-4 text-red-600" />
                <b className="text-ink">{g.n} laporan</b>
                <Badge tone="brand">{CONTENT_TARGET_LABEL[g.targetType]}</Badge>
                {g.reasons.map((r) => (
                  <Badge key={r} tone="red">
                    {contentReportReasonLabel(r)}
                  </Badge>
                ))}
                {st?.autoHidden && !st.hidden && (
                  <Badge tone="amber">
                    <EyeOff className="h-3 w-3" /> Disembunyikan otomatis
                  </Badge>
                )}
                {st?.hidden && <Badge tone="amber">Disembunyikan moderator</Badge>}
                {st?.deleted && <Badge tone="slate">Dihapus penulis</Badge>}
                {!st && <Badge tone="slate">Konten sudah tidak ada</Badge>}
                <span className="ml-auto text-xs text-slate-500">terakhir {timeAgo(g.lastAt)}</span>
              </div>
              <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">
                    <b className="text-slate-700">{snap.authorName}</b> @{snap.authorUsername}
                    {snap.context && (
                      <>
                        {" "}
                        · di <span className="font-semibold text-slate-700">{snap.context}</span>
                      </>
                    )}
                    {snap.postedAt && <> · {formatDateTime(snap.postedAt)}</>}
                    {st?.authorCreatedAt && <> · akun dibuat {timeAgo(st.authorCreatedAt)}</>}
                  </p>
                  <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-2xl bg-white px-4 py-3 text-[15px] text-ink shadow-sm ring-1 ring-slate-200">
                    {snap.title && <p className="mb-1 font-bold">{snap.title}</p>}
                    {typeof snap.rating === "number" && (
                      <p className="mb-1 flex items-center gap-1 text-sm text-amber-600">
                        {Array.from({ length: snap.rating }).map((_, i) => (
                          <Star key={i} className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} />
                        ))}
                      </p>
                    )}
                    {snap.body || <i className="text-slate-400">(tanpa teks)</i>}
                  </div>
                  <Link href={snap.url} className="mt-2 inline-block text-xs font-semibold text-brand-700 hover:underline">
                    Lihat di tempat aslinya →
                  </Link>
                  <ul className="mt-3 space-y-1 text-xs text-slate-600">
                    {g.items.map((it, i) => (
                      <li key={i}>
                        <b>@{it.reporter}</b> — {contentReportReasonLabel(it.reason)}
                        {it.note ? `: “${it.note}”` : ""} <span className="text-slate-400">({timeAgo(it.at)})</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2">
                  {g.targetType === "product" && st && !st.hidden && (
                    <form action={suspendReportedProductAction} className="space-y-2 rounded-xl border border-amber-100 bg-amber-50/40 p-3">
                      {fields}
                      <label className="sr-only" htmlFor={`suspend-${g.targetId}`}>
                        Alasan penangguhan
                      </label>
                      <input id={`suspend-${g.targetId}`} name="reason" placeholder="Alasan (ditampilkan ke seller)" className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm" />
                      <SubmitButton variant="secondary" className="w-full" pendingText="…" confirm="Tangguhkan produk ini? Produk hilang dari katalog & tidak bisa diunduh.">
                        <PackageX className="h-4 w-4" /> Tangguhkan produk
                      </SubmitButton>
                    </form>
                  )}
                  {g.targetType === "product" && st?.hidden && <p className="text-xs font-semibold text-amber-700">Produk sudah ditangguhkan.</p>}
                  {AUTO_HIDE_TARGETS.includes(g.targetType) && st && !st.deleted && !st.hidden && (
                    <form action={hideContentAction} className="space-y-2 rounded-xl border border-amber-100 bg-amber-50/40 p-3">
                      {fields}
                      <label className="sr-only" htmlFor={`reason-${g.targetId}`}>
                        Alasan menyembunyikan
                      </label>
                      <input id={`reason-${g.targetId}`} name="reason" placeholder="Alasan (ditampilkan ke penulis)" className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm" />
                      <SubmitButton variant="secondary" className="w-full" pendingText="…">
                        <EyeOff className="h-4 w-4" /> Sembunyikan konten
                      </SubmitButton>
                    </form>
                  )}
                  {AUTO_HIDE_TARGETS.includes(g.targetType) && st && (st.autoHidden || st.hidden) ? (
                    <form action={restoreContentAction}>
                      {fields}
                      <SubmitButton variant="secondary" className="w-full" pendingText="…">
                        <RotateCcw className="h-4 w-4" /> Pulihkan &amp; tolak laporan
                      </SubmitButton>
                    </form>
                  ) : (
                    <form action={dismissContentReportsAction}>
                      {fields}
                      <SubmitButton variant="secondary" className="w-full" pendingText="…">
                        <MessageSquareX className="h-4 w-4" /> Tolak laporan (tidak melanggar)
                      </SubmitButton>
                    </form>
                  )}
                  {staff.role === "admin" && st && g.targetType !== "product" && st.authorRole === "user" && !st.authorBanned && (
                    <form action={banContentAuthorAction} className="rounded-xl border border-red-100 bg-red-50/50 p-3">
                      {fields}
                      <label className="sr-only" htmlFor={`ban-${g.targetId}`}>
                        Alasan blokir
                      </label>
                      <input id={`ban-${g.targetId}`} name="reason" placeholder="Alasan blokir" className="mb-2 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm" />
                      <SubmitButton variant="danger" className="w-full" pendingText="Memblokir…" confirm="Blokir akun ini? Semua sesinya dicabut, tidak bisa login, dan kontennya disembunyikan.">
                        <Ban className="h-4 w-4" /> Blokir akun penulis
                      </SubmitButton>
                    </form>
                  )}
                  {st?.authorBanned && <p className="text-xs font-semibold text-red-700">Penulis sudah diblokir.</p>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
