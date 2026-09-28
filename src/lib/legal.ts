import "server-only";
import { LEGAL_AUP } from "@/content/legal/AUP";
import { LEGAL_COOKIES } from "@/content/legal/COOKIES";
import { LEGAL_PRIVACY } from "@/content/legal/PRIVACY";
import { LEGAL_REFUND } from "@/content/legal/REFUND";
import { LEGAL_TERMS } from "@/content/legal/TERMS";

/**
 * Daftar dokumen hukum yang tampil di situs. Isi teks dibuat otomatis dari
 * docs/legal/*.md (lihat scripts/sync-legal.mjs + pemeriksaan `npm run legal:check`
 * di CI) supaya tidak ada dua salinan yang bisa berbeda.
 *
 * Seluruh dokumen masih DRAFT (ada placeholder [TANGGAL BERLAKU] dll) sehingga
 * halaman-halamannya berstatus noindex sampai pengacara menandatangani versi final.
 */
export type LegalDoc = {
  /** Nama route publik, mis. "ketentuan" → /ketentuan */
  slug: string;
  title: string;
  /** Penjelasan singkat untuk daftar di halaman indeks & footer. */
  summary: string;
  markdown: string;
};

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "ketentuan",
    title: "Syarat & Ketentuan",
    summary: "Aturan main pakai Rilisin: akun, hak & kewajiban, komisi, konten, dan penyelesaian sengketa.",
    markdown: LEGAL_TERMS,
  },
  {
    slug: "privasi",
    title: "Kebijakan Privasi",
    summary: "Data apa yang kami kumpulkan, untuk apa, berapa lama disimpan, dan hak kamu menurut UU PDP.",
    markdown: LEGAL_PRIVACY,
  },
  {
    slug: "kuki",
    title: "Kebijakan Kuki",
    summary: "Daftar kuki & penyimpanan lokal yang dipakai situs, lengkap dengan masa berlakunya.",
    markdown: LEGAL_COOKIES,
  },
  {
    slug: "aup",
    title: "Aturan Pakai yang Diterima",
    summary: "Hal yang tidak boleh dilakukan di Rilisin: konten ilegal, penipuan, penyalahgunaan sistem.",
    markdown: LEGAL_AUP,
  },
  {
    slug: "refund",
    title: "Kebijakan Refund",
    summary: "Kapan pembeli bisa minta uang kembali: file terinfeksi, tidak sesuai deskripsi, atau tidak bisa diunduh.",
    markdown: LEGAL_REFUND,
  },
];

export function legalDoc(slug: string) {
  return LEGAL_DOCS.find((d) => d.slug === slug) ?? null;
}

/** Placeholder yang belum diisi di dokumen hukum (untuk peringatan jujur di halaman publik). */
export const LEGAL_PLACEHOLDER = /\[[A-Z0-9 %/.]+\]/;
