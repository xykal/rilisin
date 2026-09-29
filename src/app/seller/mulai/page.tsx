import { Check, Circle, CircleCheck, FileArchive, Send, Smartphone, Trash2, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  deleteReleaseAction,
  deleteReleaseFileAction,
  deleteScreenshotAction,
  submitProductAction,
} from "@/app/actions/seller";
import { AndroidBadge, ProductStatusBadge } from "@/components/bits";
import { PlatformIcon } from "@/components/icons";
import { PricingForm } from "@/components/onboarding-forms";
import { AndroidForm, ProductForm, ReleaseForm } from "@/components/seller-forms";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, ButtonLink, Card, buttonStyles, cn } from "@/components/ui";
import { Uploader } from "@/components/uploader";
import { requireSeller } from "@/lib/auth/guards";
import { productChecklist } from "@/lib/checklist";
import { CATEGORIES, LIMITS, platformLabel } from "@/lib/config";
import { ACCEPTED_IMAGE_TYPES, ACCEPTED_RELEASE_EXTENSIONS } from "@/lib/files";
import { formatBytes, formatDateTime, formatRupiah } from "@/lib/format";
import { getProductForOwner } from "@/lib/queries";
import { mediaUrl } from "@/lib/storage";

export const metadata: Metadata = { title: "Panduan 3 langkah" };

const STEPS = [
  { n: 1, title: "Info karya", desc: "Judul, kategori & deskripsi" },
  { n: 2, title: "Upload & harga", desc: "Gambar, file rilis & harga" },
  { n: 3, title: "Publish", desc: "Review & kirim" },
];

/** Indikator langkah yang bisa diklik (langkah 2–3 aktif kalau draft sudah ada). */
function Stepper({ current, base }: { current: number; base: string }) {
  const hasDraft = base !== "/seller/mulai";
  return (
    <ol className="mb-6 flex flex-col gap-2 sm:flex-row">
      {STEPS.map((s) => {
        const done = s.n < current;
        const active = s.n === current;
        const reachable = s.n === 1 || hasDraft;
        const href = s.n === 1 ? base : `${base}&langkah=${s.n}`;
        const inner = (
          <>
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold",
                done && "bg-emerald-600 text-white",
                active && "bg-brand-600 text-white",
                !done && !active && "bg-slate-200 text-slate-500",
              )}
            >
              {done ? <Check className="h-4 w-4" /> : s.n}
            </span>
            <span>
              <span className={cn("block text-sm font-bold", active || done ? "text-ink" : "text-slate-500")}>
                {s.n}. {s.title}
              </span>
              <span className="block text-xs text-slate-500">{s.desc}</span>
            </span>
          </>
        );
        return (
          <li key={s.n} className="flex-1">
            {reachable && !active ? (
              <Link
                href={href}
                className="flex h-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-brand-300 hover:bg-brand-50/40"
              >
                {inner}
              </Link>
            ) : (
              <div
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex h-full items-center gap-3 rounded-2xl border p-3",
                  active ? "border-brand-500 bg-brand-50/60" : "border-slate-200 bg-white",
                )}
              >
                {inner}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function nextVersion(latest?: string) {
  if (!latest) return "1.0.0";
  const m = latest.match(/^(\\d+)\\.(\\d+)(?:\\.(\\d+))?/);
  if (!m) return "";
  return `${m[1]}.${m[2]}.${Number(m[3] ?? 0) + 1}`;
}

const RELEASE_STATUS: Record<string, { tone: "slate" | "amber" | "green" | "red"; label: string }> = {
  draft: { tone: "slate", label: "Draft" },
  review: { tone: "amber", label: "Direview" },
  published: { tone: "green", label: "Tayang" },
  rejected: { tone: "red", label: "Ditolak" },
};

function pricingLabel(p: { pricingModel: string; priceIdr: number; minPriceIdr: number }) {
  if (p.pricingModel === "fixed") return formatRupiah(p.priceIdr);
  if (p.pricingModel === "pwyw")
    return p.minPriceIdr > 0 ? `Seikhlasnya (min. ${formatRupiah(p.minPriceIdr)})` : "Seikhlasnya (boleh gratis)";
  return "Gratis";
}

export default async function OnboardingPage({ searchParams }: PageProps<"/seller/mulai">) {
  const user = await requireSeller("/seller/mulai");
  const sp = await searchParams;
  const rawId = Array.isArray(sp.id) ? sp.id[0] : sp.id;
  const rawStep = Array.isArray(sp.langkah) ? sp.langkah[0] : sp.langkah;
  const id = rawId && /^[0-9a-f-]{36}$/i.test(rawId) ? rawId : null;
  const langkah = rawStep === "2" ? 2 : rawStep === "3" ? 3 : 1;

  // Langkah 2–3 wajib membawa draft milik sendiri — selain itu mulai dari awal.
  // (Draft orang lain / tidak ada diperlakukan sama: balik ke langkah 1.)
  if (!id && langkah !== 1) redirect("/seller/mulai");
  const product = id ? await getProductForOwner(id, user.id) : null;
  if (id && !product) redirect("/seller/mulai");
  if (product && product.status !== "draft" && product.status !== "rejected") {
    redirect(`/seller/produk/${product.id}`);
  }

  const base = product ? `/seller/mulai?id=${product.id}` : "/seller/mulai";

  // ── Langkah 1: info karya (buat draft baru / ubah info draft) ──
  if (langkah === 1) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-sm font-semibold text-brand-700">Panduan karya pertama</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-ink">Langkah 1: info karya</h1>
        <p className="mb-6 mt-2 text-slate-600">Ceritakan karyamu. Harga & file menyusul di langkah 2 — santai saja.</p>
        <Stepper current={1} base={base} />
        <Card className="p-6 sm:p-8">
          {product ? (
            <ProductForm
              onboarding
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
          ) : (
            <ProductForm onboarding />
          )}
        </Card>
        {product && (
          <div className="mt-4 flex justify-end">
            <ButtonLink href={`${base}&langkah=2`} variant="secondary">
              Lewati, ke langkah 2 →
            </ButtonLink>
          </div>
        )}
      </div>
    );
  }

  if (!product) redirect("/seller/mulai");

  const hasAndroid = product.platforms.includes("android");
  const openRelease = product.releases.find((r) => r.status === "draft" || r.status === "review");
  const latestVersion = product.releases[0]?.version;
  const platformOptions = product.platforms.map((p) => ({ value: p, label: platformLabel(p) }));
  const icon = mediaUrl(product.iconKey);
  const cover = mediaUrl(product.coverKey);
  const { items: checklist, complete } = productChecklist({
    ...product,
    mediaCount: product.media.length,
    hasReleaseWithFiles: product.releases.some(
      (r) => (r.status === "draft" || r.status === "rejected" || r.status === "published") && r.files.length > 0,
    ),
  });

  // ── Langkah 2: upload & harga ──
  if (langkah === 2) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-sm font-semibold text-brand-700">Panduan karya pertama</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-ink">Langkah 2: upload & harga</h1>
        <p className="mb-6 mt-2 text-slate-600">
          Draft <b>“{product.title}”</b> sudah tersimpan. Tambahkan gambar, file rilis, dan harga.
        </p>
        <Stepper current={2} base={base} />

        <div className="space-y-6">
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
                  <Uploader purpose="icon" targetId={product.id} accept={ACCEPTED_IMAGE_TYPES} label={icon ? "Ganti" : "Upload ikon"} compact />
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
                  <Uploader purpose="cover" targetId={product.id} accept={ACCEPTED_IMAGE_TYPES} label={cover ? "Ganti cover" : "Upload cover"} compact />
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
                      <form action={deleteScreenshotAction} className="absolute right-1.5 top-1.5">
                        <input type="hidden" name="mediaId" value={m.id} />
                        <button type="submit" className="rounded-full bg-black/60 p-1.5 text-white opacity-80 hover:bg-red-600 hover:opacity-100" aria-label="Hapus screenshot">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              )}
              {product.media.length < LIMITS.screenshotsMax && (
                <Uploader purpose="screenshot" targetId={product.id} accept={ACCEPTED_IMAGE_TYPES} label="Tambah screenshot" hint="Bisa pilih beberapa sekaligus" multiple />
              )}
            </div>
          </Card>

          {hasAndroid && (
            <Card className="p-6 sm:p-8">
              <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold text-ink">
                <Smartphone className="h-5 w-5 text-brand-600" /> Android: verifikasi developer
                <AndroidBadge registration={product.androidRegistration} checked={Boolean(product.androidCheckedAt)} size="sm" />
              </h2>
              <p className="mb-5 mt-1 text-sm text-slate-500">
                HP Android bersertifikasi di Indonesia hanya bisa menginstal aplikasi dari developer terdaftar (kecuali lewat mode lanjutan).
                Jujurlah soal status ini — pengguna akan melihat labelnya. <Link href="/panduan/android" className="font-semibold text-brand-700 hover:underline">Baca panduan</Link>
              </p>
              <AndroidForm productId={product.id} androidPackage={product.androidPackage} androidRegistration={product.androidRegistration} />
            </Card>
          )}

          <Card className="p-6 sm:p-8">
            <h2 className="text-lg font-bold text-ink">Rilis & file</h2>
            <p className="mb-5 mt-1 text-sm text-slate-500">
              Satu rilis = satu versi (bisa berisi beberapa file untuk platform berbeda). Format: {ACCEPTED_RELEASE_EXTENSIONS.replaceAll(",", ", ")}. Maks. {formatBytes(LIMITS.releaseFileMaxBytes)} per file (batas prototype).
            </p>
            <div className="space-y-4">
              {product.releases.map((r) => {
                const st = RELEASE_STATUS[r.status]!;
                const editable = r.status === "draft";
                return (
                  <div key={r.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="flex items-center gap-2 font-bold text-ink">
                        v{r.version} <Badge tone={st.tone}>{st.label}</Badge>
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
                    {(editable || r.status === "rejected") && (
                      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                        <form action={deleteReleaseAction}>
                          <input type="hidden" name="releaseId" value={r.id} />
                          <SubmitButton variant="danger" className={buttonStyles.small} confirm={`Hapus rilis v${r.version} beserta file-nya?`}>
                            <Trash2 className="h-3.5 w-3.5" /> Hapus rilis
                          </SubmitButton>
                        </form>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {!openRelease && (
              <div className={cn(product.releases.length > 0 && "mt-6 border-t border-slate-100 pt-6")}>
                <p className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
                  <FileArchive className="h-4 w-4 text-brand-600" /> {product.releases.length ? "Rilis versi baru" : "Buat rilis pertama"}
                </p>
                <ReleaseForm productId={product.id} suggestedVersion={nextVersion(latestVersion)} />
              </div>
            )}
          </Card>

          <Card className="p-6 sm:p-8">
            <h2 className="mb-5 text-lg font-bold text-ink">Harga</h2>
            <PricingForm
              productId={product.id}
              step3Href={`${base}&langkah=3`}
              defaults={{ pricingModel: product.pricingModel, priceIdr: product.priceIdr, minPriceIdr: product.minPriceIdr }}
            />
          </Card>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Link href={base} className="py-1 text-sm font-semibold text-brand-700 hover:underline">← Langkah 1</Link>
          <ButtonLink href={`${base}&langkah=3`}>Lanjut ke langkah 3 →</ButtonLink>
        </div>
      </div>
    );
  }

  // ── Langkah 3: review & publish ──
  const categoryLabel = CATEGORIES.find((c) => c.slug === product.category)?.label ?? product.category;
  const fileCount = product.releases.reduce((s, r) => s + r.files.length, 0);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold text-brand-700">Panduan karya pertama</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-ink">Langkah 3: review & kirim</h1>
      <p className="mb-6 mt-2 text-slate-600">Cek terakhir sebelum karyamu masuk antrean review moderator.</p>
      <Stepper current={3} base={base} />

      <Card className="p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            {icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={icon} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[10px] text-slate-400">Tanpa ikon</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
              {product.title} <ProductStatusBadge status={product.status} />
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {categoryLabel} · {pricingLabel(product)} · {product.media.length} screenshot · {product.releases.length} rilis ({fileCount} file)
            </p>
          </div>
        </div>

        <h2 className="mb-3 mt-6 font-bold text-ink">Checklist verifikasi</h2>
        <ul className="space-y-2.5">
          {checklist.map((c) => (
            <li key={c.key} className={cn("flex items-start gap-2.5 text-sm", c.done ? "text-slate-700" : "text-slate-500")}>
              {c.done ? <CircleCheck className="mt-px h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-px h-4 w-4 shrink-0 text-slate-300" />}
              <span className="flex-1">{c.label}</span>
              {!c.done && (
                <Link href={`${base}&langkah=2`} className="shrink-0 font-semibold text-brand-700 hover:underline">
                  Lengkapi →
                </Link>
              )}
            </li>
          ))}
        </ul>

        <form action={submitProductAction} className="mt-6">
          <input type="hidden" name="productId" value={product.id} />
          <SubmitButton className="w-full" disabled={!complete} pendingText="Mengirim…">
            <Send className="h-4 w-4" /> {user.seller.isTrusted ? "Tayangkan sekarang" : "Kirim ke review"}
          </SubmitButton>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          {user.seller.isTrusted
            ? "Kamu seller terpercaya: karya langsung tayang."
            : complete
              ? "Moderator mengecek file & info karya sebelum tayang. Karya pertama biasanya dicek lebih teliti."
              : "Tombol aktif setelah semua checklist centang hijau."}
        </p>
      </Card>

      <Card className="mt-6 border-brand-100 bg-brand-50/40 p-6">
        <h2 className="font-bold text-ink">Sesudah dikirim, apa yang terjadi?</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-600">
          <li>Moderator mengecek karyamu — biasanya kurang dari 1 hari. Selama direview, data dikunci sementara.</li>
          <li>Kalau ada yang kurang, statusnya kembali ke draft beserta catatan perbaikan (tidak perlu mulai dari nol).</li>
          <li>Setelah tayang, bagikan link <span className="font-mono text-xs">/p/{product.slug}</span> ke calon pengguna.</li>
        </ul>
      </Card>

      <div className="mt-6 flex items-center justify-between gap-3">
        <Link href={`${base}&langkah=2`} className="py-1 text-sm font-semibold text-brand-700 hover:underline">← Langkah 2</Link>
        <ButtonLink href={`/seller/produk/${product.id}`} variant="secondary">
          Buka di editor biasa
        </ButtonLink>
      </div>
    </div>
  );
}
