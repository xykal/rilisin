import { Bell, CheckCheck, Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { markAllReadAction } from "@/app/actions/notifications";
import { NotificationIcon } from "@/components/notification-icon";
import { SubmitButton } from "@/components/submit-button";
import { ButtonLink, Card, EmptyState, buttonStyles, cn } from "@/components/ui";
import { requireUser } from "@/lib/auth/guards";
import { formatDateTime, timeAgo } from "@/lib/format";
import { countNotifications, getUnreadCount, listNotifications } from "@/lib/notifications/server";

export const metadata: Metadata = { title: "Notifikasi", robots: { index: false } };

const PAGE_SIZE = 20;

export default async function NotificationsPage({ searchParams }: PageProps<"/notifikasi">) {
  const sp = await searchParams;
  const user = await requireUser("/notifikasi");
  const unreadOnly = sp.tab === "belum-dibaca";
  const page = Math.max(1, Math.min(Number.parseInt(typeof sp.hal === "string" ? sp.hal : "1", 10) || 1, 50));
  const [items, total, unread] = await Promise.all([
    listNotifications(user.id, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, unreadOnly }),
    countNotifications(user.id, unreadOnly),
    getUnreadCount(user.id),
  ]);
  const totalPages = Math.max(1, Math.min(50, Math.ceil(total / PAGE_SIZE)));
  const href = (p: number) => {
    const q = new URLSearchParams();
    if (unreadOnly) q.set("tab", "belum-dibaca");
    if (p > 1) q.set("hal", String(p));
    const s = q.toString();
    return s ? `/notifikasi?${s}` : "/notifikasi";
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Notifikasi</h1>
          <p className="mt-1 text-sm text-slate-500">{unread ? `${unread} belum dibaca` : "Semua sudah dibaca"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unread > 0 && (
            <form action={markAllReadAction}>
              <SubmitButton variant="secondary" className={buttonStyles.small} pendingText="Menandai…">
                <CheckCheck className="h-3.5 w-3.5" /> Tandai semua dibaca
              </SubmitButton>
            </form>
          )}
          <Link href="/akun/notifikasi" className={cn(buttonStyles.ghost, buttonStyles.small)}>
            <Settings className="h-3.5 w-3.5" /> Pengaturan
          </Link>
        </div>
      </div>

      <div className="mb-4 flex gap-1" role="tablist" aria-label="Filter notifikasi">
        {[
          { id: "semua", label: "Semua", href: "/notifikasi", active: !unreadOnly },
          { id: "belum-dibaca", label: `Belum dibaca${unread ? ` (${unread})` : ""}`, href: "/notifikasi?tab=belum-dibaca", active: unreadOnly },
        ].map((t) => (
          <Link
            key={t.id}
            href={t.href}
            role="tab"
            aria-selected={t.active}
            className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium", t.active ? "bg-ink text-white" : "text-slate-600 hover:bg-slate-100")}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {items.length ? (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {items.map((n) => (
              <li key={n.id}>
                <a href={n.href} className={cn("flex gap-3 px-4 py-4 hover:bg-slate-50 sm:px-5", !n.read && "bg-brand-50/50")} data-notification={n.type}>
                  <NotificationIcon type={n.type} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block break-words text-sm leading-snug text-ink", !n.read && "font-semibold")}>{n.title}</span>
                    {n.body && <span className="mt-0.5 block break-words text-sm text-slate-500">{n.body}</span>}
                    <span className="mt-1 block text-xs text-slate-400" title={formatDateTime(n.at)}>
                      {timeAgo(n.at)}
                      {n.count > 1 && ` · ${n.count} kejadian`}
                    </span>
                  </span>
                  {!n.read && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-600" aria-label="Belum dibaca" />}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState icon={<Bell className="h-8 w-8" />} title={unreadOnly ? "Tidak ada yang belum dibaca" : "Belum ada notifikasi"}>
          Balasan di thread kamu, mention @{user.username}, ulasan, penjualan, dan status pencairan akan muncul di sini.
        </EmptyState>
      )}

      {totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Halaman notifikasi">
          {page > 1 ? <ButtonLink href={href(page - 1)} variant="secondary">← Sebelumnya</ButtonLink> : <span />}
          <span className="text-sm text-slate-500">
            Halaman {page} dari {totalPages}
          </span>
          {page < totalPages ? <ButtonLink href={href(page + 1)} variant="secondary">Berikutnya →</ButtonLink> : <span />}
        </nav>
      )}
    </div>
  );
}
