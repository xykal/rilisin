import { BadgeCheck, CalendarDays, Download, ExternalLink, Package } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Avatar } from "@/components/bits";
import { ProductGrid } from "@/components/product-card";
import { Card, EmptyState } from "@/components/ui";
import { formatCompact, formatDate } from "@/lib/format";
import { getSellerProfile } from "@/lib/queries";

const getProfile = cache(getSellerProfile);

export async function generateMetadata({ params }: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfile(decodeURIComponent(username));
  if (!profile) return { title: "Profil" };
  return { title: `${profile.storeName ?? profile.displayName} (@${profile.username})`, description: profile.tagline ?? undefined };
}

export default async function ProfilePage({ params }: PageProps<"/u/[username]">) {
  const { username } = await params;
  const profile = await getProfile(decodeURIComponent(username));
  if (!profile) notFound();
  const name = profile.storeName ?? profile.displayName;

  return (
    <div>
      <div className="h-40 bg-gradient-to-r from-brand-600 via-violet-500 to-fuchsia-500 sm:h-52" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Card className="-mt-16 p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <Avatar name={name} avatarKey={profile.avatarKey} size={96} className="ring-4 ring-white" />
            <div className="min-w-0 flex-1">
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold tracking-tight text-ink">
                {name}
                {profile.isTrusted && (
                  <span title="Seller terpercaya" className="text-brand-600">
                    <BadgeCheck className="h-6 w-6" />
                  </span>
                )}
              </h1>
              <p className="text-sm text-slate-500">@{profile.username}</p>
              {profile.tagline && <p className="mt-2 text-slate-700">{profile.tagline}</p>}
            </div>
            <div className="flex gap-3">
              <div className="rounded-2xl bg-slate-50 px-5 py-3 text-center">
                <p className="flex items-center justify-center gap-1.5 text-xl font-extrabold text-ink">
                  <Package className="h-4 w-4 text-slate-400" /> {profile.stats.products}
                </p>
                <p className="text-xs text-slate-500">karya</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-5 py-3 text-center">
                <p className="flex items-center justify-center gap-1.5 text-xl font-extrabold text-ink">
                  <Download className="h-4 w-4 text-slate-400" /> {formatCompact(profile.stats.downloads)}
                </p>
                <p className="text-xs text-slate-500">unduhan</p>
              </div>
            </div>
          </div>
          {(profile.bio || profile.websiteUrl) && (
            <div className="mt-6 border-t border-slate-100 pt-5 text-sm text-slate-600">
              {profile.bio && <p className="max-w-3xl whitespace-pre-line">{profile.bio}</p>}
              <div className="mt-3 flex flex-wrap gap-4 text-slate-500">
                {profile.websiteUrl && (
                  <a href={profile.websiteUrl} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1.5 font-medium text-brand-700 hover:underline">
                    <ExternalLink className="h-4 w-4" /> {profile.websiteUrl.replace(/^https?:\/\//, "")}
                  </a>
                )}
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" /> Bergabung {formatDate(profile.createdAt)}
                </span>
              </div>
            </div>
          )}
        </Card>

        <section className="py-10">
          <h2 className="mb-5 text-xl font-bold text-ink">Karya dari {name}</h2>
          {profile.items.length ? (
            <ProductGrid items={profile.items} />
          ) : (
            <EmptyState icon={<Package className="h-10 w-10" />} title="Belum ada karya yang tayang" />
          )}
        </section>
      </div>
    </div>
  );
}
