import { BadgeCheck, Ban, Check, ExternalLink, Star, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  approveProductAction,
  approveReleaseAction,
  markAndroidCheckedAction,
  rejectProductAction,
  rejectReleaseAction,
  restoreProductAction,
  setTrustedAction,
  suspendProductAction,
  toggleFeaturedAction,
} from "@/app/actions/admin";
import { AndroidBadge, PriceTag, ProductIcon, ProductStatusBadge } from "@/components/bits";
import { PlatformIcon } from "@/components/icons";
import { Markdown } from "@/components/markdown";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Card, buttonStyles, cn, inputStyles } from "@/components/ui";
import { requireStaff } from "@/lib/auth/guards";
import { categoryLabel, platformLabel } from "@/lib/config";
import { formatBytes, formatDate, formatDateTime, timeAgo } from "@/lib/format";
import { getProductForReview } from "@/lib/queries";
import { mediaUrl } from "@/lib/storage";

export const metadata: Metadata = { title: "Review karya" };

const GUIDE = [
  "File sesuai deskripsi & screenshot (bukan file kosong / salah upload)",
  "Bukan aplikasi bajakan, mod/crack, atau re-upload karya orang lain",
  "Tidak ada tanda malware — sementara dicek manual (scan otomatis ClamAV masuk Fase 4)",
  "Tidak ada konten terlarang (judi, pornografi, penipuan, SARA)",
  "Lisensi & klaim masuk akal (source code orang lain wajib sesuai lisensinya)",
  "Android: nama paket wajar; minta bukti bila klaim \u201cterdaftar\u201d meragukan",
];

export default async function ReviewDetailPage({ params, searchParams }: PageProps<"/admin/review/[id]">) {
  await requireStaff("/admin/review");
  const { id } = await params;
  const { error } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getProductForReview(id);
  if (!data) notFound();
  const { product, duplicates, sellerCounts } = data;
  const seller = product.seller;
  const hasAndroid = product.platforms.includes("android");
  const reviewReleases = product.releases.filter((r) => r.status === "review");
  const dupByHash = new Map(duplicates.map((d) => [d.sha256, d]));
  const cover = mediaUrl(product.coverKey);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Link href="/admin/review" className="text-sm font-semibold text-brand-700 hover:underline">← Antrian review</Link>
      <div className="mb-6 mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex flex-wrap items-center gap-3 text-3xl font-extrabold tracking-tight text-ink">
          {product.title} <ProductStatusBadge status={product.status} />
          {product.isFeatured && <Badge tone="brand"><Star className="h-3 w-3" /> Pilihan editor</Badge>}
        </h1>
        <Link href={`/p/${product.slug}`} className={buttonStyles.secondary} target="_blank">
          <ExternalLink className="h-4 w-4" /> Buka halaman
        </Link>
      </div>

      {error === "alasan" && <Alert tone="danger" className="mb-6">Alasan penolakan wajib diisi (min. 10 karakter) supaya seller tahu apa yang harus diperbaiki.</Alert>}
      {duplicates.length > 0 && (
        <Alert tone="danger" className="mb-6" title={<span className="flex items-center gap-2"><TriangleAlert className="h-4 w-4" /> File identik ditemukan di karya seller lain</span>}>
          <ul className="mt-1 list-disc pl-5">
            {duplicates.map((d, i) => (
              <li key={i}>
                <Link href={`/p/${d.productSlug}`} className="font-semibold underline">{d.productTitle}</Link> oleh @{d.sellerUsername} — kemungkinan re-upload / pencurian karya.
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <Card className="overflow-hidden">
            <div className="aspect-[21/9] bg-slate-100">
              {cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="flex gap-4 p-6">
              <ProductIcon iconKey={product.iconKey} title={product.title} size={72} />
              <div className="min-w-0">
                <p className="text-lg font-bold text-ink">{product.title}</p>
                <p className="text-sm text-slate-600">{product.summary}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <Badge>{categoryLabel(product.category)}</Badge>
                  {product.platforms.map((p) => <Badge key={p} tone="brand">{platformLabel(p)}</Badge>)}
                  <Badge>{product.license}</Badge>
                  <PriceTag pricingModel={product.pricingModel} priceIdr={product.priceIdr} minPriceIdr={product.minPriceIdr} className="text-sm" />
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {product.websiteUrl && <a href={product.websiteUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-700 underline">{product.websiteUrl}</a>}
                  {product.sourceUrl && <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-700 underline">{product.sourceUrl}</a>}
                </div>
              </div>
            </div>
          </Card>

          {product.media.length > 0 && (
            <div className="scroll-thin flex gap-3 overflow-x-auto pb-2">
              {product.media.map((m) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={m.id} src={mediaUrl(m.storageKey)!} alt="Screenshot" className="h-56 w-auto shrink-0 rounded-xl border border-slate-200" />
              ))}
            </div>
          )}

          <Card className="p-6">
            <h2 className="mb-3 font-bold text-ink">Deskripsi</h2>
            <Markdown>{product.descriptionMd || "_(kosong)_"}</Markdown>
          </Card>

          <Card className="p-6">
            <h2 className="mb-4 font-bold text-ink">Rilis &amp; file</h2>
            <div className="space-y-4">
              {product.releases.map((r) => (
                <div key={r.id} className={cn("rounded-2xl border p-4", r.status === "review" ? "border-amber-300 bg-amber-50/40" : "border-slate-200")}>
                  <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
                    v{r.version}
                    <Badge tone={r.status === "review" ? "amber" : r.status === "published" ? "green" : r.status === "rejected" ? "red" : "slate"}>{r.status}</Badge>
                    <span className="text-xs font-normal text-slate-500">{r.submittedAt ? `dikirim ${timeAgo(r.submittedAt)}` : ""}</span>
                  </p>
                  {r.changelogMd && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{r.changelogMd}</p>}
                  <ul className="mt-3 space-y-2">
                    {r.files.map((f) => (
                      <li key={f.id} className="rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200">
                        <div className="flex items-center gap-2">
                          <PlatformIcon platform={f.platform} className="h-4 w-4 text-slate-500" />
                          <span className="truncate font-semibold text-ink">{f.filename}</span>
                          <span className="ml-auto shrink-0 text-xs text-slate-500">{formatBytes(f.sizeBytes)}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">Terdeteksi: {f.detectedType} · scan: {f.scanStatus}</p>
                        <p className="mt-1 break-all font-mono text-[11px] text-slate-400">SHA-256 {f.sha256}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <form action={`/api/download/${f.id}`} method="post">
                            <button type="submit" className={cn(buttonStyles.secondary, buttonStyles.small)}>Download untuk dicek</button>
                          </form>
                          <a href={`https://www.virustotal.com/gui/file/${f.sha256}`} target="_blank" rel="noopener noreferrer" className={cn(buttonStyles.ghost, buttonStyles.small)}>
                            Cari hash di VirusTotal <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        {dupByHash.has(f.sha256) && <p className="mt-2 text-xs font-semibold text-red-600">Hash sama dengan karya @{dupByHash.get(f.sha256)!.sellerUsername}</p>}
                      </li>
                    ))}
                    {r.files.length === 0 && <li className="text-sm text-slate-400">Tidak ada file.</li>}
                  </ul>
                  {r.status === "review" && product.status === "published" && (
                    <div className="mt-4 grid gap-3 border-t border-amber-200 pt-4 sm:grid-cols-2">
                      <form action={approveReleaseAction}>
                        <input type="hidden" name="releaseId" value={r.id} />
                        <SubmitButton variant="success" className="w-full" pendingText="Menyetujui…"><Check className="h-4 w-4" /> Setujui rilis v{r.version}</SubmitButton>
                      </form>
                      <form action={rejectReleaseAction} className="space-y-2">
                        <input type="hidden" name="releaseId" value={r.id} />
                        <textarea name="reason" required minLength={10} rows={2} placeholder="Alasan penolakan (dilihat seller)" className={cn(inputStyles, "text-xs")} />
                        <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" name="blockFiles" className="accent-red-600" /> Blokir hash file (malware / bajakan)</label>
                        <SubmitButton variant="danger" className="w-full" pendingText="Menolak…"><Ban className="h-4 w-4" /> Tolak rilis</SubmitButton>
                      </form>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        <aside className="space-y-5">
          {product.status === "review" && (
            <Card className="border-amber-200 p-5">
              <h2 className="font-bold text-ink">Keputusan</h2>
              <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
                {GUIDE.map((g) => <li key={g} className="flex gap-2"><Check className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" />{g}</li>)}
              </ul>
              <form action={approveProductAction} className="mt-5 space-y-3">
                <input type="hidden" name="productId" value={product.id} />
                {hasAndroid && product.androidRegistration === "registered" && (
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" name="androidChecked" className="mt-1 accent-brand-600" />
                    Bukti pendaftaran developer Android sudah saya cek
                  </label>
                )}
                <input name="note" placeholder="Catatan internal (opsional)" className={cn(inputStyles, "text-sm")} />
                <SubmitButton variant="success" className="w-full" pendingText="Menyetujui…"><Check className="h-4 w-4" /> Setujui &amp; tayangkan</SubmitButton>
              </form>
              <form action={rejectProductAction} className="mt-5 space-y-3 border-t border-slate-100 pt-5">
                <input type="hidden" name="productId" value={product.id} />
                <textarea name="reason" required minLength={10} rows={3} placeholder="Alasan penolakan / apa yang harus diperbaiki (dilihat seller)" className={cn(inputStyles, "text-sm")} />
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="blockFiles" className="accent-red-600" /> Blokir hash file (malware / bajakan)
                </label>
                <SubmitButton variant="danger" className="w-full" pendingText="Menolak…"><Ban className="h-4 w-4" /> Tolak</SubmitButton>
              </form>
            </Card>
          )}

          {reviewReleases.length > 0 && product.status === "published" && (
            <Alert tone="warning">Ada {reviewReleases.length} rilis menunggu review — keputusan ada di kartu rilisnya (kolom kiri).</Alert>
          )}

          <Card className="p-5 text-sm">
            <h2 className="font-bold text-ink">Seller</h2>
            <p className="mt-2 flex items-center gap-1.5 font-semibold text-ink">
              {seller.sellerProfile?.storeName ?? seller.displayName}
              {seller.sellerProfile?.isTrusted && <BadgeCheck className="h-4 w-4 text-brand-600" />}
            </p>
            <p className="text-slate-500">@{seller.username} · {seller.email}</p>
            <dl className="mt-3 space-y-1.5 text-slate-600">
              <div className="flex justify-between"><dt>Akun dibuat</dt><dd>{formatDate(seller.createdAt)} ({timeAgo(seller.createdAt)})</dd></div>
              <div className="flex justify-between"><dt>Total karya</dt><dd>{sellerCounts?.total ?? 0}</dd></div>
              <div className="flex justify-between"><dt>Tayang / ditolak</dt><dd>{sellerCounts?.published ?? 0} / {sellerCounts?.rejected ?? 0}</dd></div>
            </dl>
            <form action={setTrustedAction} className="mt-4">
              <input type="hidden" name="userId" value={seller.id} />
              <input type="hidden" name="trusted" value={seller.sellerProfile?.isTrusted ? "0" : "1"} />
              <SubmitButton variant="secondary" className={cn("w-full", buttonStyles.small)}>
                {seller.sellerProfile?.isTrusted ? "Cabut status terpercaya" : "Jadikan seller terpercaya (auto-tayang)"}
              </SubmitButton>
            </form>
          </Card>

          {hasAndroid && (
            <Card className="p-5 text-sm">
              <h2 className="font-bold text-ink">Android</h2>
              <p className="mt-2 font-mono text-xs text-slate-700">{product.androidPackage ?? "(belum diisi)"}</p>
              <div className="mt-2"><AndroidBadge registration={product.androidRegistration} checked={Boolean(product.androidCheckedAt)} size="sm" /></div>
              {product.androidCheckedAt ? (
                <p className="mt-2 text-xs text-slate-500">Dicek {formatDateTime(product.androidCheckedAt)}</p>
              ) : product.androidRegistration === "registered" ? (
                <form action={markAndroidCheckedAction} className="mt-3">
                  <input type="hidden" name="productId" value={product.id} />
                  <SubmitButton variant="secondary" className={cn("w-full", buttonStyles.small)}>Tandai bukti sudah dicek</SubmitButton>
                </form>
              ) : null}
            </Card>
          )}

          {product.status === "published" && (
            <Card className="space-y-3 p-5 text-sm">
              <h2 className="font-bold text-ink">Kurasi &amp; tindakan</h2>
              <form action={toggleFeaturedAction}>
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="featured" value={product.isFeatured ? "0" : "1"} />
                <SubmitButton variant="secondary" className="w-full"><Star className="h-4 w-4" /> {product.isFeatured ? "Hapus dari Pilihan Editor" : "Jadikan Pilihan Editor"}</SubmitButton>
              </form>
              <form action={suspendProductAction} className="space-y-2 border-t border-slate-100 pt-3">
                <input type="hidden" name="productId" value={product.id} />
                <input name="reason" placeholder="Alasan penangguhan" className={cn(inputStyles, "text-sm")} />
                <SubmitButton variant="danger" className="w-full" confirm="Tangguhkan karya ini? Karya hilang dari katalog.">Tangguhkan karya</SubmitButton>
              </form>
            </Card>
          )}
          {product.status === "suspended" && (
            <Card className="p-5 text-sm">
              <h2 className="font-bold text-ink">Ditangguhkan</h2>
              <p className="mt-1 text-slate-600">{product.rejectionReason}</p>
              <form action={restoreProductAction} className="mt-3">
                <input type="hidden" name="productId" value={product.id} />
                <SubmitButton variant="secondary" className="w-full">Pulihkan (tayang lagi)</SubmitButton>
              </form>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
