import { eq } from "drizzle-orm";
import { BadgeCheck, Clock, Inbox } from "lucide-react";
import type { Metadata } from "next";
import { Alert, Badge, Card, EmptyState } from "@/components/ui";
import { approveSellerAction, rejectSellerAction } from "@/app/actions/admin";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { sellerProfiles, users } from "@/lib/db/schema";
import { timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Pengajuan toko" };

const RESULT_MESSAGES: Record<string, string> = {
  disetujui: "Toko disetujui — pemohon sudah bisa jualan.",
  ditolak: "Toko ditolak — pemohon bisa melihat alasan & mengajukan ulang.",
};

export default async function SellerQueuePage({ searchParams }: PageProps<"/admin/penjual">) {
  await requireAdmin("/admin/penjual");
  const { hasil, error } = await searchParams;
  const queue = await db
    .select({
      userId: sellerProfiles.userId,
      storeName: sellerProfiles.storeName,
      tagline: sellerProfiles.tagline,
      websiteUrl: sellerProfiles.websiteUrl,
      phone: sellerProfiles.phone,
      portfolioUrl: sellerProfiles.portfolioUrl,
      activatedAt: sellerProfiles.activatedAt,
      username: users.username,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      userCreatedAt: users.createdAt,
    })
    .from(sellerProfiles)
    .innerJoin(users, eq(users.id, sellerProfiles.userId))
    .where(eq(sellerProfiles.status, "pending"))
    .orderBy(sellerProfiles.activatedAt);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold text-brand-700">Moderasi</p>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Pengajuan toko</h1>
      <p className="mt-1 text-sm text-slate-500">Urut dari yang paling lama menunggu. Cek nama toko, website, & umur akun sebelum menyetujui.</p>

      {typeof hasil === "string" && RESULT_MESSAGES[hasil] && (
        <Alert tone="success" className="mt-6">{RESULT_MESSAGES[hasil]}</Alert>
      )}
      {error === "alasan" && (
        <Alert tone="danger" className="mt-6">Alasan penolakan minimal 10 karakter — pemohon berhak tahu kenapa.</Alert>
      )}

      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-ink">
          <Inbox className="h-5 w-5 text-brand-600" /> Menunggu keputusan <Badge tone="amber">{queue.length}</Badge>
        </h2>
        {queue.length === 0 ? (
          <EmptyState title="Tidak ada pengajuan toko yang menunggu">Mantap, antrean bersih.</EmptyState>
        ) : (
          <div className="space-y-4">
            {queue.map((q) => (
              <Card key={q.userId} className="p-5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="text-lg font-bold text-ink">{q.storeName}</p>
                  <p className="text-sm text-slate-500">@{q.username} · {q.email}</p>
                </div>
                {q.tagline && <p className="mt-1 text-sm text-slate-600">{q.tagline}</p>}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    {q.emailVerifiedAt ? <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" /> : <Clock className="h-3.5 w-3.5 text-red-500" />}
                    email {q.emailVerifiedAt ? "terverifikasi" : "BELUM terverifikasi"}
                  </span>
                  <span>akun dibuat {timeAgo(q.userCreatedAt)}</span>
                  <span>mengajukan {timeAgo(q.activatedAt)}</span>
                  {q.websiteUrl && <span className="break-all">situs: {q.websiteUrl}</span>}
                  {q.phone && <span>HP: {q.phone}</span>}
                  {q.portfolioUrl && <span className="break-all">portofolio: {q.portfolioUrl}</span>}
                </div>
                <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 lg:flex-row">
                  <form action={approveSellerAction} className="shrink-0">
                    <input type="hidden" name="userId" value={q.userId} />
                    <button type="submit" className="w-full rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 lg:w-auto">
                      Setujui toko
                    </button>
                  </form>
                  <form action={rejectSellerAction} className="flex flex-1 flex-col gap-2 sm:flex-row">
                    <input type="hidden" name="userId" value={q.userId} />
                    <input name="reason" required minLength={10} maxLength={500} placeholder="Alasan penolakan (dilihat pemohon)" className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-ink placeholder:text-slate-400" />
                    <button type="submit" className="shrink-0 rounded-xl border border-red-200 bg-white px-5 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50">
                      Tolak
                    </button>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
