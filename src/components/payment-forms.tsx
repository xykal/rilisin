"use client";

import { Check, Copy, Landmark, QrCode, ShieldCheck, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import {
  checkoutAction,
  markPayoutPaidAction,
  refundOrderAction,
  rejectPayoutAction,
  requestPayoutAction,
  savePayoutAccountAction,
} from "@/app/actions/payments";
import { estimateFee, methodAllowed, PAYMENT_METHODS, PAYOUT_PROVIDERS, PRICE_LIMITS } from "@/lib/payments/methods";
import { SubmitButton } from "./submit-button";
import { PasswordInput } from "./password-input";
import { Alert, cn, Field, inputStyles } from "./ui";

const rp = (n: number) => `Rp${Math.max(0, Math.round(n)).toLocaleString("id-ID")}`;
const digits = (s: string) => s.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

// ─── Checkout ───────────────────────────────────────────────────────────────
export function CheckoutForm({
  product,
  fees,
  simulation,
}: {
  product: { id: string; slug: string; pricingModel: "fixed" | "pwyw"; priceIdr: number; minPriceIdr: number };
  fees: Record<string, number> | null;
  simulation: boolean;
}) {
  const [state, action] = useActionState(checkoutAction, undefined);
  const pwyw = product.pricingModel === "pwyw";
  const floor = pwyw ? (product.minPriceIdr === 0 ? 0 : Math.max(product.minPriceIdr, PRICE_LIMITS.pwywFloor)) : product.priceIdr;
  const suggested = pwyw ? Math.max(floor, product.priceIdr || 25_000) : product.priceIdr;
  const [amountText, setAmountText] = useState(state?.values?.amount || String(suggested));
  const [method, setMethod] = useState(state?.values?.method || "qris");
  const amount = pwyw ? Number(digits(amountText) || 0) : product.priceIdr;
  const free = pwyw && amount === 0 && product.minPriceIdr === 0;
  const feeFor = (id: string) => (!pwyw && fees?.[id] !== undefined ? fees[id] : estimateFee(id, amount));
  const valid = free || (amount >= Math.max(floor, 1) && amount <= PRICE_LIMITS.max && methodAllowed(method, amount));
  const fee = free ? 0 : feeFor(method);
  const picks = [...new Set([floor, 10_000, 25_000, 50_000, 100_000].filter((v) => v >= floor && v > 0))].slice(0, 4);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="slug" value={product.slug} />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}

      {pwyw && (
        <Field label="Mau bayar berapa?" htmlFor="amount" hint={product.minPriceIdr === 0 ? "Boleh Rp0 (ambil gratis). Berapa pun yang kamu bayar, 100% dukungan untuk kreator setelah komisi." : `Minimal ${rp(floor)}.`}>
          <div className="relative max-w-xs">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">Rp</span>
            <input
              id="amount"
              name="amount"
              inputMode="numeric"
              autoComplete="off"
              value={amountText ? Number(digits(amountText) || 0).toLocaleString("id-ID") : ""}
              onChange={(e) => setAmountText(digits(e.target.value))}
              className={cn(inputStyles, "pl-10 text-lg font-bold")}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {picks.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmountText(String(v))}
                className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", amount === v ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}
              >
                {rp(v)}
              </button>
            ))}
          </div>
        </Field>
      )}

      {!free && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-800">Metode pembayaran</legend>
          <div className="grid grid-cols-1 gap-2">
            {PAYMENT_METHODS.map((m) => {
              const ok = methodAllowed(m.id, amount);
              return (
                <label key={m.id} className={cn("cursor-pointer", !ok && "cursor-not-allowed opacity-50")}>
                  <input type="radio" name="method" value={m.id} checked={method === m.id} disabled={!ok} onChange={() => setMethod(m.id)} className="peer sr-only" />
                  <span className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition peer-checked:border-brand-500 peer-checked:bg-brand-50/60 peer-checked:ring-4 peer-checked:ring-brand-100 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-200">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 max-[339px]:hidden">
                      {m.kind === "qr" ? <QrCode className="h-5 w-5" /> : <Landmark className="h-5 w-5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 text-sm font-bold text-ink [overflow-wrap:anywhere]">
                        {m.label}
                        {m.id === "qris" && <span className="rounded-full bg-emerald-100 px-2 text-[11px] font-bold text-emerald-700">Biaya paling murah</span>}
                      </span>
                      <span className="block text-xs text-slate-500">{ok ? m.hint : `Untuk nominal mulai ${rp(m.min)}`}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-slate-500">
                      biaya
                      <b className="block text-sm text-ink">{ok ? rp(feeFor(m.id)) : "-"}</b>
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="rounded-2xl bg-slate-50 p-4 text-sm">
        <div className="flex justify-between py-1">
          <span className="text-slate-600">Harga</span>
          <span className="font-semibold text-ink">{rp(amount)}</span>
        </div>
        {!free && (
          <div className="flex justify-between py-1">
            <span className="text-slate-600">Biaya layanan pembayaran{pwyw || !fees ? " (perkiraan)" : ""}</span>
            <span className="font-semibold text-ink">{rp(fee)}</span>
          </div>
        )}
        <div className="mt-2 flex justify-between border-t border-slate-200 pt-3 text-base">
          <span className="font-bold text-ink">Total bayar</span>
          <span className="font-extrabold text-ink">{rp(amount + fee)}</span>
        </div>
        {!free && <p className="mt-2 text-xs text-slate-500">Biaya layanan ditarik gateway pembayaran; angka pasti muncul di halaman pembayaran.</p>}
      </div>

      {simulation && !free && (
        <Alert tone="warning" title="Mode simulasi">
          Belum ada uang sungguhan. Setelah pesanan dibuat, kamu bisa menekan tombol &ldquo;Simulasikan pembayaran&rdquo;.
        </Alert>
      )}

      <SubmitButton className="w-full !py-3.5 text-base" pendingText="Membuat pesanan…" disabled={!valid}>
        {free ? "Ambil gratis & masukkan ke Library" : `Bayar ${rp(amount + fee)}`}
      </SubmitButton>
      <p className="flex items-start gap-2 text-xs text-slate-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        Produk digital langsung masuk Library setelah pembayaran terkonfirmasi. Refund hanya untuk file rusak, tidak sesuai deskripsi, atau penipuan — lihat aturan di halaman bantuan.
      </p>
    </form>
  );
}

// ─── Halaman pesanan ────────────────────────────────────────────────────────
export function OrderPoller({ code, status }: { code: string; status: string }) {
  const router = useRouter();
  useEffect(() => {
    if (status !== "pending") return;
    let stopped = false;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(code)}/status`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { status?: string };
        if (!stopped && data.status && data.status !== status) router.refresh();
      } catch {
        /* jaringan putus sebentar → coba lagi di putaran berikutnya */
      }
    };
    const id = window.setInterval(poll, 4_000);
    const onVisible = () => document.visibilityState === "visible" && void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [code, status, router]);
  return null;
}

export function Countdown({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const end = new Date(expiresAt).getTime();
    const tick = () => setLeft(Math.max(0, Math.round((end - Date.now()) / 1000)));
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [expiresAt]);
  if (left === null) return <span className="font-mono">--:--</span>;
  if (left === 0) return <span className="font-semibold text-red-600">waktu habis</span>;
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return <span className="font-mono font-semibold tabular-nums">{h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`}</span>;
}

export function CopyButton({ text, label = "Salin" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          return;
        }
        setDone(true);
        window.setTimeout(() => setDone(false), 1500);
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? "Tersalin" : label}
    </button>
  );
}

// ─── Seller: rekening & pencairan ───────────────────────────────────────────
export function PayoutAccountForm({
  current,
  mfaEnabled,
}: {
  current: { method: string; providerName: string; accountHolder: string } | null;
  mfaEnabled: boolean;
}) {
  const [state, action] = useActionState(savePayoutAccountAction, undefined);
  const [method, setMethod] = useState<"bank" | "ewallet">((state?.values?.method ?? current?.method) === "ewallet" ? "ewallet" : "bank");
  const fe = state?.fieldErrors ?? {};
  const providers = PAYOUT_PROVIDERS[method];
  const defaultProvider = state?.values?.providerName ?? current?.providerName ?? "";
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <div className="grid grid-cols-2 gap-2">
        {(["bank", "ewallet"] as const).map((m) => (
          <label key={m} className="cursor-pointer">
            <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} className="peer sr-only" />
            <span className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 text-sm font-semibold text-slate-700 peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:text-brand-700">
              {m === "bank" ? <Landmark className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
              {m === "bank" ? "Rekening bank" : "E-wallet"}
            </span>
          </label>
        ))}
      </div>
      <Field label={method === "bank" ? "Bank" : "E-wallet"} htmlFor="providerName" error={fe.providerName}>
        <select key={method} id="providerName" name="providerName" defaultValue={(providers as readonly string[]).includes(defaultProvider) ? defaultProvider : ""} required className={inputStyles}>
          <option value="" disabled>
            Pilih…
          </option>
          {providers.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>
      <Field label={method === "bank" ? "Nomor rekening" : "Nomor HP e-wallet"} htmlFor="accountNumber" error={fe.accountNumber}>
        <input id="accountNumber" name="accountNumber" inputMode="numeric" autoComplete="off" required className={inputStyles} placeholder={method === "bank" ? "1234567890" : "081234567890"} />
      </Field>
      <Field label="Nama pemilik (sesuai buku tabungan / aplikasi)" htmlFor="accountHolder" error={fe.accountHolder}>
        <input id="accountHolder" name="accountHolder" defaultValue={state?.values?.accountHolder ?? current?.accountHolder ?? ""} autoComplete="name" required className={inputStyles} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Password akun" htmlFor="pa-password" error={fe.password} hint="Konfirmasi karena ini menyangkut uang">
          <PasswordInput id="pa-password" name="password" autoComplete="current-password" />
        </Field>
        {mfaEnabled && (
          <Field label="Kode 2FA" htmlFor="pa-code" error={fe.code}>
            <input id="pa-code" name="code" inputMode="numeric" autoComplete="one-time-code" required className={cn(inputStyles, "font-mono tracking-widest")} placeholder="123456" />
          </Field>
        )}
      </div>
      <SubmitButton pendingText="Menyimpan…">{current ? "Ganti rekening" : "Simpan rekening"}</SubmitButton>
      {current && <p className="text-xs text-amber-700">Mengganti rekening = verifikasi ulang oleh admin sebelum pencairan berikutnya (perlindungan kalau akunmu dibobol).</p>}
    </form>
  );
}

export function PayoutRequestForm({ available, min, mfaEnabled }: { available: number; min: number; mfaEnabled: boolean }) {
  const [state, action] = useActionState(requestPayoutAction, undefined);
  const [amountText, setAmountText] = useState(state?.values?.amount ?? String(Math.max(0, available)));
  const fe = state?.fieldErrors ?? {};
  const amount = Number(digits(amountText) || 0);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <Field label="Jumlah dicairkan" htmlFor="amount" error={fe.amount} hint={`Minimal ${rp(min)} · tersedia ${rp(available)}`}>
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">Rp</span>
          <input
            id="amount"
            name="amount"
            inputMode="numeric"
            autoComplete="off"
            value={amountText ? amount.toLocaleString("id-ID") : ""}
            onChange={(e) => setAmountText(digits(e.target.value))}
            className={cn(inputStyles, "pl-10 font-bold")}
          />
        </div>
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Password akun" htmlFor="po-password" error={fe.password}>
          <PasswordInput id="po-password" name="password" autoComplete="current-password" />
        </Field>
        {mfaEnabled && (
          <Field label="Kode 2FA" htmlFor="po-code" error={fe.code}>
            <input id="po-code" name="code" inputMode="numeric" autoComplete="one-time-code" required className={cn(inputStyles, "font-mono tracking-widest")} placeholder="123456" />
          </Field>
        )}
      </div>
      <SubmitButton pendingText="Mengajukan…" disabled={amount < min || amount > available}>
        Ajukan pencairan {amount >= min ? rp(amount) : ""}
      </SubmitButton>
    </form>
  );
}

// ─── Admin ──────────────────────────────────────────────────────────────────
export function RefundForm({ code }: { code: string }) {
  const [state, action] = useActionState(refundOrderAction, undefined);
  if (state?.success) return <Alert tone="success">{state.success}</Alert>;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="code" value={code} />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Alasan refund" htmlFor="reason" error={state?.fieldErrors?.reason} hint="Contoh: file rusak & seller tidak merespons 3 hari. Dicatat di log.">
        <textarea id="reason" name="reason" rows={3} required minLength={5} maxLength={300} className={inputStyles} />
      </Field>
      <SubmitButton variant="danger" pendingText="Memproses…" confirm="Refund pesanan ini? Akses produk pembeli dicabut & pendapatan seller ditarik.">
        Refund pesanan
      </SubmitButton>
    </form>
  );
}

export function PayoutProcessForms({ payoutId }: { payoutId: string }) {
  const [paid, paidAction] = useActionState(markPayoutPaidAction, undefined);
  const [rej, rejAction] = useActionState(rejectPayoutAction, undefined);
  if (paid?.success || rej?.success) return <Alert tone="success">{paid?.success ?? rej?.success}</Alert>;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <form action={paidAction} className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
        <input type="hidden" name="payoutId" value={payoutId} />
        <label className="block text-xs font-semibold text-emerald-900" htmlFor={`ref-${payoutId}`}>
          Sudah ditransfer? Isi nomor referensi
        </label>
        <input id={`ref-${payoutId}`} name="transferRef" required minLength={4} maxLength={80} className={inputStyles} placeholder="No. referensi / berita transfer" />
        {(paid?.error || paid?.fieldErrors?.transferRef) && <p className="text-xs font-medium text-red-600">{paid.error ?? paid.fieldErrors?.transferRef}</p>}
        <SubmitButton variant="success" className="w-full" pendingText="Menyimpan…">
          Tandai terkirim
        </SubmitButton>
      </form>
      <form action={rejAction} className="space-y-2 rounded-xl border border-red-200 bg-red-50/40 p-3">
        <input type="hidden" name="payoutId" value={payoutId} />
        <label className="block text-xs font-semibold text-red-900" htmlFor={`rej-${payoutId}`}>
          Tolak (dana kembali ke saldo seller)
        </label>
        <input id={`rej-${payoutId}`} name="reason" required minLength={5} maxLength={300} className={inputStyles} placeholder="Alasan, mis. nama rekening tidak cocok" />
        {(rej?.error || rej?.fieldErrors?.reason) && <p className="text-xs font-medium text-red-600">{rej.error ?? rej.fieldErrors?.reason}</p>}
        <SubmitButton variant="danger" className="w-full" pendingText="Memproses…">
          Tolak pencairan
        </SubmitButton>
      </form>
    </div>
  );
}
