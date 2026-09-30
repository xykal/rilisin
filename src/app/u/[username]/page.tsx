import { BadgeCheck, CalendarDays, CheckCircle2, Download, ExternalLink, MapPin, MessageCircle, MessagesSquare, Package, Star, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Avatar } from "@/components/bits";
import { FollowButton } from "@/components/follow-button";
import { ThreadList } from "@/components/forum/thread-list";
import { ProductGrid } from "@/components/product-card";
import { ReportDialog } from "@/components/report-dialog";
import { Stars } from "@/components/stars";
import { Alert, Badge, Card, EmptyState } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { replyPath } from "@/lib/community/shared";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { formatCompact, formatDate, timeAgo } from "@/lib/format";
import { getFollowState } from "@/lib/follows";
import { getMemberActivity, getMemberStats, memberBadges } from "@/lib/profile";
import { getSellerProfile } from "@/lib/queries";
import { mediaUrl } from "@/lib/storage";
import { eq } from "drizzle-orm";
import { pageOg } from "@/lib/og";

const getProfile = cache(getSellerProfile);

export async function generateMetadata({ params }: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfile(decodeURIComponent(username));
  if (!profile) return { title: "Profil" };
  const title = `${profile.storeName ?? profile.displayName} (@${profile.username})`;
  const desc = profile.tagline ?? profile.bio ?? undefined;
  return { title, description: desc, ...pageOg(title, desc, `/u/${profile.username}`) };
}

function Stat({ icon: Icon, value, label }: { icon: typeof Package; value: string | number; label: string }) {
  return (
    <div className="min-w-[6.5rem] flex-1 rounded-2xl bg-slate-50 px-4 py-3 text-center">
      <p className="flex items-center justify-center gap-1.5 text-xl font-extrabold text-ink">
        <Icon className="h-4 w-4 text-slate-400" /> {value}
      </p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

export default async function ProfilePage({ params }: PageProps<"/u/[username]">) {
  const { username } = await params;
  const [profile, viewer] = await Promise.all([getProfile(decodeURIComponent(username)), getCurrentUser()]);
  if (!profile) notFound();
  const [[extra], stats, follow] = await Promise.all([
    db.select({ role: users.role, bannedAt: users.bannedAt }).from(users).where(eq(users.id, profile.id)).limit(1),
    getMemberStats(profile.id),
    profile.storeName ? getFollowState(viewer?.id, "seller", profile.id) : Promise.resolve(null),
  ]);
  const banned = Boolean(extra?.bannedAt);
  const isSeller = Boolean(profile.storeName);
  const self = viewer?.id === profile.id;
  const name = profile.storeName ?? profile.displayName;
  const badges = memberBadges({ role: extra?.role ?? "user", isSeller, isTrusted: Boolean(profile.isTrusted), stats });
  const activity = banned ? null : await getMemberActivity(profile.id);
  const path = `/@${profile.username}`;
  const cover = mediaUrl(profile.coverKey);
  const personalSite = profile.userWebsiteUrl && profile.userWebsiteUrl !== profile.websiteUrl ? profile.userWebsiteUrl : null;

  return (
    <div>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL sampul dinamis (driver storage apa pun)
        <img src={cover} alt="" className="h-40 w-full object-cover sm:h-52" />
      ) : (
        <div className="h-40 bg-gradient-to-r from-brand-600 via-violet-500 to-fuchsia-500 sm:h-52" />
      )}
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Card className="-mt-16 p-6 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
            <Avatar name={name} avatarKey={profile.avatarKey} size={96} className="ring-4 ring-white" />
            <div className="min-w-0 flex-1">
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold tracking-tight text-ink">
                <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
                {profile.isTrusted && (
                  <span title="Seller terpercaya" className="text-brand-600">
                    <BadgeCheck className="h-6 w-6" />
                  </span>
                )}
              </h1>
              <p className="text-sm text-slate-500">
                @{profile.username}
                {isSeller && profile.displayName !== name && <> · {profile.displayName}</>}
              </p>
              {badges.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {badges.map((b) => (
                    <Badge key={b.id} tone={b.tone}>
                      {b.label}
                    </Badge>
                  ))}
                </div>
              )}
              {profile.tagline && <p className="mt-2 text-slate-700">{profile.tagline}</p>}
            </div>
            <div className="flex flex-wrap gap-3 lg:max-w-md lg:justify-end">
              {isSeller && <Stat icon={Package} value={profile.stats.products} label="karya" />}
              {isSeller && <Stat icon={Download} value={formatCompact(profile.stats.downloads)} label="unduhan" />}
              {follow && <Stat icon={Users} value={formatCompact(follow.count)} label="pengikut" />}
              <Stat icon={MessagesSquare} value={stats.threads + stats.replies} label="postingan forum" />
              <Stat icon={CheckCircle2} value={stats.accepted} label="jawaban terbaik" />
              <Stat icon={Star} value={stats.reviews} label="ulasan" />
            </div>
          </div>

          {banned && (
            <Alert tone="danger" className="mt-6" title="Akun ini diblokir">
              Akun diblokir moderator karena melanggar aturan komunitas. Aktivitasnya disembunyikan.
            </Alert>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-slate-100 pt-5 text-sm text-slate-600">
            {!banned && isSeller && follow && (
              <FollowButton targetType="seller" targetId={profile.id} following={follow.following} count={follow.count} path={path} state={!viewer ? "guest" : self ? "self" : "can"} />
            )}
            <span className="flex items-center gap-1.5 text-slate-500">
              <CalendarDays className="h-4 w-4" /> Bergabung {formatDate(profile.createdAt)}
            </span>
            {!banned && profile.location && (
              <span className="flex items-center gap-1.5 text-slate-500">
                <MapPin className="h-4 w-4" /> {profile.location}
              </span>
            )}
            {profile.websiteUrl && (
              <a href={profile.websiteUrl} target="_blank" rel="noopener noreferrer nofollow" className="flex min-w-0 items-center gap-1.5 font-medium text-brand-700 hover:underline">
                <ExternalLink className="h-4 w-4 shrink-0" /> <span className="truncate">{profile.websiteUrl.replace(/^https?:\/\//, "")}</span>
              </a>
            )}
            {!banned && personalSite && (
              <a href={personalSite} target="_blank" rel="noopener noreferrer nofollow" className="flex min-w-0 items-center gap-1.5 font-medium text-brand-700 hover:underline">
                <ExternalLink className="h-4 w-4 shrink-0" /> <span className="truncate">{personalSite.replace(/^https?:\/\//, "")}</span>
              </a>
            )}
            {viewer && !self && !banned && <ReportDialog targetType="user" targetId={profile.id} label="Laporkan akun" className="ml-auto" />}
          </div>
          {profile.bio && !banned && <p className="mt-4 max-w-3xl whitespace-pre-line text-sm text-slate-600">{profile.bio}</p>}
        </Card>

        {!banned && isSeller && (
          <section className="pt-10">
            <h2 className="mb-5 text-xl font-bold text-ink">Karya dari {name}</h2>
            {profile.items.length ? <ProductGrid items={profile.items} /> : <EmptyState title="Belum ada karya yang tayang">Nantikan karya pertamanya.</EmptyState>}
          </section>
        )}

        {activity && (
          <div className="grid grid-cols-1 gap-6 py-10 lg:grid-cols-2">
            <section className="min-w-0">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-ink">
                <MessagesSquare className="h-5 w-5 text-brand-600" /> Thread terbaru
              </h2>
              <Card className="overflow-hidden">
                <ThreadList items={activity.threads} empty={<>Belum pernah membuat thread.</>} />
              </Card>
            </section>
            <section className="min-w-0">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-ink">
                <MessageCircle className="h-5 w-5 text-brand-600" /> Balasan terbaru
              </h2>
              <Card className="divide-y divide-slate-100">
                {activity.replies.length ? (
                  activity.replies.map((r) => (
                    <Link key={r.id} href={replyPath(r.threadId, r.id)} className="block px-5 py-4 hover:bg-slate-50">
                      <p className="truncate text-xs font-semibold text-brand-700">di {r.threadTitle}</p>
                      <p className="mt-1 line-clamp-2 break-words text-sm text-slate-700">{r.snippet}</p>
                      <p className="mt-1 text-xs text-slate-400">{timeAgo(r.createdAt)}</p>
                    </Link>
                  ))
                ) : (
                  <p className="px-5 py-12 text-center text-sm text-slate-500">Belum pernah membalas.</p>
                )}
              </Card>
            </section>
            <section className="min-w-0 lg:col-span-2">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-ink">
                <Star className="h-5 w-5 text-amber-500" fill="currentColor" strokeWidth={0} /> Ulasan yang ditulis
              </h2>
              {activity.reviews.length ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {activity.reviews.map((v) => (
                    <Link key={v.id} href={`/p/${v.productSlug}/ulasan#ulasan-${v.id}`} className="block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm hover:border-brand-200">
                      <p className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-semibold text-ink">{v.productTitle}</span>
                        <Stars value={v.rating} size={14} />
                      </p>
                      {v.body && <p className="mt-2 line-clamp-3 break-words text-sm text-slate-600">{v.body}</p>}
                      <p className="mt-2 text-xs text-slate-400">{timeAgo(v.createdAt)}</p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-300 px-5 py-8 text-center text-sm text-slate-500">Belum menulis ulasan.</p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
