import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import {
  AlertTriangle,
  CheckCircle2,
  History,
  KeyRound,
  LaptopMinimal,
  LogOut,
  ShieldCheck,
  ShieldOff,
  Smartphone,
} from "lucide-react";
import type { Metadata } from "next";
import { revokeOtherSessionsAction, revokeSessionAction, startTotpSetupAction } from "@/app/actions/security";
import { ChangePasswordForm, DisableTotpForm, RegenerateCodesForm } from "@/components/security-forms";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Card } from "@/components/ui";
import { requireUser, staffMfaRequired } from "@/lib/auth/guards";
import { isStaff } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { recoveryCodes, securityEvents, sessions, users } from "@/lib/db/schema";
import { formatDateTime, isWithin, timeAgo } from "@/lib/format";
import { describeUserAgent, eventLabel, isMobileUserAgent } from "@/lib/security/labels";

export const metadata: Metadata = { title: "Keamanan akun", robots: { index: false } };

const TONE_TO_BADGE = { green: "green", amber: "amber", red: "red", slate: "slate", blue: "blue", brand: "brand" } as const;

export default async function SecurityPage({ searchParams }: PageProps<"/akun/keamanan">) {
  const user = await requireUser("/akun/keamanan");
  const { wajib } = await searchParams;

  const [mySessions, events, [codesLeft], [profile]] = await Promise.all([
    db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.lastSeenAt)),
    db.select().from(securityEvents).where(eq(securityEvents.userId, user.id)).orderBy(desc(securityEvents.createdAt)).limit(15),
    db.select({ n: count() }).from(recoveryCodes).where(and(eq(recoveryCodes.userId, user.id), isNull(recoveryCodes.usedAt))),
    db.select({ passwordChangedAt: users.passwordChangedAt, totpEnabledAt: users.totpEnabledAt }).from(users).where(eq(users.id, user.id)),
  ]);
  const others = mySessions.filter((s) => s.id !== user.sessionId).length;
  const failed24h = events.filter((e) => e.type === "login_failed" && isWithin(e.createdAt, 86_400_000)).length;

  const checks = [
    { ok: user.mfaEnabled, label: "Verifikasi 2 langkah (2FA)", hint: user.mfaEnabled ? "Aktif" : "Belum aktif — sangat disarankan" },
    { ok: others <= 2, label: "Perangkat yang login", hint: `${mySessions.length} perangkat aktif` },
    { ok: failed24h === 0, label: "Percobaan masuk gagal (24 jam)", hint: failed24h ? `${failed24h} kali — ganti password kalau itu bukan kamu` : "Tidak ada" },
  ];
  const score = checks.filter((c) => c.ok).length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Keamanan akun</h1>
      <p className="mt-1 text-slate-600">Atur 2FA, password, dan perangkat yang sedang masuk ke akun @{user.username}.</p>

      {wajib === "2fa" && (
        <Alert tone="warning" className="mt-6" title="Akun staf wajib memakai 2FA">
          Untuk membuka panel admin/moderator, aktifkan verifikasi 2 langkah terlebih dahulu.
        </Alert>
      )}
      {isStaff(user) && !user.mfaEnabled && wajib !== "2fa" && (
        <Alert tone="warning" className="mt-6" title="Kamu admin/moderator tanpa 2FA">
          Akun staf adalah target utama peretas. {staffMfaRequired() ? "2FA wajib untuk panel admin." : "Di production, 2FA diwajibkan untuk panel admin (REQUIRE_STAFF_2FA=1)."}
        </Alert>
      )}

      {/* Ringkasan */}
      <Card className="mt-6 overflow-hidden">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
          <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${score === 3 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
            {score === 3 ? <ShieldCheck className="h-8 w-8" /> : <AlertTriangle className="h-8 w-8" />}
          </span>
          <div className="flex-1">
            <p className="text-lg font-bold text-ink">{score === 3 ? "Akunmu terlindungi dengan baik" : "Keamanan akunmu bisa ditingkatkan"}</p>
            <ul className="mt-2 grid gap-1.5 text-sm sm:grid-cols-3">
              {checks.map((c) => (
                <li key={c.label} className="flex items-start gap-2">
                  {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                  <span>
                    <span className="block font-semibold text-slate-800">{c.label}</span>
                    <span className="text-slate-500">{c.hint}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      {/* 2FA */}
      <Card className="mt-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <KeyRound className="mt-0.5 h-6 w-6 text-brand-600" />
            <div>
              <h2 className="text-lg font-bold text-ink">Verifikasi 2 langkah (2FA)</h2>
              <p className="mt-0.5 max-w-xl text-sm text-slate-600">
                Selain password, setiap masuk butuh kode 6 digit dari aplikasi authenticator di HP (Google Authenticator, Microsoft
                Authenticator, Authy, 1Password, Bitwarden). Password bocor pun akun tetap aman.
              </p>
            </div>
          </div>
          {user.mfaEnabled ? (
            <Badge tone="green">
              <ShieldCheck className="h-3.5 w-3.5" /> Aktif sejak {formatDateTime(profile?.totpEnabledAt)}
            </Badge>
          ) : (
            <form action={startTotpSetupAction}>
              <SubmitButton pendingText="Menyiapkan…">Aktifkan 2FA</SubmitButton>
            </form>
          )}
        </div>
        {user.mfaEnabled && (
          <div className="mt-6 space-y-6 border-t border-slate-100 pt-6">
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Kode cadangan tersisa: <span className={(codesLeft?.n ?? 0) <= 3 ? "text-amber-700" : "text-emerald-700"}>{codesLeft?.n ?? 0} dari 10</span>
              </p>
              <p className="mb-3 text-sm text-slate-500">Buat ulang kalau kode lama hilang atau hampir habis.</p>
              <RegenerateCodesForm />
            </div>
            <details className="group rounded-xl border border-red-100 bg-red-50/40 p-4">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-red-700">
                <ShieldOff className="h-4 w-4" /> Matikan 2FA
              </summary>
              <div className="mt-4">
                <DisableTotpForm />
              </div>
            </details>
          </div>
        )}
      </Card>

      {/* Password */}
      <Card className="mt-6 p-6">
        <h2 className="text-lg font-bold text-ink">Ganti password</h2>
        <p className="mb-4 mt-0.5 text-sm text-slate-500">
          Terakhir diganti: {profile?.passwordChangedAt ? timeAgo(profile.passwordChangedAt) : "belum pernah"}. Setelah diganti, semua perangkat lain otomatis dikeluarkan.
        </p>
        <ChangePasswordForm />
      </Card>

      {/* Perangkat */}
      <Card className="mt-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">Perangkat yang sedang masuk</h2>
            <p className="mt-0.5 text-sm text-slate-500">Tidak kenal salah satunya? Keluarkan, lalu ganti password.</p>
          </div>
          {others > 0 && (
            <form action={revokeOtherSessionsAction}>
              <SubmitButton variant="danger" className="!py-2" pendingText="Mengeluarkan…">
                <LogOut className="h-4 w-4" /> Keluar dari {others} perangkat lain
              </SubmitButton>
            </form>
          )}
        </div>
        <ul className="mt-4 divide-y divide-slate-100">
          {mySessions.map((s) => {
            const current = s.id === user.sessionId;
            const Icon = isMobileUserAgent(s.userAgent) ? Smartphone : LaptopMinimal;
            return (
              <li key={s.id} className="flex items-center gap-4 py-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                    {describeUserAgent(s.userAgent)}
                    {current && <Badge tone="green">Perangkat ini</Badge>}
                  </p>
                  <p className="text-xs text-slate-500">
                    Masuk {formatDateTime(s.createdAt)} · aktif {timeAgo(s.lastSeenAt ?? s.createdAt)}
                    {s.ipHash ? ` · jaringan #${s.ipHash.slice(0, 6)}` : ""}
                  </p>
                </div>
                {!current && (
                  <form action={revokeSessionAction}>
                    <input type="hidden" name="sessionId" value={s.id} />
                    <SubmitButton variant="secondary" className="!px-3 !py-1.5 !text-xs" pendingText="…">
                      Keluarkan
                    </SubmitButton>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Aktivitas */}
      <Card className="mt-6 p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <History className="h-5 w-5 text-slate-500" /> Aktivitas keamanan terbaru
        </h2>
        {events.length ? (
          <ul className="mt-3 divide-y divide-slate-100">
            {events.map((e) => {
              const l = eventLabel(e.type);
              return (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="flex items-center gap-2">
                    <Badge tone={TONE_TO_BADGE[l.tone]}>{l.label}</Badge>
                    <span className="text-slate-500">{describeUserAgent(e.userAgent)}</span>
                  </span>
                  <span className="text-xs text-slate-400" title={formatDateTime(e.createdAt)}>
                    {timeAgo(e.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Belum ada aktivitas tercatat.</p>
        )}
      </Card>

      <Alert tone="info" className="mt-6" title="Waspada penipuan">
        Tim Rilisin tidak akan pernah meminta password, kode OTP, atau kode 2FA — lewat chat, email, WhatsApp, maupun telepon. Jangan
        masukkan password di situs selain domain resmi Rilisin.
      </Alert>
    </div>
  );
}
