import { desc, eq, or, sql } from "drizzle-orm";
import { ShieldCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import { setRoleAction } from "@/app/actions/admin-members";
import { Picker } from "@/components/picker";
import { Alert, Badge, Card, EmptyState } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { moderationActions, users } from "@/lib/db/schema";
import { timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Kelola anggota" };

const ROLE_TONE = { user: "slate", moderator: "blue", admin: "red" } as const;

const ERRORS: Record<string, string> = {
  self: "Tidak bisa mengubah peran akun sendiri.",
  terakhir: "Tidak bisa menurunkan admin terakhir — tunjuk admin lain dulu.",
  nilai: "Data peran tidak valid.",
  hilang: "Akun tidak ditemukan (mungkin baru dihapus).",
};

export default async function MembersPage({ searchParams }: PageProps<"/admin/anggota">) {
  await requireAdmin("/admin/anggota");
  const { q, hasil, error } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 60) : "";
  // Escape wildcard LIKE (jangan strip — username boleh mengandung _ dan %).
  const like = `%${query.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
  const match = (col: typeof users.username) => sql`${col} ILIKE ${like} ESCAPE '\\'`;

  const [list, audit] = await Promise.all([
    db
      .select({ id: users.id, username: users.username, displayName: users.displayName, email: users.email, role: users.role, createdAt: users.createdAt })
      .from(users)
      .where(query ? or(match(users.username), match(users.email), match(users.displayName)) : undefined)
      .orderBy(desc(users.createdAt))
      .limit(30),
    db
      .select({ note: moderationActions.note, createdAt: moderationActions.createdAt, targetId: moderationActions.targetId })
      .from(moderationActions)
      .where(eq(moderationActions.action, "set_role"))
      .orderBy(desc(moderationActions.createdAt))
      .limit(10),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold text-brand-700">Admin</p>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Kelola anggota</h1>
      <p className="mt-1 text-sm text-slate-500">Cari akun & atur peran: user biasa, moderator (jaga konten/chat), atau admin (akses penuh).</p>

      {hasil === "peran" && (
        <Alert tone="success" className="mt-6">Peran diperbarui & tercatat di audit.</Alert>
      )}
      {typeof error === "string" && ERRORS[error] && <Alert tone="danger" className="mt-6">{ERRORS[error]}</Alert>}

      <form method="get" action="/admin/anggota" className="mt-6 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Cari username / email / nama…"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
        <button type="submit" className="shrink-0 rounded-xl bg-ink px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800">
          Cari
        </button>
      </form>

      <section className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-ink">
          <Users className="h-5 w-5 text-brand-600" /> {query ? `Hasil pencarian "${query}"` : "Anggota terbaru"} <Badge tone="slate">{list.length}</Badge>
        </h2>
        {list.length === 0 ? (
          <EmptyState title="Tidak ada akun yang cocok">Coba kata kunci lain.</EmptyState>
        ) : (
          <div className="space-y-3">
            {list.map((u) => (
              <Card key={u.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">
                    {u.displayName} <span className="font-normal text-slate-500">@{u.username}</span>
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {u.email} · gabung {timeAgo(u.createdAt)}
                  </p>
                </div>
                <Badge tone={ROLE_TONE[u.role]}>{u.role}</Badge>
                <form action={setRoleAction} data-form={`role-${u.username}`} className="flex items-center gap-2">
                  <input type="hidden" name="userId" value={u.id} />
                  <Picker
                    name="role"
                    defaultValue={u.role}
                    ariaLabel={`Peran ${u.username}`}
                    className="min-w-36 flex-1"
                    options={[
                      { value: "user", label: "user" },
                      { value: "moderator", label: "moderator" },
                      { value: "admin", label: "admin" },
                    ]}
                  />
                  <button type="submit" className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-700">
                    Simpan
                  </button>
                </form>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-ink">
          <ShieldCheck className="h-5 w-5 text-brand-600" /> Riwayat perubahan peran
        </h2>
        {audit.length === 0 ? (
          <EmptyState title="Belum ada perubahan peran">Setiap perubahan tercatat di sini.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {audit.map((a, i) => (
              <li key={i} className="rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-700">
                <span className="font-mono text-xs">{a.note}</span> · <span className="text-xs text-slate-500">{timeAgo(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
