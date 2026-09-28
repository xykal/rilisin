import { BellRing, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, ProductIcon } from "@/components/bits";
import { FollowButton } from "@/components/follow-button";
import { Card, EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth/guards";
import { timeAgo } from "@/lib/format";
import { listFollowing } from "@/lib/follows";

export const metadata: Metadata = { title: "Diikuti", robots: { index: false } };

export default async function FollowingPage() {
  const user = await requireUser("/akun/diikuti");
  const { sellers, products } = await listFollowing(user.id);
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Diikuti</h1>
      <p className="mt-1 text-slate-500">
        Kamu dapat notifikasi saat seller ini merilis karya baru, dan saat karya ini punya versi baru atau devlog. Karya yang kamu unduh/beli otomatis diikuti.{" "}
        <Link href="/akun/notifikasi" className="font-semibold text-brand-700 hover:underline">
          Atur email
        </Link>
      </p>

      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-ink">
          <Store className="h-5 w-5 text-brand-600" /> Seller ({sellers.length})
        </h2>
        {sellers.length ? (
          <Card className="divide-y divide-slate-100">
            {sellers.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 p-4">
                <Link href={`/@${s.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={s.name} avatarKey={s.avatarKey} size={44} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink hover:text-brand-700">{s.name}</span>
                    <span className="block truncate text-xs text-slate-500">{s.tagline ?? `@${s.username}`} · diikuti {timeAgo(s.since)}</span>
                  </span>
                </Link>
                <FollowButton targetType="seller" targetId={s.id} following count={0} path="/akun/diikuti" state="can" compact className="[&>span]:hidden" />
              </div>
            ))}
          </Card>
        ) : (
          <EmptyState title="Belum mengikuti seller">Buka profil seller lalu tekan Ikuti untuk dapat kabar karya barunya.</EmptyState>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-ink">
          <BellRing className="h-5 w-5 text-brand-600" /> Karya ({products.length})
        </h2>
        {products.length ? (
          <Card className="divide-y divide-slate-100">
            {products.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                <Link href={`/p/${p.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <ProductIcon iconKey={p.iconKey} title={p.title} size={44} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink hover:text-brand-700">{p.title}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {p.latestVersion ? `v${p.latestVersion}` : "Belum ada rilis"} · diikuti {timeAgo(p.since)}
                    </span>
                  </span>
                </Link>
                <FollowButton targetType="product" targetId={p.id} following count={0} path="/akun/diikuti" state="can" compact className="[&>span]:hidden" />
              </div>
            ))}
          </Card>
        ) : (
          <EmptyState title="Belum mengikuti karya">Karya yang kamu unduh atau beli otomatis muncul di sini.</EmptyState>
        )}
      </section>
    </div>
  );
}
