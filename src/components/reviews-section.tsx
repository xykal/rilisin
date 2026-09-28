import { BadgeCheck, EyeOff, MessageSquareReply, PencilLine, RotateCcw, ShieldAlert, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { deleteReviewAction, deleteReviewReplyAction, moderateReviewAction } from "@/app/actions/reviews";
import { isStaff, type CurrentUser } from "@/lib/auth/current-user";
import { formatRating, REVIEW_LIMITS } from "@/lib/community/shared";
import { formatDate, timeAgo } from "@/lib/format";
import { getMyReview, getRatingDistribution, listReviews, reviewEligibility, REVIEW_SORTS, type ReviewDTO, type ReviewSort } from "@/lib/reviews";
import { Avatar } from "./bits";
import { ReportDialog } from "./report-dialog";
import { ReviewForm, SellerReplyForm } from "./review-forms";
import { Stars } from "./stars";
import { SubmitButton } from "./submit-button";
import { Alert, Badge, ButtonLink, Card, cn, inputStyles } from "./ui";

type ProductLite = {
  id: string;
  slug: string;
  title: string;
  sellerId: string;
  status: string;
  ratingCount: number;
  ratingSum: number;
};

export function RatingSummary({
  product,
  dist,
  linkBase,
  activeStar,
}: {
  product: Pick<ProductLite, "ratingCount" | "ratingSum">;
  dist: { star: number; n: number }[];
  /** Kalau diisi, tiap baris bintang jadi link filter (halaman semua ulasan). */
  linkBase?: string;
  activeStar?: number | null;
}) {
  const count = product.ratingCount;
  const avg = count ? product.ratingSum / count : 0;
  const max = Math.max(1, ...dist.map((d) => d.n));
  return (
    <div className="rounded-2xl bg-slate-50 p-5">
      <div className="text-center">
        <p className="text-4xl font-extrabold tracking-tight text-ink">{count ? formatRating(product.ratingSum, count) : "–"}</p>
        <Stars value={avg} size={18} className="mt-1" />
        <p className="mt-1 text-sm text-slate-500">{count ? `${count} ulasan` : "Belum ada ulasan"}</p>
      </div>
      <ul className="mt-4 space-y-1.5">
        {dist.map((d) => {
          const row = (
            <>
              <span className="w-3 text-right font-semibold text-slate-600">{d.star}</span>
              <Star className="h-3 w-3 shrink-0 text-amber-400" fill="currentColor" strokeWidth={0} />
              <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200">
                <span className="block h-2 rounded-full bg-amber-400" style={{ width: `${(d.n / max) * 100}%` }} />
              </span>
              <span className="w-6 text-right tabular-nums text-slate-500">{d.n}</span>
            </>
          );
          return (
            <li key={d.star}>
              {linkBase ? (
                <Link
                  href={activeStar === d.star ? linkBase : `${linkBase}?bintang=${d.star}`}
                  aria-current={activeStar === d.star ? "true" : undefined}
                  className={cn("-mx-1.5 flex items-center gap-2 rounded-lg px-1.5 py-0.5 text-xs hover:bg-white", activeStar === d.star && "bg-white ring-1 ring-amber-300")}
                  aria-label={`Tampilkan ulasan ${d.star} bintang (${d.n})`}
                >
                  {row}
                </Link>
              ) : (
                <div className="flex items-center gap-2 text-xs">{row}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

async function WriterBlock({ product, user }: { product: ProductLite; user: CurrentUser | null }) {
  const nextHref = `/masuk?next=${encodeURIComponent(`/p/${product.slug}#ulasan`)}`;
  if (!user) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-5">
        <p className="font-semibold text-ink">Sudah pakai {product.title}?</p>
        <p className="mt-1 text-sm text-slate-500">Masuk dulu untuk menulis ulasan. Hanya yang sudah mengunduh / membeli yang bisa mengulas.</p>
        <ButtonLink href={nextHref} variant="secondary" className="mt-3">
          Masuk untuk mengulas
        </ButtonLink>
      </div>
    );
  }
  const elig = await reviewEligibility(user, product);
  if (!elig.ok) {
    const text =
      elig.reason === "seller"
        ? "Ini karyamu — kamu tidak bisa mengulasnya sendiri, tapi bisa membalas setiap ulasan di bawah."
        : elig.reason === "not_owner"
          ? "Hanya pemilik yang bisa memberi ulasan (anti ulasan palsu). Download atau beli dulu, lalu kembali ke sini."
          : "Produk ini belum bisa diulas.";
    return (
      <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">
        <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
        <p>{text}</p>
      </div>
    );
  }
  const mine = await getMyReview(product.id, user.id);
  if (!mine) {
    return (
      <div className="rounded-2xl border border-slate-200 p-5">
        <p className="mb-3 font-semibold text-ink">Tulis ulasan</p>
        <ReviewForm productId={product.id} initial={null} />
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-ink">Ulasan kamu</p>
        <Stars value={mine.rating} size={16} />
      </div>
      {(mine.hiddenAt || mine.reportHiddenAt) && (
        <Alert tone="warning" className="mt-3" title="Ulasanmu sedang disembunyikan">
          {mine.hiddenAt ? `Moderator: ${mine.hiddenReason ?? "melanggar aturan"}` : "Beberapa anggota melaporkannya — menunggu peninjauan moderator."}
        </Alert>
      )}
      {mine.body && <p className="mt-2 line-clamp-3 whitespace-pre-line break-words text-sm text-slate-700">{mine.body}</p>}
      <details className="mt-3">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline [&::-webkit-details-marker]:hidden">
          <PencilLine className="h-4 w-4" /> Ubah ulasan
        </summary>
        <div className="mt-3">
          <ReviewForm productId={product.id} initial={{ rating: mine.rating, body: mine.body }} />
        </div>
      </details>
      <form action={deleteReviewAction} className="mt-2">
        <input type="hidden" name="productId" value={product.id} />
        <SubmitButton variant="ghost" className="!px-0 !text-xs !text-red-600" confirm="Hapus ulasanmu?">
          <Trash2 className="h-3.5 w-3.5" /> Hapus ulasan
        </SubmitButton>
      </form>
    </div>
  );
}

function ReviewItem({ r, user, product, sellerName }: { r: ReviewDTO; user: CurrentUser | null; product: ProductLite; sellerName: string }) {
  const staff = isStaff(user);
  const isSeller = user?.id === product.sellerId;
  const mine = user?.id === r.author.id;
  const hiddenNote = r.hidden || r.autoHidden;
  return (
    <article id={`ulasan-${r.id}`} className="scroll-mt-24 border-t border-slate-100 pt-5 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-3">
        <Link href={`/@${r.author.username}`} className="shrink-0" aria-label={`Profil ${r.author.displayName}`}>
          <Avatar name={r.author.displayName} avatarKey={r.author.avatarKey} size={38} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/@${r.author.username}`} className="min-w-0 truncate font-semibold text-ink hover:text-brand-700">
              {r.author.displayName}
            </Link>
            {r.isOwner && (
              <Badge tone="green">
                <BadgeCheck className="h-3 w-3" /> {r.purchased ? "Pembeli" : "Pemilik"}
              </Badge>
            )}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
            <Stars value={r.rating} size={14} />
            <span title={formatDate(r.createdAt)}>{timeAgo(r.createdAt)}</span>
            {r.version && <span>· v{r.version}</span>}
            {r.editedAt && <span>· diedit</span>}
          </p>
        </div>
        {user && !mine && !hiddenNote && <ReportDialog targetType="review" targetId={r.id} />}
      </div>

      {hiddenNote && (staff || mine) && (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          {r.hidden ? `Disembunyikan moderator: ${r.hiddenReason ?? "-"}` : "Disembunyikan otomatis — dilaporkan beberapa anggota."}
        </p>
      )}
      {r.body ? (
        <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">{r.body}</p>
      ) : (
        <p className="mt-3 text-sm italic text-slate-400">Memberi rating tanpa komentar.</p>
      )}

      {r.sellerReply && (
        <div className="mt-3 rounded-xl border-l-4 border-brand-300 bg-slate-50 px-4 py-3">
          <p className="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-slate-700">
            <MessageSquareReply className="h-3.5 w-3.5 text-brand-600" /> Balasan {sellerName}
            {r.sellerRepliedAt && <span className="font-normal text-slate-400">· {timeAgo(r.sellerRepliedAt)}</span>}
          </p>
          <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-700">{r.sellerReply}</p>
        </div>
      )}

      {(isSeller || staff) && (
        <div className="mt-2 flex flex-wrap items-start gap-x-4 gap-y-2">
          {isSeller && (
            <details className="min-w-0 flex-1 basis-full">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-brand-700 hover:underline [&::-webkit-details-marker]:hidden">
                <MessageSquareReply className="h-3.5 w-3.5" /> {r.sellerReply ? "Ubah balasan" : "Balas ulasan"}
              </summary>
              <SellerReplyForm reviewId={r.id} initial={r.sellerReply} />
              {r.sellerReply && (
                <form action={deleteReviewReplyAction} className="mt-1">
                  <input type="hidden" name="reviewId" value={r.id} />
                  <SubmitButton variant="ghost" className="!px-0 !text-xs !text-red-600" confirm="Hapus balasanmu?">
                    Hapus balasan
                  </SubmitButton>
                </form>
              )}
            </details>
          )}
          {staff &&
            (hiddenNote ? (
              <form action={moderateReviewAction}>
                <input type="hidden" name="reviewId" value={r.id} />
                <input type="hidden" name="action" value="restore" />
                <SubmitButton variant="ghost" className="!px-0 !text-xs !text-emerald-700">
                  <RotateCcw className="h-3.5 w-3.5" /> Pulihkan ulasan
                </SubmitButton>
              </form>
            ) : (
              <form action={moderateReviewAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="reviewId" value={r.id} />
                <input type="hidden" name="action" value="hide" />
                <label className="sr-only" htmlFor={`hide-${r.id}`}>
                  Alasan menyembunyikan
                </label>
                <input id={`hide-${r.id}`} name="reason" placeholder="Alasan (moderator)" className={cn(inputStyles, "!w-44 !py-1 !text-xs")} />
                <SubmitButton variant="ghost" className="!px-1 !text-xs !text-amber-700">
                  <EyeOff className="h-3.5 w-3.5" /> Sembunyikan
                </SubmitButton>
              </form>
            ))}
        </div>
      )}
    </article>
  );
}

/**
 * Bagian ulasan: ringkasan rating, form menulis/ubah ulasan, dan daftar ulasan.
 * mode "preview" = di halaman produk (beberapa ulasan terbaru); "full" = halaman semua ulasan.
 */
export async function ReviewsSection({
  product,
  user,
  sellerName,
  mode = "preview",
  sort = "terbaru",
  star = null,
  page = 1,
}: {
  product: ProductLite;
  user: CurrentUser | null;
  sellerName: string;
  mode?: "preview" | "full";
  sort?: ReviewSort;
  star?: number | null;
  page?: number;
}) {
  const base = `/p/${product.slug}/ulasan`;
  const [dist, list] = await Promise.all([
    getRatingDistribution(product.id),
    listReviews(product.id, {
      viewer: user,
      sort,
      star,
      page,
      pageSize: mode === "preview" ? REVIEW_LIMITS.previewCount : REVIEW_LIMITS.pageSize,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const qs = (patch: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    const merged = { urut: sort === "terbaru" ? null : sort, bintang: star, hal: null, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v !== null && v !== undefined) p.set(k, String(v));
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <Card className="scroll-mt-24 p-6 sm:p-8">
      <h2 id="ulasan" className="mb-5 flex scroll-mt-24 flex-wrap items-center gap-2 text-lg font-bold text-ink">
        <Star className="h-5 w-5 text-amber-500" fill="currentColor" strokeWidth={0} /> Ulasan
        {product.ratingCount > 0 && <span className="text-sm font-medium text-slate-500">({product.ratingCount})</span>}
      </h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <RatingSummary product={product} dist={dist} linkBase={mode === "full" ? base : undefined} activeStar={star} />
        <WriterBlock product={product} user={user} />
      </div>

      {mode === "full" && (
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-5">
          <span className="text-sm text-slate-500">Urutkan:</span>
          {REVIEW_SORTS.map((s) => (
            <Link
              key={s.id}
              href={qs({ urut: s.id === "terbaru" ? null : s.id })}
              aria-current={sort === s.id ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1 text-sm font-medium",
                sort === s.id ? "bg-ink text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {s.label}
            </Link>
          ))}
          {star && (
            <Link href={qs({ bintang: null })} className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100">
              {star} bintang ✕
            </Link>
          )}
        </div>
      )}

      <div className="mt-6 space-y-5">
        {list.items.length ? (
          list.items.map((r) => <ReviewItem key={r.id} r={r} user={user} product={product} sellerName={sellerName} />)
        ) : (
          <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">
            {star ? `Belum ada ulasan ${star} bintang.` : "Belum ada ulasan. Jadilah yang pertama setelah mencoba karya ini."}
          </p>
        )}
      </div>

      {mode === "preview" && list.total > list.items.length && (
        <div className="mt-6 border-t border-slate-100 pt-5 text-center">
          <ButtonLink href={base} variant="secondary">
            Lihat semua {list.total} ulasan
          </ButtonLink>
        </div>
      )}
      {mode === "full" && totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-5" aria-label="Halaman ulasan">
          {list.page > 1 ? (
            <ButtonLink href={qs({ hal: list.page - 1 })} variant="secondary">
              ← Sebelumnya
            </ButtonLink>
          ) : (
            <span />
          )}
          <span className="text-sm text-slate-500">
            Halaman {list.page} dari {totalPages}
          </span>
          {list.page < totalPages ? (
            <ButtonLink href={qs({ hal: list.page + 1 })} variant="secondary">
              Berikutnya →
            </ButtonLink>
          ) : (
            <span />
          )}
        </nav>
      )}
    </Card>
  );
}
