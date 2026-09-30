"use client";

import { useActionState, useState } from "react";
import {
  activateStoreAction,
  createProductAction,
  createReleaseAction,
  updateAndroidAction,
  updateProductAction,
  updateStoreAction,
} from "@/app/actions/seller";
import { CATEGORIES, LICENSES, PLATFORMS } from "@/lib/config";
import { Picker } from "./picker";
import { SubmitButton } from "./submit-button";
import { NameCheckInput } from "./name-check-input";
import { Alert, Field, cn, inputStyles } from "./ui";

type ProductDefaults = {
  id?: string;
  title?: string;
  summary?: string;
  category?: string;
  platforms?: string[];
  license?: string;
  tags?: string[];
  descriptionMd?: string;
  websiteUrl?: string | null;
  sourceUrl?: string | null;
  pricingModel?: string;
  priceIdr?: number;
  minPriceIdr?: number;
};

export function ProductForm({
  product,
  locked,
  onboarding,
}: {
  product?: ProductDefaults;
  locked?: boolean;
  /** Dipakai wizard langkah 1: harga disembunyikan (diatur di langkah 2). */
  onboarding?: boolean;
}) {
  const isEdit = Boolean(product?.id);
  const [state, action] = useActionState(isEdit ? updateProductAction : createProductAction, undefined);
  const v = state?.values;
  const fe = state?.fieldErrors ?? {};
  const [pricing, setPricing] = useState(v?.pricingModel ?? product?.pricingModel ?? "free");
  const selectedPlatforms = v ? v.platforms.split(",").filter(Boolean) : (product?.platforms ?? []);

  return (
    <form action={action} className="space-y-5">
      {product?.id && <input type="hidden" name="productId" value={product.id} />}
      {onboarding && (
        <>
          <input type="hidden" name="pricingModel" value={product?.pricingModel ?? "free"} />
          <input type="hidden" name="priceIdr" value={product?.priceIdr ? String(product.priceIdr) : "0"} />
          <input type="hidden" name="minPriceIdr" value={product?.minPriceIdr ? String(product.minPriceIdr) : "0"} />
          {!isEdit && <input type="hidden" name="onboarding" value="1" />}
        </>
      )}
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}

      <fieldset disabled={locked} className="space-y-5 disabled:opacity-70">
        <Field label="Judul" htmlFor="title" error={fe.title}>
          <input id="title" name="title" required maxLength={80} defaultValue={v?.title ?? product?.title} className={inputStyles} placeholder="Contoh: KasirKu Offline" />
        </Field>
        <Field label="Ringkasan singkat" htmlFor="summary" error={fe.summary} hint="Muncul di kartu produk & hasil pencarian (maks. 160 karakter)">
          <input id="summary" name="summary" required maxLength={160} defaultValue={v?.summary ?? product?.summary} className={inputStyles} placeholder="Satu kalimat yang menjelaskan manfaat utama karyamu" />
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Kategori" htmlFor="category" error={fe.category}>
            <Picker
              id="category"
              name="category"
              defaultValue={v?.category ?? product?.category ?? ""}
              placeholder="Pilih kategori"
              options={CATEGORIES.map((c) => ({ value: c.slug, label: c.label }))}
            />
          </Field>
          <Field label="Lisensi" htmlFor="license" error={fe.license}>
            <Picker
              id="license"
              name="license"
              defaultValue={v?.license ?? product?.license ?? ""}
              placeholder="Pilih lisensi"
              options={LICENSES.map((l) => ({ value: l, label: l }))}
            />
          </Field>
        </div>

        <Field label="Platform" error={fe.platforms} hint="Pilih semua platform yang didukung">
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <label key={p.slug} className="cursor-pointer">
                <input type="checkbox" name="platforms" value={p.slug} defaultChecked={selectedPlatforms.includes(p.slug)} className="peer sr-only" />
                <span className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100">
                  {p.label}
                </span>
              </label>
            ))}
          </div>
        </Field>

        <Field
          label="Deskripsi"
          htmlFor="descriptionMd"
          error={fe.descriptionMd}
          hint="Mendukung Markdown: **tebal**, - daftar, ## judul, [link](https://…). HTML tidak dirender."
        >
          <textarea
            id="descriptionMd"
            name="descriptionMd"
            rows={10}
            defaultValue={v?.descriptionMd ?? product?.descriptionMd}
            className={cn(inputStyles, "font-mono text-[13px] leading-relaxed")}
            placeholder={"## Fitur\n- Fitur pertama\n- Fitur kedua\n\n## Cara pakai\n…"}
          />
        </Field>

        <Field label="Tag" htmlFor="tags" optional error={fe.tags} hint="Pisahkan dengan koma, maks. 8 (contoh: kasir, umkm, offline)">
          <input id="tags" name="tags" defaultValue={v?.tags ?? product?.tags?.join(", ")} className={inputStyles} />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Website" htmlFor="websiteUrl" optional error={fe.websiteUrl}>
            <input id="websiteUrl" name="websiteUrl" type="url" defaultValue={v?.websiteUrl ?? product?.websiteUrl ?? ""} className={inputStyles} placeholder="https://" />
          </Field>
          <Field label="Link source code" htmlFor="sourceUrl" optional error={fe.sourceUrl}>
            <input id="sourceUrl" name="sourceUrl" type="url" defaultValue={v?.sourceUrl ?? product?.sourceUrl ?? ""} className={inputStyles} placeholder="https://github.com/…" />
          </Field>
        </div>

        {!onboarding && (
        <Field label="Harga" error={fe.priceIdr ?? fe.minPriceIdr}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {([
              { value: "free", title: "Gratis", desc: "Siapa pun bisa download" },
              { value: "fixed", title: "Harga tetap", desc: "Pembeli bayar sesuai harga" },
              { value: "pwyw", title: "Bayar seikhlasnya", desc: "Pembeli pilih nominal sendiri" },
            ] as { value: string; title: string; desc: string; disabled?: boolean }[]).map((o) => (
              <label key={o.value} className={cn("cursor-pointer", o.disabled && "cursor-not-allowed opacity-50")}>
                <input
                  type="radio"
                  name="pricingModel"
                  value={o.value}
                  disabled={o.disabled}
                  checked={pricing === o.value}
                  onChange={() => setPricing(o.value)}
                  className="peer sr-only"
                />
                <span className="block rounded-xl border border-slate-300 bg-white p-3 transition peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:ring-4 peer-checked:ring-brand-100">
                  <span className="block text-sm font-bold text-ink">{o.title}</span>
                  <span className="block text-xs text-slate-500">{o.desc}</span>
                </span>
              </label>
            ))}
          </div>
          {pricing === "fixed" && (
            <div className="mt-3 max-w-xs">
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">Rp</span>
                <input
                  name="priceIdr"
                  inputMode="numeric"
                  defaultValue={v?.priceIdr ?? (product?.priceIdr ? String(product.priceIdr) : "")}
                  className={cn(inputStyles, "pl-10")}
                  placeholder="49000"
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">Min. Rp10.000. Kamu terima harga dikurangi komisi 10% (0% di 3 bulan pertama). Biaya gateway dibayar pembeli.</p>
            </div>
          )}
          {pricing === "pwyw" && (
            <div className="mt-3 grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-700">
                Minimal bayar
                <span className="relative mt-1 block">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">Rp</span>
                  <input
                    name="minPriceIdr"
                    inputMode="numeric"
                    defaultValue={v?.minPriceIdr ?? String(product?.minPriceIdr ?? 0)}
                    className={cn(inputStyles, "pl-10")}
                    placeholder="0"
                  />
                </span>
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Harga saran (opsional)
                <span className="relative mt-1 block">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">Rp</span>
                  <input
                    name="priceIdr"
                    inputMode="numeric"
                    defaultValue={v?.priceIdr ?? (product?.priceIdr ? String(product.priceIdr) : "")}
                    className={cn(inputStyles, "pl-10")}
                    placeholder="25000"
                  />
                </span>
              </label>
              <p className="text-xs text-slate-500 sm:col-span-2">Minimal Rp0 = pembeli boleh ambil gratis (tetap bisa menyumbang). Selain itu minimal Rp1.000.</p>
            </div>
          )}
        </Field>
        )}
      </fieldset>

      {!locked && (
        <div className="flex justify-end border-t border-slate-100 pt-5">
          <SubmitButton pendingText="Menyimpan…">
            {isEdit ? "Simpan perubahan" : onboarding ? "Simpan & lanjut ke langkah 2" : "Buat draft & lanjut upload"}
          </SubmitButton>
        </div>
      )}
    </form>
  );
}

export function AndroidForm({
  productId,
  androidPackage,
  androidRegistration,
  locked,
}: {
  productId: string;
  androidPackage: string | null;
  androidRegistration: string | null;
  locked?: boolean;
}) {
  const [state, action] = useActionState(updateAndroidAction, undefined);
  const fe = state?.fieldErrors ?? {};
  const reg = state?.values?.androidRegistration ?? androidRegistration ?? "";
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="productId" value={productId} />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <fieldset disabled={locked} className="space-y-4">
        <Field label="Nama paket (package name)" htmlFor="androidPackage" error={fe.androidPackage} hint="Sama dengan applicationId di build.gradle, contoh: id.namadev.kasirku">
          <input id="androidPackage" name="androidPackage" defaultValue={state?.values?.androidPackage ?? androidPackage ?? ""} className={cn(inputStyles, "font-mono")} placeholder="id.namadev.aplikasi" />
        </Field>
        <Field label="Status verifikasi developer Google" error={fe.androidRegistration}>
          <div className="space-y-2">
            {[
              { value: "registered", title: "Sudah terdaftar", desc: "Saya sudah mendaftar di Android Developer Console / Play Console dan paket ini sudah didaftarkan. Moderator bisa meminta bukti." },
              { value: "not_registered", title: "Belum terdaftar", desc: "Pengguna akan melihat label \u201cPerlu mode lanjutan\u201d dan panduan instal." },
            ].map((o) => (
              <label key={o.value} className="flex cursor-pointer gap-3 rounded-xl border border-slate-300 bg-white p-3 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                <input type="radio" name="androidRegistration" value={o.value} defaultChecked={reg === o.value} className="mt-1 accent-brand-600" />
                <span>
                  <span className="block text-sm font-bold text-ink">{o.title}</span>
                  <span className="block text-xs text-slate-500">{o.desc}</span>
                </span>
              </label>
            ))}
          </div>
        </Field>
      </fieldset>
      {!locked && (
        <div className="flex justify-end">
          <SubmitButton variant="secondary" pendingText="Menyimpan…">Simpan info Android</SubmitButton>
        </div>
      )}
    </form>
  );
}

export function ReleaseForm({ productId, suggestedVersion }: { productId: string; suggestedVersion: string }) {
  const [state, action] = useActionState(createReleaseAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="productId" value={productId} />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
        <Field label="Versi" htmlFor="version" error={fe.version}>
          <input id="version" name="version" required defaultValue={state?.values?.version ?? suggestedVersion} className={cn(inputStyles, "font-mono")} />
        </Field>
        <Field label="Catatan rilis (changelog)" htmlFor="changelogMd" error={fe.changelogMd} optional>
          <textarea id="changelogMd" name="changelogMd" rows={3} defaultValue={state?.values?.changelogMd} className={inputStyles} placeholder={"- Fitur baru: …\n- Perbaikan: …"} />
        </Field>
      </div>
      <div className="flex justify-end">
        <SubmitButton variant="secondary" pendingText="Membuat…">Buat rilis</SubmitButton>
      </div>
    </form>
  );
}

export function StoreForm({
  mode,
  defaults,
}: {
  mode: "activate" | "edit";
  defaults?: { storeName: string; tagline: string | null; websiteUrl: string | null; phone: string | null; portfolioUrl: string | null };
}) {
  const [state, action] = useActionState(mode === "activate" ? activateStoreAction : updateStoreAction, undefined);
  const fe = state?.fieldErrors ?? {};
  const v = state?.values;
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <Field label="Nama toko / studio" htmlFor="storeName" error={fe.storeName}>
        <input id="storeName" name="storeName" required maxLength={50} defaultValue={v?.storeName ?? defaults?.storeName} className={inputStyles} placeholder="Contoh: Nusantara Labs" />
      </Field>
      <Field label="Tagline" htmlFor="tagline" optional error={fe.tagline}>
        <input id="tagline" name="tagline" maxLength={120} defaultValue={v?.tagline ?? defaults?.tagline ?? ""} className={inputStyles} placeholder="Aplikasi sederhana untuk UMKM Indonesia" />
      </Field>
      <Field label="Website / portofolio" htmlFor="websiteUrl" optional error={fe.websiteUrl}>
        <input id="websiteUrl" name="websiteUrl" type="url" defaultValue={v?.websiteUrl ?? defaults?.websiteUrl ?? ""} className={inputStyles} placeholder="https://" />
      </Field>
      <Field label="No HP / WhatsApp" htmlFor="phone" error={fe.phone} hint="Untuk verifikasi admin, tidak tampil publik">
        <input id="phone" name="phone" required maxLength={20} autoComplete="tel" defaultValue={v?.phone ?? defaults?.phone ?? ""} className={inputStyles} placeholder="08123456789" />
      </Field>
      <Field label="Link portofolio" htmlFor="portfolioUrl" error={fe.portfolioUrl} hint="GitHub, Play Store, Behance, sosmed — bukti karyamu">
        <input id="portfolioUrl" name="portfolioUrl" type="url" required defaultValue={v?.portfolioUrl ?? defaults?.portfolioUrl ?? ""} className={inputStyles} placeholder="https://" />
      </Field>
      {mode === "activate" && (
        <label className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <input type="checkbox" name="agree" className="mt-0.5 h-4 w-4 accent-brand-600" />
          <span>
            Saya hanya akan mengupload karya milik saya sendiri (atau yang boleh saya distribusikan) — <b>bukan</b> aplikasi bajakan/mod,
            bukan malware, dan bukan produk fisik. Saya paham karya akan direview sebelum tayang.
            {fe.agree && <span className="mt-1 block font-medium text-red-600">{fe.agree}</span>}
          </span>
        </label>
      )}
      <div className="flex justify-end">
        <SubmitButton pendingText="Menyimpan…">{mode === "activate" ? "Aktifkan toko" : "Simpan profil toko"}</SubmitButton>
      </div>
    </form>
  );
}
