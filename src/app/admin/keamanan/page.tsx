import { and, count, desc, eq, gt, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { Ban, Bot, KeyRound, Lock, ShieldAlert, UserX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { unbanUserAction } from "@/app/actions/moderation";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, cn } from "@/components/ui";
import { requireStaff, staffMfaRequired } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { securityEvents, users } from "@/lib/db/schema";
import { formatDateTime, msAgo, timeAgo } from "@/lib/format";
import { describeUserAgent, eventLabel } from "@/lib/security/labels";

export const metadata: Metadata = { title: "Log keamanan" };

const GROUPS = {
  semua: { label: "Semua", types: null },
  login: { label: "Login", types: ["login_success", "login_failed", "login_locked", "logout", "register", "bot_blocked"] },
  "2fa": { label: "2FA & akun", types: ["mfa_challenge_failed", "mfa_challenge_locked", "mfa_enabled", "mfa_disabled", "recovery_code_used", "recovery_codes_regenerated", "password_changed", "session_revoked", "sessions_revoked_all"] },
  chat: { label: "Chat", types: ["chat_blocked", "chat_report", "chat_auto_hidden"] },
  moderator: { label: "Aksi moderator", types: ["admin_ban", "admin_unban", "admin_mute", "admin_delete_message", "admin_restore_message", "admin_dismiss_report"] },
} as const;
type GroupKey = keyof typeof GROUPS;
const TONE = { green: "green", amber: "amber", red: "red", slate: "slate", blue: "blue", brand: "brand" } as const;

export default async function SecurityLogPage({ searchParams }: PageProps<"/admin/keamanan">) {
  const staff = await requireStaff("/admin/keamanan");
  const { jenis } = await searchParams;
  const group: GroupKey = typeof jenis === "string" && jenis in GROUPS ? (jenis as GroupKey) : "semua";
  const types = GROUPS[group].types;
  const since = msAgo(24 * 3_600_000);

  const countType = (t: string[]) =>
    db.select({ n: count() }).from(securityEvents).where(and(inArray(securityEvents.type, t), gt(securityEvents.createdAt, since)));

  const [events, [failed], [locked], [bots], [blocked], staffList, banned] = await Promise.all([
    db
      .select({
        id: securityEvents.id,
        type: securityEvents.type,
        ipHash: securityEvents.ipHash,
        userAgent: securityEvents.userAgent,
        meta: securityEvents.meta,
        createdAt: securityEvents.createdAt,
        username: users.username,
      })
      .from(securityEvents)
      .leftJoin(users, eq(users.id, securityEvents.userId))
      .where(types ? inArray(securityEvents.type, [...types]) : undefined)
      .orderBy(desc(securityEvents.createdAt))
      .limit(100),
    countType(["login_failed", "mfa_challenge_failed"]),
    countType(["login_locked", "mfa_challenge_locked"]),
    countType(["bot_blocked"]),
    countType(["chat_blocked"]),
    db
      .select({ id: users.id, username: users.username, role: users.role, mfa: users.totpEnabledAt })
      .from(users)
      .where(and(or(eq(users.role, "admin"), eq(users.role, "moderator")), isNull(users.bannedAt))),
    db
      .select({ id: users.id, username: users.username, reason: users.banReason, bannedAt: users.bannedAt })
      .from(users)
      .where(isNotNull(users.bannedAt))
      .orderBy(desc(users.bannedAt))
      .limit(20),
  ]);
  const staffWithout2fa = staffList.filter((s) => !s.mfa);

  const cards = [
    { icon: ShieldAlert, label: "Login / 2FA gagal (24 jam)", value: failed?.n ?? 0, tone: "text-amber-600 bg-amber-50" },
    { icon: Lock, label: "Akun terkunci sementara", value: locked?.n ?? 0, tone: "text-red-600 bg-red-50" },
    { icon: Bot, label: "Bot diblokir di form", value: bots?.n ?? 0, tone: "text-slate-600 bg-slate-100" },
    { icon: Ban, label: "Pesan judol/spam diblokir", value: blocked?.n ?? 0, tone: "text-rose-600 bg-rose-50" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold text-brand-700">Moderasi</p>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Log keamanan</h1>
      <p className="mt-1 text-sm text-slate-500">IP tidak disimpan mentah — hanya hash (UU PDP). Log dipakai untuk mendeteksi brute force, bot, dan penyalahgunaan.</p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="flex items-center gap-3 p-4">
            <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl", c.tone)}>
              <c.icon className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-2xl font-extrabold text-ink">{c.value}</span>
              <span className="text-xs text-slate-500">{c.label}</span>
            </span>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="flex items-center gap-2 font-bold text-ink">
            <KeyRound className="h-4 w-4 text-brand-600" /> 2FA akun staf
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {staffList.length - staffWithout2fa.length} dari {staffList.length} staf memakai 2FA.{" "}
            {staffMfaRequired() ? "Panel admin mewajibkan 2FA." : "Mode demo: 2FA staf belum diwajibkan (set REQUIRE_STAFF_2FA=1 di production)."}
          </p>
          {staffWithout2fa.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-1.5">
              {staffWithout2fa.map((s) => (
                <Badge key={s.id} tone="amber">@{s.username} ({s.role})</Badge>
              ))}
            </p>
          )}
        </Card>
        <Card className="p-5">
          <p className="flex items-center gap-2 font-bold text-ink">
            <UserX className="h-4 w-4 text-red-600" /> Akun diblokir
          </p>
          {banned.length === 0 ? (
            <p className="mt-1 text-sm text-slate-500">Tidak ada.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {banned.map((b) => (
                <li key={b.id} className="flex items-center gap-2 py-2">
                  <span className="min-w-0 flex-1">
                    <b>@{b.username}</b> <span className="text-slate-500">— {b.reason ?? "tanpa alasan"} · {timeAgo(b.bannedAt)}</span>
                  </span>
                  {staff.role === "admin" && (
                    <form action={unbanUserAction}>
                      <input type="hidden" name="userId" value={b.id} />
                      <SubmitButton variant="secondary" className="!px-2.5 !py-1 !text-xs" pendingText="…">
                        Buka blokir
                      </SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {(Object.keys(GROUPS) as GroupKey[]).map((k) => (
          <Link
            key={k}
            href={k === "semua" ? "/admin/keamanan" : `/admin/keamanan?jenis=${k}`}
            className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold", group === k ? "bg-ink text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}
          >
            {GROUPS[k].label}
          </Link>
        ))}
      </div>

      <Card className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Waktu</th>
              <th className="px-4 py-2.5">Kejadian</th>
              <th className="px-4 py-2.5">Akun</th>
              <th className="px-4 py-2.5">Perangkat · jaringan</th>
              <th className="px-4 py-2.5">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {events.map((e) => {
              const l = eventLabel(e.type);
              const meta = e.meta ?? {};
              const detail = Object.entries(meta)
                .filter(([k]) => k !== "sample")
                .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`)
                .join(" · ");
              return (
                <tr key={e.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500" title={formatDateTime(e.createdAt)}>
                    {timeAgo(e.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={TONE[l.tone]}>{l.label}</Badge>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-ink">{e.username ? `@${e.username}` : <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {describeUserAgent(e.userAgent)}
                    {e.ipHash ? ` · #${e.ipHash.slice(0, 8)}` : ""}
                  </td>
                  <td className="max-w-xs px-4 py-2.5 text-xs text-slate-500">
                    {detail}
                    {typeof meta.sample === "string" && <span className="mt-0.5 block truncate italic text-rose-700">“{meta.sample}”</span>}
                  </td>
                </tr>
              );
            })}
            {events.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Belum ada kejadian.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
