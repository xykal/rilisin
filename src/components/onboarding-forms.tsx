"use client";

import { useActionState, useState } from "react";
import { updatePricingAction } from "@/app/actions/seller";
import { SubmitButton } from "./submit-button";
import { Alert, ButtonLink, Field, cn, inputStyles } from "./ui";

/**
 * Langkah 2 wizard: harga saja (gratis / tetap / seikhlasnya). Aturan validasi
 * sama persis dengan editor biasa (satu fungsi `refinePricing` di server).
 */
export function PricingForm({
  productId,
  step3Href,
  defaults,
}: {
  productId: string;
  step3Href: string;
  defaults: { pricingModel: string; priceIdr: number; minPriceIdr: number };
}) {
  const [state, action] = useActionState(updatePricingAction, undefined);
  const v = state?.values;
  const fe = state?.fieldErrors ?? {};
  const [pricing, setPricing] = useState(v?.pricingModel ?? defaults.pricingModel ?? "free");

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="productId" value={productId} />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}

      <Field label="Model harga" error={fe.pricingModel ?? fe.priceIdr ?? fe.minPriceIdr}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {([
            { value: "free", title: "Gratis", desc: "Siapa pun bisa download" },
            { value: "fixed", title: "Harga tetap", desc: "Pembeli bayar sesuai harga" },
            { value: "pwyw", title: "Bayar seikhlasnya", desc: "Pembeli pilih nominal sendiri" },
          ] as { value: string; title: string; desc: string }[]).map((o) => (
            <label key={o.value} className="cursor-pointer">
              <input
                type="radio"
                name="pricingModel"
                value={o.value}
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
                defaultValue={v?.priceIdr ?? (defaults.priceIdr ? String(defaults.priceIdr) : "")}
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
                  defaultValue={v?.minPriceIdr ?? String(defaults.minPriceIdr ?? 0)}
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
                  defaultValue={v?.priceIdr ?? (defaults.priceIdr ? String(defaults.priceIdr) : "")}
                  className={cn(inputStyles, "pl-10")}
                  placeholder="25000"
                />
              </span>
            </label>
            <p className="text-xs text-slate-500 sm:col-span-2">Minimal Rp0 = pembeli boleh ambil gratis (tetap bisa menyumbang). Selain itu minimal Rp1.000.</p>
          </div>
        )}
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
        {state?.success ? (
          <ButtonLink href={step3Href}>Lanjut ke langkah 3 →</ButtonLink>
        ) : (
          <span className="text-xs text-slate-400">Harga bisa diubah lagi nanti dari editor biasa.</span>
        )}
        <SubmitButton pendingText="Menyimpan…">Simpan harga</SubmitButton>
      </div>
    </form>
  );
}
