import { Circle, CircleCheck, ExternalLink, FileArchive, Send, Smartphone, Trash2, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  cancelScheduleAction,
  deleteProductAction,
  deleteReleaseAction,
  deleteReleaseFileAction,
  deleteScreenshotAction,
  submitProductAction,
  submitReleaseAction,
} from "@/app/actions/seller";
import { AndroidBadge, ProductStatusBadge } from "@/components/bits";
import { PlatformIcon } from "@/components/icons";
import { AndroidForm, ProductForm, ReleaseForm } from "@/components/seller-forms";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Card, buttonStyles, cn } from "@/components/ui";
import { Uploader } from "@/components/uploader";
import { requireSeller } from "@/lib/auth/guards";
import { productChecklist } from "@/lib/checklist";
import { LIMITS, platformLabel } from "@/lib/config";
import { ACCEPTED_IMAGE_TYPES, ACCEPTED_RELEASE_EXTENSIONS } from "@/lib/files";
import { formatBytes, formatDateTime } from "@/lib/format";
import { getProductForOwner } from "@/lib/queries";
import { mediaUrl } from "@/lib/storage";

export const metadata: Metadata = { title: "Kelola karya" };

const RELEASE_STATUS: Record<string, { tone: "slate" | "amber" | "green" | "red"; label: string }> = {
  draft: { tone: "slate", label: "Draft" },
  review: { tone: "amber", label: "Direview" },
  published: { tone: "green", label: "Tayang" },
  rejected: { tone: "red", label: "Ditolak" },
};

function nextVersion(latest?: string) {
  if (!latest) return "1.0.0";
  const m = latest.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return "";
  return `${m[1]}.${m[2]}.${Number(m[3] ?? 0) + 1}`;
}

export default async function ManageProductPage({ params, searchParams }: PageProps<"/seller/produk/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireSeller(`/seller/produk/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const product = await getProductForOwner(id, user.id);
  if (!product) notFound();

  const locked = product.status === "review" || product.status === "suspended";
  const hasAndroid = product.platforms.includes("android");
  const pendingReleases = product.releases.filter((r) => r.status === "draft" || r.status === "rejected");
  const openRelease = product.releases.find((r) => r.status === "draft" || r.status === "review");
  const { items: checklist, complete } = productChecklist({
    ...product,
    mediaCount: product.media.length,
    hasReleaseWithFiles: product.releases.some(
      (r) => (r.status === "draft" || r.status === "rejected" || r.status === "published") && r.files.length > 0,
    ),
  });
  const neverPublished = !product.publishedAt;
  const canSubmitProduct = (product.status === "draft" || product.status === "rejected") && complete;
  const latestVersion = product.releases[0]?.version;
  const platformOptions = product.platforms.map((p) => ({ value: p, label: platformLabel(p) }));
  const icon = mediaUrl(product.iconKey);
  const cover = mediaUrl(product.coverKey);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Link href="/seller/produk" className="inline-block py-1 text-sm font-semibold text-brand-700 hover:underline">← Karya saya</Link>
      <div className="mb-6 mt-1 flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex flex-wrap items-center gap-3 text-3xl font-extrabold tracking-tight text-ink">
          {product.title} <ProductStatusBadge status={product.status} />
        </h1>
        <Link href={`/p/${product.slug}`} className={buttonStyles.secondary}>
          <ExternalLink className="h-4 w-4" /> {product.status === "published" ? "Lihat halaman" : "Pratinjau"}
        </Link>
      </div>

      {/* Pesan status */}
      <div className="mb-6 space-y-3">
        {sp.dibuat && <Alert tone="success" title="Draft dibuat!">Sekarang tambahkan ikon, cover, screenshot, dan file rilis. Setelah checklist lengkap, kirim ke review.</Alert>}
        {sp.dikirim === "review" && <Alert tone="success" title="Terkirim ke review">Tim moderator akan mengecek karyamu (biasanya kurang dari 1 hari). Selama direview, data dikunci sementara.</Alert>}
        {sp.dikirim === "tayang" && <Alert tone="success" title="Karya kamu sudah tayang!">Sebagai seller terpercaya, karya langsung tayang (tetap bisa diaudit moderator).</Alert>}
        {sp.dikirim === "jadwal" && <Alert tone="success" title="Karya disetujui & terjadwal!">Halaman produk tampil sebagai &ldquo;Segera hadir&rdquo; dengan hitung mundur sampai jadwal tiba.</Alert>}
        {sp.rilis === "review" && <Alert tone="success">Rilis baru dikirim ke review. Versi lama tetap bisa diunduh sampai rilis baru disetujui.</Alert>}
        {sp.rilis === "tayang" && <Alert tone="success">Rilis baru sudah tayang. Pengguna akan melihat tanda &ldquo;Update tersedia&rdquo; di Library.</Alert>}
        {sp.rilis === "jadwal" && <Alert tone="success">Rilis terjadwal. Otomatis tayang saat waktunya tiba (bisa dibatalkan kapan saja).</Alert>}
        {sp.error === "jadwal" && <Alert tone="danger">Jadwal tidak valid — harus di masa depan (maksimal 90 hari). Kosongkan kalau mau tayang langsung.</Alert>}
        {sp.error === "checklist" && <Alert tone="danger">Checklist belum lengkap. Lengkapi dulu semua poin di panel kanan.</Alert>}
        {sp.error === "nofile" && <Alert tone="danger">Rilis harus punya minimal 1 file sebelum dikirim.</Alert>}
        {sp.error === "hapus" && <Alert tone="danger">Karya yang pernah tayang tidak bisa dihapus permanen (pengguna mungkin sudah menyimpannya di Library).</Alert>}
        {product.status === "rejected" && product.rejectionReason && (
          <Alert tone="danger" title="Perlu perbaikan dari moderator">
            <p className="whitespace-pre-line">{product.rejectionReason}</p>
            <p className="mt-1">Perbaiki lalu kirim ulang ke review.</p>
          </Alert>
        )}
        {product.status === "suspended" && (
          <Alert tone="danger" title="Karya ditangguhkan">{product.rejectionReason ?? "Hubungi admin untuk info lebih lanjut."}</Alert>
        )}
        {product.status === "review" && <Alert tone="warning">Sedang direview — data dikunci sampai ada keputusan moderator.</Alert>}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          {/* 1. Info */}
          <Card className="p-6 sm:p-8">
            <h2 className="mb-5 text-lg font-bold text-ink">Info karya</h2>
            <ProductForm
              locked={locked}
              product={{
                id: product.id,
                title: product.title,
                summary: product.summary,
                category: product.category,
                platforms: product.platforms,
                license: product.license,
                tags: product.tags,
                descriptionMd: product.descriptionMd,
                websiteUrl: product.websiteUrl,
                sourceUrl: product.sourceUrl,
                pricingModel: product.pricingModel,
                priceIdr: product.priceIdr,
                minPriceIdr: product.minPriceIdr,
              }}
            />
          </Card>

          {/* 2. Media */}
          <Card className="p-6 sm:p-8">
            <h2 className="text-lg font-bold text-ink">Gambar</h2>
            <p className="mb-5 mt-1 text-sm text-slate-500">PNG / JPG / WEBP, maks. 5 MB. Otomatis dikonversi ke WEBP & metadata lokasi (EXIF) dihapus.</p>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-[auto_minmax(0,1fr)]">
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-800">Ikon <span className="font-normal text-slate-400">(persegi, min. 512px)</span></p>
                <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
                  {icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={icon} alt="Ikon" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-slate-400">Belum ada</span>
                  )}
                </div>
                <div className="mt-3">
                  <Uploader purpose="icon" targetId={product.id} accept={ACCEPTED_IMAGE_TYPES} label={icon ? "Ganti" : "Upload ikon"} disabled={locked} compact />
                </div>
              </div>
              <div className="min-w-0">
                <p className="mb-2 text-sm font-semibold text-slate-800">Cover <span className="font-normal text-slate-400">(16:9, ideal 1280×720)</span></p>
                <div className="flex aspect-video max-w-md items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="Cover" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-slate-400">Belum ada</span>
                  )}
                </div>
                <div className="mt-3">
                  <Uploader purpose="cover" targetId={product.id} accept={ACCEPTED_IMAGE_TYPES} label={cover ? "Ganti cover" : "Upload cover"} disabled={locked} compact />
                </div>
              </div>
            </div>

            <div className="mt-8">
              <p className="mb-2 text-sm font-semibold text-slate-800">
                Screenshot <span className="font-normal text-slate-400">({product.media.length}/{LIMITS.screenshotsMax})</span>
              </p>
              {product.media.length > 0 && (
                <div className="scroll-thin mb-3 flex gap-3 overflow-x-auto pb-2">
                  {product.media.map((m) => (
                    <div key={m.id} className="group relative shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={mediaUrl(m.storageKey)!} alt="Screenshot" className="h-40 w-auto rounded-xl border border-slate-200 object-cover" />
                      {!locked && (
                        <form action={deleteScreenshotAction} className="absolute right-1.5 top-1.5">
                          <input type="hidden" name="mediaId" value={m.id} />
                          <button type="submit" className="rounded-full bg-black/60 p-1.5 text-white opacity-80 hover:bg-red-600 hover:opacity-100" aria-label="Hapus screenshot">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {product.media.length < LIMITS.screenshotsMax && (
                <Uploader purpose="screenshot" targetId={product.id} accept={ACCEPTED_IMAGE_TYPES} label="Tambah screenshot" hint="Bisa pilih beberapa sekaligus" multiple disabled={locked} />
              )}
            </div>
          </Card>

          {/* 3. Android */}
          {hasAndroid && (
            <Card className="p-6 sm:p-8">
              <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold text-ink">
                <Smartphone className="h-5 w-5 text-brand-600" /> Android: verifikasi developer
                <AndroidBadge registration={product.androidRegistration} checked={Boolean(product.androidCheckedAt)} size="sm" />
              </h2>
              <p className="mb-5 mt-1 text-sm text-slate-500">
                Mulai 30 Sep 2026, HP Android bersertifikasi di Indonesia hanya bisa menginstal aplikasi dari developer terdaftar (kecuali lewat mode lanjutan).
                Jujurlah soal status ini — pengguna akan melihat labelnya. <Link href="/panduan/android" className="font-semibold text-brand-700 hover:underline">Baca panduan</Link>
              </p>
              <AndroidForm productId={product.id} androidPackage={product.androidPackage} androidRegistration={product.androidRegistration} locked={locked} />
            </Card>
          )}

          {/* 4. Rilis */}
          <Card className="p-6 sm:p-8">
            <h2 className="text-lg font-bold text-ink">Rilis &amp; file</h2>
            <p className="mb-5 mt-1 text-sm text-slate-500">
              Satu rilis = satu versi (bisa berisi beberapa file untuk platform berbeda). Format: {ACCEPTED_RELEASE_EXTENSIONS.replaceAll(",", ", ")}. Maks. {formatBytes(LIMITS.releaseFileMaxBytes)} per file (batas prototype).
            </p>

            <div className="space-y-4">
              {product.releases.map((r) => {
                const st = RELEASE_STATUS[r.status]!;
                const editable = r.status === "draft" && !locked;
                return (
                  <div key={r.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
                        v{r.version} <Badge tone={st.tone}>{st.label}</Badge>
                        {r.scheduledAt && r.scheduledAt > new Date() && (
                          <Badge tone="amber">Terjadwal {formatDateTime(r.scheduledAt)}</Badge>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        {r.publishedAt ? `Tayang ${formatDateTime(r.publishedAt)}` : `Dibuat ${formatDateTime(r.createdAt)}`}
                      </p>
                    </div>
                    {r.status === "rejected" && r.rejectionReason && (
                      <Alert tone="danger" className="mt-3">Ditolak: {r.rejectionReason}</Alert>
                    )}
                    {r.changelogMd && <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-slate-600">{r.changelogMd}</p>}

                    <ul className="mt-3 space-y-2">
                      {r.files.map((f) => (
                        <li key={f.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
                          <PlatformIcon platform={f.platform} className="h-4 w-4 shrink-0 text-slate-500" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-ink">{f.filename}</p>
                            <p className="truncate text-xs text-slate-500">
                              {platformLabel(f.platform)} · {formatBytes(f.sizeBytes)} · {f.detectedType} · SHA-256 {f.sha256.slice(0, 12)}…
                            </p>
                          </div>
                          {editable && (
                            <form action={deleteReleaseFileAction}>
                              <input type="hidden" name="fileId" value={f.id} />
                              <button type="submit" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Hapus ${f.filename}`}>
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </form>
                          )}
                        </li>
                      ))}
                      {r.files.length === 0 && <li className="text-sm text-slate-400">Belum ada file.</li>}
                    </ul>

                    {editable && (
                      <div className="mt-3">
                        <Uploader
                          purpose="release_file"
                          targetId={r.id}
                          accept={ACCEPTED_RELEASE_EXTENSIONS}
                          label="Upload file"
                          platformOptions={platformOptions}
                          hint={`Maks. ${formatBytes(LIMITS.releaseFileMaxBytes)}`}
                        />
                      </div>
                    )}

                    {(editable || (r.status === "rejected" && !locked) || (r.status === "published" && r.scheduledAt && r.scheduledAt > new Date())) && (
                      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                        {r.status !== "published" && (
                          <form action={deleteReleaseAction}>
                            <input type="hidden" name="releaseId" value={r.id} />
                            <SubmitButton variant="danger" className={buttonStyles.small} confirm={`Hapus rilis v${r.version} beserta file-nya?`}>
                              <Trash2 className="h-3.5 w-3.5" /> Hapus rilis
                            </SubmitButton>
                          </form>
                        )}
                        {product.status === "published" && r.status === "draft" && (
                          <form action={submitReleaseAction} className="flex flex-col gap-1.5">
                            <input type="hidden" name="releaseId" value={r.id} />
                            <label className="text-xs font-semibold text-slate-600">
                              Jadwal tayang (WIB, opsional)
                              <input type="datetime-local" name="scheduledAt" className="mt-1 block rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-normal text-ink" />
                            </label>
                            <SubmitButton className={buttonStyles.small} disabled={r.files.length === 0} pendingText="Mengirim…">
                              <Send className="h-3.5 w-3.5" /> {user.seller.isTrusted ? "Tayangkan rilis" : "Kirim rilis ke review"}
                            </SubmitButton>
                          </form>
                        )}
                        {r.status === "published" && r.scheduledAt && r.scheduledAt > new Date() && (
                          <form action={cancelScheduleAction}>
                            <input type="hidden" name="releaseId" value={r.id} />
                            <SubmitButton variant="secondary" className={buttonStyles.small} pendingText="Menayangkan…">
                              Batalkan jadwal & tayangkan
                            </SubmitButton>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!locked && !openRelease && (
              <div className={cn(product.releases.length > 0 && "mt-6 border-t border-slate-100 pt-6")}>
                <p className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
                  <FileArchive className="h-4 w-4 text-brand-600" /> {product.releases.length ? "Rilis versi baru" : "Buat rilis pertama"}
                </p>
                <ReleaseForm productId={product.id} suggestedVersion={nextVersion(latestVersion)} />
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          {(product.status === "draft" || product.status === "rejected") && (
            <Card className="p-5">
              <h2 className="font-bold text-ink">Siap tayang?</h2>
              <ul className="mt-4 space-y-2.5">
                {checklist.map((c) => (
                  <li key={c.key} className={cn("flex items-start gap-2.5 text-sm", c.done ? "text-slate-700" : "text-slate-500")}>
                    {c.done ? <CircleCheck className="mt-px h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-px h-4 w-4 shrink-0 text-slate-300" />}
                    {c.label}
                  </li>
                ))}
              </ul>
              <form action={submitProductAction} className="mt-5">
                <input type="hidden" name="productId" value={product.id} />
                <label className="mb-3 block text-xs font-semibold text-slate-600">
                  Jadwalkan tayang (opsional, WIB)
                  <input type="datetime-local" name="scheduledAt" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-ink" />
                </label>
                <SubmitButton className="w-full" disabled={!canSubmitProduct} pendingText="Mengirim…">
                  <Send className="h-4 w-4" /> {user.seller.isTrusted ? "Tayangkan sekarang" : "Kirim ke review"}
                </SubmitButton>
              </form>
              <p className="mt-3 text-xs text-slate-500">
                {user.seller.isTrusted
                  ? "Kamu seller terpercaya: karya langsung tayang."
                  : "Moderator mengecek file & info karya sebelum tayang. Karya pertama biasanya dicek lebih teliti."}
              </p>
            </Card>
          )}

          <Card className="p-5 text-sm">
            <h2 className="font-bold text-ink">Info</h2>
            <dl className="mt-3 space-y-2 text-slate-600">
              <div className="flex justify-between gap-3"><dt>Status</dt><dd><ProductStatusBadge status={product.status} /></dd></div>
              <div className="flex justify-between gap-3"><dt>URL</dt><dd className="truncate font-mono text-xs">/p/{product.slug}</dd></div>
              <div className="flex justify-between gap-3"><dt>Unduhan</dt><dd className="font-semibold text-ink">{product.downloadCount}</dd></div>
              <div className="flex justify-between gap-3"><dt>Dibuat</dt><dd>{formatDateTime(product.createdAt)}</dd></div>
              {product.publishedAt && <div className="flex justify-between gap-3"><dt>Tayang sejak</dt><dd>{formatDateTime(product.publishedAt)}</dd></div>}
              {pendingReleases.length > 0 && product.status === "published" && (
                <div className="flex justify-between gap-3"><dt>Rilis draft</dt><dd>{pendingReleases.map((r) => `v${r.version}`).join(", ")}</dd></div>
              )}
            </dl>
          </Card>

          {neverPublished && (product.status === "draft" || product.status === "rejected") && (
            <Card className="border-red-100 p-5">
              <h2 className="font-bold text-red-700">Hapus draft</h2>
              <p className="mt-1 text-xs text-slate-500">Menghapus karya ini beserta semua gambar & file. Tidak bisa dibatalkan.</p>
              <form action={deleteProductAction} className="mt-3">
                <input type="hidden" name="productId" value={product.id} />
                <SubmitButton variant="danger" className="w-full" confirm="Hapus draft ini secara permanen?">
                  <Trash2 className="h-4 w-4" /> Hapus draft
                </SubmitButton>
              </form>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
