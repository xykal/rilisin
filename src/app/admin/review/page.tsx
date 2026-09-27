import { desc, eq } from "drizzle-orm";
import { ArrowRight, History, Inbox, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AndroidBadge, ProductIcon } from "@/components/bits";
import { PlatformIcon } from "@/components/icons";
import { Alert, Badge, Card, EmptyState } from "@/components/ui";
import { requireStaff } from "@/lib/auth/guards";
import { categoryLabel } from "@/lib/config";
import { db } from "@/lib/db";
import { moderationActions, users } from "@/lib/db/schema";
import { formatDateTime, timeAgo } from "@/lib/format";
import { getReviewQueue } from "@/lib/queries";

export const metadata: Metadata = { title: "Antrian review" };

const RESULT_MESSAGES: Record<string, string> = {
  disetujui: "Karya disetujui dan sudah tayang.",
  ditolak: "Karya ditolak — seller sudah bisa melihat alasannya.",
  "rilis-disetujui": "Rilis baru disetujui dan tayang.",
  "rilis-ditolak": "Rilis ditolak.",
};

const ACTION_LABELS: Record<string, string> = {
  approve: "menyetujui",
  reject: "menolak",
  reject_and_block: "menolak + memblokir file",
  feature: "menandai pilihan editor",
  unfeature: "menghapus pilihan editor",
  suspend: "menangguhkan",
  restore: "memulihkan",
  trust_seller: "menjadikan seller terpercaya",
  untrust_seller: "mencabut status terpercaya",
  android_checked: "mengecek bukti verifikasi Android",
  auto_publish_trusted: "tayang otomatis (seller terpercaya)",
};

export default async function ReviewQueuePage({ searchParams }: PageProps<"/admin/review">) {
  await requireStaff("/admin/review");
  const { hasil } = await searchParams;
  const [{ newProducts, releaseUpdates }, recent] = await Promise.all([
    getReviewQueue(),
    db
      .select({
        id: moderationActions.id,
        action: moderationActions.action,
        targetType: moderationActions.targetType,
        targetId: moderationActions.targetId,
        note: moderationActions.note,
        createdAt: moderationActions.createdAt,
        moderator: users.username,
      })
      .from(moderationActions)
      .leftJoin(users, eq(users.id, moderationActions.moderatorId))
      .orderBy(desc(moderationActions.createdAt))
      .limit(12),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold text-brand-700">Moderasi</p>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Antrian review</h1>
      <p className="mt-1 text-sm text-slate-500">Urut dari yang paling lama menunggu. Target: semua dicek &lt; 24 jam.</p>

      {typeof hasil === "string" && RESULT_MESSAGES[hasil] && (
        <Alert tone="success" className="mt-6">{RESULT_MESSAGES[hasil]}</Alert>
      )}

      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-ink">
          <Inbox className="h-5 w-5 text-brand-600" /> Karya baru <Badge tone="amber">{newProducts.length}</Badge>
        </h2>
        {newProducts.length === 0 ? (
          <EmptyState title="Tidak ada karya baru yang menunggu">Mantap, antrian bersih.</EmptyState>
        ) : (
          <Card className="divide-y divide-slate-100">
            {newProducts.map((p) => (
              <Link key={p.id} href={`/admin/review/${p.id}`} className="flex items-center gap-4 p-4 hover:bg-slate-50">
                <ProductIcon iconKey={p.iconKey} title={p.title} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-ink">{p.title}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    <span>@{p.sellerUsername}</span>·<span>{categoryLabel(p.category)}</span>·
                    <span className="flex gap-1">{p.platforms.map((pl) => <PlatformIcon key={pl} platform={pl} className="h-3.5 w-3.5" />)}</span>·
                    <span>akun dibuat {timeAgo(p.sellerCreatedAt)}</span>
                  </p>
                </div>
                {p.platforms.includes("android") && <AndroidBadge registration={p.androidRegistration} size="sm" />}
                <span className="hidden text-xs text-slate-500 sm:block">menunggu {timeAgo(p.submittedAt)}</span>
                <ArrowRight className="h-4 w-4 text-slate-300" />
              </Link>
            ))}
          </Card>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-ink">
          <RefreshCw className="h-5 w-5 text-brand-600" /> Update rilis <Badge tone="amber">{releaseUpdates.length}</Badge>
        </h2>
        {releaseUpdates.length === 0 ? (
          <EmptyState title="Tidak ada update rilis yang menunggu" />
        ) : (
          <Card className="divide-y divide-slate-100">
            {releaseUpdates.map((r) => (
              <Link key={r.releaseId} href={`/admin/review/${r.productId}`} className="flex items-center gap-4 p-4 hover:bg-slate-50">
                <ProductIcon iconKey={r.iconKey} title={r.title} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-ink">
                    {r.title} <span className="font-mono text-sm font-semibold text-brand-700">v{r.version}</span>
                  </p>
                  <p className="text-xs text-slate-500">@{r.sellerUsername} · menunggu {timeAgo(r.submittedAt)}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-300" />
              </Link>
            ))}
          </Card>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-ink">
          <History className="h-5 w-5 text-slate-400" /> Log moderasi terbaru
        </h2>
        <Card className="divide-y divide-slate-100 text-sm">
          {recent.length === 0 && <p className="p-4 text-slate-500">Belum ada aktivitas.</p>}
          {recent.map((a) => (
            <div key={a.id} className="flex flex-wrap items-baseline gap-x-2 px-4 py-3">
              <span className="font-semibold text-ink">{a.moderator ? `@${a.moderator}` : "Sistem"}</span>
              <span className="text-slate-600">{ACTION_LABELS[a.action] ?? a.action}</span>
              <span className="text-slate-400">({a.targetType})</span>
              {a.note && <span className="truncate text-slate-500">— {a.note}</span>}
              <span className="ml-auto text-xs text-slate-400">{formatDateTime(a.createdAt)}</span>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
