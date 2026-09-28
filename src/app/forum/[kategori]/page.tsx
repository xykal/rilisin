import { CheckCircle2, Megaphone, Plus } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryChips, ForumSidebar, Pager, SortTabs } from "@/components/forum/forum-parts";
import { ThreadList } from "@/components/forum/thread-list";
import { Alert, ButtonLink, Card } from "@/components/ui";
import { getCurrentUser, isStaff } from "@/lib/auth/current-user";
import { parseForumSort, type ForumSort } from "@/lib/community/shared";
import { getCategoryBySlug, getForumCategories, listThreads } from "@/lib/forum";

export async function generateMetadata({ params }: PageProps<"/forum/[kategori]">): Promise<Metadata> {
  const { kategori } = await params;
  const c = await getCategoryBySlug(kategori);
  return c ? { title: `${c.name} — Forum`, description: c.description } : { title: "Forum" };
}

export default async function ForumCategoryPage({ params, searchParams }: PageProps<"/forum/[kategori]">) {
  const { kategori } = await params;
  const sp = await searchParams;
  const [category, user] = await Promise.all([getCategoryBySlug(kategori), getCurrentUser()]);
  if (!category) notFound();
  const sort = parseForumSort(typeof sp.urut === "string" ? sp.urut : undefined);
  const page = Math.max(1, Number.parseInt(typeof sp.hal === "string" ? sp.hal : "1", 10) || 1);
  const [categories, list] = await Promise.all([getForumCategories(), listThreads({ categoryId: category.id, sort, page })]);
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const href = (patch: { urut?: ForumSort; hal?: number }) => {
    const p = new URLSearchParams();
    const u = patch.urut ?? sort;
    if (u !== "aktif") p.set("urut", u);
    if (patch.hal && patch.hal > 1) p.set("hal", String(patch.hal));
    const s = p.toString();
    return s ? `/forum/${category.slug}?${s}` : `/forum/${category.slug}`;
  };
  const canPost = category.kind !== "announcement" || isStaff(user);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-3xl shadow-sm ring-1 ring-slate-200" aria-hidden="true">
            {category.emoji}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-500">Forum</p>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{category.name}</h1>
            <p className="mt-1 text-slate-500">{category.description}</p>
          </div>
        </div>
        {canPost && (
          <ButtonLink href={`/forum/baru?kategori=${category.slug}`}>
            <Plus className="h-4 w-4" /> Buat thread
          </ButtonLink>
        )}
      </div>

      {sp.dihapus === "1" && (
        <Alert tone="success" className="mb-4">
          Thread dihapus.
        </Alert>
      )}
      {category.kind === "qa" && (
        <Alert tone="info" className="mb-4" title={<span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Kategori tanya jawab</span>}>
          Penanya bisa menandai satu balasan sebagai <b>jawaban terbaik</b> — muncul paling atas supaya orang berikutnya cepat ketemu solusinya.
        </Alert>
      )}
      {category.kind === "announcement" && (
        <Alert tone="info" className="mb-4" title={<span className="flex items-center gap-2"><Megaphone className="h-4 w-4" /> Pengumuman resmi</span>}>
          Hanya tim Rilisin yang bisa membuat thread di sini. Kamu tetap bisa membalas & bertanya di thread yang tidak dikunci.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          <CategoryChips categories={categories} active={category.slug} />
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 p-3">
              <SortTabs sort={sort} hrefFor={(s) => href({ urut: s })} hideUnanswered={category.kind === "announcement"} />
            </div>
            <ThreadList items={list.items} showCategory={false} empty={<>Belum ada thread di {category.name}. Jadilah yang pertama!</>} />
          </Card>
          <Pager page={list.page} totalPages={totalPages} hrefFor={(p) => href({ hal: p })} />
        </div>
        <div className="max-lg:hidden">
          <ForumSidebar categories={categories} active={category.slug} />
        </div>
      </div>
    </div>
  );
}
