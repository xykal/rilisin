import { desc, eq } from "drizzle-orm";
import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { revokeApiKeyAction } from "@/app/actions/api-keys";
import { ApiKeyForm } from "@/components/api-key-form";
import { Alert, Badge, Card, EmptyState } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SCOPE_LABELS, type ApiScope } from "@/lib/api-keys";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "API key" };

export default async function ApiKeyPage({ searchParams }: PageProps<"/akun/api-key">) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-5xl">🔑</p>
        <h1 className="mt-4 text-2xl font-extrabold text-ink">Masuk dulu</h1>
        <Link
          href="/masuk?next=/akun/api-key"
          className="mt-6 inline-block rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-700"
        >
          Masuk / Daftar
        </Link>
      </div>
    );
  }
  const { hasil } = await searchParams;
  const allowed: ApiScope[] = [];
  if (user.seller?.status === "approved") allowed.push("seller:read", "seller:write");
  if (user.role === "admin" || user.role === "moderator") allowed.push("admin:read");
  const keys = await db
    .select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, scopes: apiKeys.scopes, lastUsedAt: apiKeys.lastUsedAt, expiresAt: apiKeys.expiresAt, revokedAt: apiKeys.revokedAt, createdAt: apiKeys.createdAt })
    .from(apiKeys)
    .where(eq(apiKeys.userId, user.id))
    .orderBy(desc(apiKeys.createdAt))
    .limit(25);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold text-brand-700">Akun</p>
      <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight text-ink">
        <KeyRound className="h-7 w-7 text-brand-600" /> API key
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Key ini dipakai AI agent / integrasi lewat header <code className="rounded bg-slate-100 px-1 font-mono text-xs">Authorization: Bearer rsk_…</code>.{" "}
        <Link href="/panduan/api" className="font-semibold text-violet-700 hover:underline">
          Baca dokumentasi →
        </Link>
      </p>

      {hasil === "cabut" && <Alert tone="success" className="mt-6">API key dicabut — tidak bisa dipakai lagi.</Alert>}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-ink">Buat key baru</h2>
        <ApiKeyForm allowed={allowed} />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-ink">
          Key milikmu <Badge tone="slate">{keys.filter((k) => !k.revokedAt).length} aktif</Badge>
        </h2>
        {keys.length === 0 ? (
          <EmptyState title="Belum ada API key">Buat satu di atas untuk mulai.</EmptyState>
        ) : (
          <div className="space-y-3">
            {keys.map((k) => (
              <Card key={k.id} className={`p-4 ${k.revokedAt ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-ink">{k.name}</p>
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">{k.prefix}…</code>
                  {k.revokedAt ? <Badge tone="red">dicabut</Badge> : k.expiresAt && k.expiresAt < new Date() ? <Badge tone="amber">kedaluwarsa</Badge> : <Badge tone="green">aktif</Badge>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(k.scopes as ApiScope[]).map((s) => (
                    <span key={s} title={SCOPE_LABELS[s] ?? s} className="rounded-full bg-brand-50 px-2 py-0.5 font-mono text-[11px] font-bold text-brand-700">
                      {s}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  dibuat {timeAgo(k.createdAt)}
                  {k.lastUsedAt ? ` · dipakai ${timeAgo(k.lastUsedAt)}` : " · belum pernah dipakai"}
                  {k.expiresAt ? ` · kedaluwarsa ${timeAgo(k.expiresAt)}` : ""}
                </p>
                {!k.revokedAt && (
                  <form action={revokeApiKeyAction} data-form={`apikey-revoke-${k.id}`} className="mt-3">
                    <input type="hidden" name="keyId" value={k.id} />
                    <button type="submit" className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-bold text-red-700 hover:bg-red-50">
                      Cabut key ini
                    </button>
                  </form>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
