/** Konstanta scope API key — MURNI (tanpa import server) supaya aman dipakai komponen browser. */
export const API_SCOPES = ["seller:read", "seller:write", "admin:read"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const SCOPE_LABELS: Record<ApiScope, string> = {
  "seller:read": "Seller: baca (produk, rilis)",
  "seller:write": "Seller: tulis (bikin draft, upload file)",
  "admin:read": "Admin: baca (statistik, antrean)",
};
