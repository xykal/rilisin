import "server-only";
import { randomBytes } from "node:crypto";
import { safeEqual } from "@/lib/security/crypto";
import { estimateFee, PAYMENT_METHODS, type PaymentMethodId } from "./methods";

export type TxnStatus = "pending" | "completed" | "canceled";

export type CreatedPayment = {
  txnId: string;
  fee: number;
  totalPay: number;
  qrString: string | null;
  vaNumber: string | null;
  paymentLink: string | null;
  expiresAt: Date;
  isSandbox: boolean;
  status: TxnStatus;
};

export type ProviderTxn = {
  txnId: string;
  orderCode: string;
  amount: number;
  status: TxnStatus;
  isSandbox: boolean;
  completedAt: Date | null;
};

export interface PaymentProvider {
  readonly id: "mock" | "pakasir";
  createPayment(input: { orderCode: string; amount: number; method: PaymentMethodId }): Promise<CreatedPayment>;
  getStatus(txnId: string): Promise<ProviderTxn>;
  cancel(txnId: string): Promise<void>;
  feeTable(amount: number): Promise<Record<string, number>>;
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

const toStatus = (s: unknown): TxnStatus => (s === "completed" ? "completed" : s === "canceled" ? "canceled" : "pending");
const toDate = (s: unknown) => {
  if (typeof s !== "string" || !s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

// ─── Pakasir API v2 (https://pakasir.com/p/create-transaction) ──────────────
// v1 (api_key di body/query) deprecated & mati 20 Okt 2026 → di sini murni v2: key lewat header X-Api-Key.
export function pakasirConfig() {
  return {
    baseUrl: (process.env.PAKASIR_BASE_URL || "https://app.pakasir.com").replace(/\/$/, ""),
    slug: process.env.PAKASIR_SLUG ?? "",
    apiKey: process.env.PAKASIR_API_KEY ?? "",
    webhookSecret: process.env.PAKASIR_WEBHOOK_SECRET ?? "",
    /** Production live: set 0 supaya transaksi sandbox tidak pernah memberi akses produk. */
    allowSandbox: process.env.PAKASIR_ALLOW_SANDBOX !== "0",
  };
}

const feeCache = new Map<number, { at: number; fees: Record<string, number> }>();

export function pakasirProvider(): PaymentProvider {
  const cfg = pakasirConfig();
  if (!cfg.slug || !cfg.apiKey) throw new PaymentProviderError("Pakasir belum dikonfigurasi (PAKASIR_SLUG / PAKASIR_API_KEY kosong).");
  const slug = encodeURIComponent(cfg.slug);

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl}${path}`, {
        method,
        headers: { "X-Api-Key": cfg.apiKey, ...(body ? { "Content-Type": "application/json" } : {}), Accept: "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
    } catch (err) {
      throw new PaymentProviderError(`Gateway pembayaran tidak bisa dihubungi (${(err as Error).name}).`);
    }
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* respons bukan JSON */
    }
    if (!res.ok) {
      const msg = (data as { message?: string; error?: string } | null)?.message ?? (data as { error?: string } | null)?.error;
      throw new PaymentProviderError(msg ? `Gateway menolak: ${String(msg).slice(0, 160)}` : `Gateway error HTTP ${res.status}`, res.status);
    }
    return data as T;
  }

  return {
    id: "pakasir",
    async createPayment({ orderCode, amount, method }) {
      // "find or create": dipanggil ulang dengan order_id sama → respons sama (aman untuk retry)
      const r = await call<Record<string, unknown>>("POST", `/api/v2/create-transaction/${slug}/${encodeURIComponent(orderCode)}`, { method, amount });
      const txnId = String(r.txn_id ?? "");
      if (!txnId) throw new PaymentProviderError("Respons gateway tidak berisi txn_id.");
      if (Number(r.amount) !== amount) throw new PaymentProviderError("Nominal di gateway tidak sama dengan pesanan.");
      const fee = Math.max(0, Math.trunc(Number(r.fee) || 0));
      return {
        txnId,
        fee,
        totalPay: Math.trunc(Number(r.total_payment) || amount + fee),
        qrString: (r.qr_string as string) || null,
        vaNumber: (r.va_number as string) || null,
        paymentLink: (r.payment_link as string) || null,
        expiresAt: toDate(r.expired_at) ?? new Date(Date.now() + 24 * 3600_000),
        isSandbox: r.is_sandbox === true,
        status: toStatus(r.status),
      };
    },
    async getStatus(txnId) {
      const r = await call<Record<string, unknown>>("GET", `/api/v2/transaction-status/${slug}/${encodeURIComponent(txnId)}`);
      return {
        txnId: String(r.txn_id ?? txnId),
        orderCode: String(r.order_id ?? ""),
        amount: Math.trunc(Number(r.amount) || 0),
        status: toStatus(r.status),
        isSandbox: r.is_sandbox === true,
        completedAt: toDate(r.completed_at),
      };
    },
    async cancel(txnId) {
      await call("POST", `/api/v2/cancel-transaction/${slug}/${encodeURIComponent(txnId)}`);
    },
    async feeTable(amount) {
      const hit = feeCache.get(amount);
      if (hit && Date.now() - hit.at < 10 * 60_000) return hit.fees;
      try {
        // API publik (tanpa key) → tidak dikirim header X-Api-Key
        const res = await fetch(`${cfg.baseUrl}/api/v2/payment-fee/${amount}`, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
        if (!res.ok) throw new Error(String(res.status));
        const raw = (await res.json()) as Record<string, unknown>;
        const fees = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.id, Math.trunc(Number(raw[m.id]) || estimateFee(m.id, amount))]));
        feeCache.set(amount, { at: Date.now(), fees });
        if (feeCache.size > 500) feeCache.delete(feeCache.keys().next().value as number);
        return fees;
      } catch {
        return Object.fromEntries(PAYMENT_METHODS.map((m) => [m.id, estimateFee(m.id, amount)]));
      }
    },
  };
}

/** Header X-Secret dari webhook Pakasir dibandingkan constant-time. Secret kosong = webhook selalu ditolak. */
export function verifyPakasirWebhookSecret(headerValue: string | null) {
  const { webhookSecret } = pakasirConfig();
  return !!webhookSecret && !!headerValue && safeEqual(headerValue, webhookSecret);
}

// ─── Simulator (development / demo / tes otomatis) ──────────────────────────
// Tidak ada uang sungguhan. Pesanan hanya lunas lewat tombol "Simulasikan pembayaran" (jalur kode yang
// sama persis dengan webhook asli), jadi alurnya bisa dicoba end-to-end tanpa akun gateway.
export function mockProvider(): PaymentProvider {
  return {
    id: "mock",
    async createPayment({ orderCode, amount, method }) {
      const fee = estimateFee(method, amount);
      const va = method === "qris" ? null : `8808${randomBytes(6).readUIntBE(0, 6).toString().padStart(12, "0").slice(0, 12)}`;
      return {
        txnId: `sim_${randomBytes(8).toString("hex")}`,
        fee,
        totalPay: amount + fee,
        qrString: method === "qris" ? `SIMULASI-RILISIN|${orderCode}|${amount + fee}|BUKAN-QRIS-ASLI` : null,
        vaNumber: va,
        paymentLink: null,
        expiresAt: new Date(Date.now() + 30 * 60_000),
        isSandbox: true,
        status: "pending",
      };
    },
    async getStatus(txnId) {
      return { txnId, orderCode: "", amount: 0, status: "pending", isSandbox: true, completedAt: null };
    },
    async cancel() {},
    async feeTable(amount) {
      return Object.fromEntries(PAYMENT_METHODS.map((m) => [m.id, estimateFee(m.id, amount)]));
    },
  };
}

export function paymentProviderId(): "mock" | "pakasir" {
  const v = (process.env.PAYMENT_PROVIDER ?? "mock").toLowerCase();
  return v === "pakasir" ? "pakasir" : "mock";
}

export function paymentProvider(id: string = paymentProviderId()): PaymentProvider {
  return id === "pakasir" ? pakasirProvider() : mockProvider();
}

export const isSimulationMode = () => paymentProviderId() === "mock";

export const PAYMENT_CONFIG = {
  holdDays: () => Math.max(0, Number(process.env.PAYMENT_HOLD_DAYS ?? 7)),
  payoutMin: () => Math.max(10_000, Number(process.env.PAYOUT_MIN_IDR ?? 50_000)),
};
