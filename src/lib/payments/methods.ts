/**
 * Metode pembayaran + batas nominal + estimasi biaya (aman dipakai di client & server).
 * Angka mengikuti Pakasir API v2 (cek 27 Sep 2026): QRIS 500–10 jt, VA 10 rb–50 jt.
 * Biaya gateway dibayar PEMBELI di atas harga (total = harga + biaya), jadi komisi & pendapatan
 * seller tidak tergerus biaya. Nilai pasti selalu diambil dari respons gateway saat transaksi dibuat.
 */
export const PAYMENT_METHODS = [
  { id: "qris", label: "QRIS", hint: "Scan pakai GoPay, OVO, DANA, ShopeePay, LinkAja, atau m-banking", kind: "qr", min: 500, max: 10_000_000 },
  { id: "bri_va", label: "BRI Virtual Account", hint: "Transfer dari BRImo / ATM BRI", kind: "va", min: 10_000, max: 50_000_000 },
  { id: "bni_va", label: "BNI Virtual Account", hint: "Transfer dari BNI Mobile / ATM BNI", kind: "va", min: 10_000, max: 50_000_000 },
  { id: "permata_va", label: "Permata Virtual Account", hint: "Bisa dari bank lain lewat transfer antarbank", kind: "va", min: 10_000, max: 50_000_000 },
  { id: "cimb_niaga_va", label: "CIMB Niaga Virtual Account", hint: "Transfer dari OCTO Mobile / ATM CIMB", kind: "va", min: 10_000, max: 50_000_000 },
  { id: "maybank_va", label: "Maybank Virtual Account", hint: "Transfer dari M2U / ATM Maybank", kind: "va", min: 10_000, max: 50_000_000 },
] as const;

export type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];
export const PAYMENT_METHOD_IDS = PAYMENT_METHODS.map((m) => m.id) as [PaymentMethodId, ...PaymentMethodId[]];

export function paymentMethod(id: string) {
  return PAYMENT_METHODS.find((m) => m.id === id) ?? null;
}

export function methodAllowed(id: string, amount: number) {
  const m = paymentMethod(id);
  return !!m && amount >= m.min && amount <= m.max;
}

/** Estimasi lokal (dipakai kalau API biaya gateway tidak bisa dihubungi, dan untuk mode simulasi). */
export function estimateFee(id: string, amount: number) {
  if (id === "qris") return Math.ceil(amount * 0.007) + 310; // 0,7% + Rp310 (cocok dengan contoh resmi Pakasir)
  return 3_500;
}

/** Batas harga produk berbayar di Rilisin. */
export const PRICE_LIMITS = {
  fixedMin: 10_000,
  max: 10_000_000,
  /** Bayar seikhlasnya: pembeli boleh bayar Rp0 kalau seller mengizinkan (min 0), selain itu minimal Rp1.000. */
  pwywFloor: 1_000,
} as const;

export const ORDER_STATUS_LABEL: Record<string, { label: string; tone: "slate" | "brand" | "green" | "amber" | "red" | "blue" }> = {
  pending: { label: "Menunggu pembayaran", tone: "amber" },
  paid: { label: "Lunas", tone: "green" },
  expired: { label: "Kedaluwarsa", tone: "slate" },
  canceled: { label: "Dibatalkan", tone: "slate" },
  refunded: { label: "Dana dikembalikan", tone: "red" },
};

export const PAYOUT_STATUS_LABEL: Record<string, { label: string; tone: "slate" | "brand" | "green" | "amber" | "red" | "blue" }> = {
  requested: { label: "Diproses", tone: "amber" },
  paid: { label: "Terkirim", tone: "green" },
  rejected: { label: "Ditolak", tone: "red" },
  canceled: { label: "Dibatalkan", tone: "slate" },
};

export const PAYOUT_PROVIDERS = {
  bank: ["BCA", "BRI", "BNI", "Mandiri", "BSI", "CIMB Niaga", "Permata", "Danamon", "BTN", "Bank Jago", "SeaBank", "Blu by BCA Digital", "Bank lain"],
  ewallet: ["DANA", "GoPay", "OVO", "ShopeePay", "LinkAja"],
} as const;
