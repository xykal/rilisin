/**
 * Aturan & helper komunitas (forum + ulasan) yang dipakai bersama server & browser.
 * (Jangan import modul server di sini.)
 */
import { REPORT_REASONS } from "@/lib/chat/shared";

export const FORUM_LIMITS = {
  titleMin: 8,
  titleMax: 140,
  bodyMin: 20,
  bodyMax: 20_000,
  replyMin: 2,
  replyMax: 10_000,
  threadsPageSize: 20,
  repliesPageSize: 30,
  maxLinks: 5,
  /** Anti-spam: thread per jam / per hari per akun (staf dikecualikan). */
  threadsPerHour: 5,
  threadsPerDay: 20,
  repliesPerHour: 60,
  /** Jeda minimal antar balasan (detik). */
  replyGapSec: 8,
  /** Postingan disembunyikan otomatis kalau dilaporkan sebanyak ini oleh orang berbeda. */
  reportHideThreshold: 3,
  maxMentions: 5,
} as const;

export const REVIEW_LIMITS = {
  bodyMax: 2000,
  /** Rating 1–2 wajib disertai alasan supaya seller tahu apa yang perlu diperbaiki. */
  lowRatingMinBody: 15,
  replyMax: 1500,
  pageSize: 10,
  previewCount: 4,
} as const;

export type ForumCategoryKind = "discussion" | "qa" | "announcement";

export const FORUM_SORTS = [
  { id: "aktif", label: "Aktif" },
  { id: "baru", label: "Terbaru" },
  { id: "teratas", label: "Teratas" },
  { id: "belum-terjawab", label: "Belum terjawab" },
] as const;
export type ForumSort = (typeof FORUM_SORTS)[number]["id"];

export function parseForumSort(v: unknown): ForumSort {
  return FORUM_SORTS.some((s) => s.id === v) ? (v as ForumSort) : "aktif";
}

/** Alasan laporan konten = alasan chat + alasan khusus ulasan, produk, dan akun. */
export const CONTENT_REPORT_REASONS = [
  ...REPORT_REASONS,
  { id: "palsu", label: "Ulasan palsu / tidak jujur" },
  { id: "malware", label: "Malware / aplikasi berbahaya" },
  { id: "menyamar", label: "Akun palsu / menyamar" },
] as const;
export type ContentReportReason = (typeof CONTENT_REPORT_REASONS)[number]["id"];
export const CONTENT_REPORT_REASON_IDS = CONTENT_REPORT_REASONS.map((r) => r.id) as [ContentReportReason, ...ContentReportReason[]];
export function contentReportReasonLabel(id: string) {
  return CONTENT_REPORT_REASONS.find((r) => r.id === id)?.label ?? id;
}

export type ContentTargetType = "forum_thread" | "forum_reply" | "review" | "product" | "user";
export const CONTENT_TARGET_TYPES = ["forum_thread", "forum_reply", "review", "product", "user"] as const;
export const CONTENT_TARGET_LABEL: Record<ContentTargetType, string> = {
  forum_thread: "Thread forum",
  forum_reply: "Balasan forum",
  review: "Ulasan",
  product: "Produk",
  user: "Akun",
};
const POST_REASONS: ContentReportReason[] = ["spam", "judol", "penipuan", "pelecehan", "sara", "dewasa", "bajakan", "lainnya"];
/** Alasan yang relevan per jenis konten (form laporan hanya menampilkan ini; server menolak yang lain). */
export const REASONS_BY_TARGET: Record<ContentTargetType, ContentReportReason[]> = {
  forum_thread: POST_REASONS,
  forum_reply: POST_REASONS,
  review: [...POST_REASONS, "palsu"],
  product: ["bajakan", "malware", "penipuan", "dewasa", "judol", "spam", "lainnya"],
  user: ["menyamar", "spam", "penipuan", "pelecehan", "judol", "lainnya"],
};
/** Produk & akun tidak disembunyikan otomatis oleh laporan (mudah disalahgunakan pesaing) — selalu diputuskan moderator. */
export const AUTO_HIDE_TARGETS: ContentTargetType[] = ["forum_thread", "forum_reply", "review"];

// ─── Mention @username ──────────────────────────────────────────────────────
/** Sama dengan pola yang dirender chat: huruf dulu, 3–20 karakter huruf/angka/underscore. */
export const MENTION_RE = /(^|[^\w@/.])@([a-zA-Z][a-zA-Z0-9_]{2,19})(?![\w])/g;
const CODE_RE = /```[\s\S]*?```|`[^`\n]*`/g;

/** Username yang disebut (huruf kecil, unik), mengabaikan yang ada di dalam blok/potongan kode. */
export function extractMentions(text: string, max: number = FORUM_LIMITS.maxMentions): string[] {
  const out = new Set<string>();
  for (const m of text.replace(CODE_RE, " ").matchAll(MENTION_RE)) {
    out.add(m[2]!.toLowerCase());
    if (out.size >= max) break;
  }
  return [...out];
}

// ─── Teks ────────────────────────────────────────────────────────────────────
/** Cuplikan polos dari Markdown (untuk notifikasi, daftar thread, email). */
export function plainSnippet(md: string, max = 140) {
  const t = md
    .replace(/```[\s\S]*?```/g, " [kode] ")
    .replace(/`([^`\n]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~]{1,3}([^*_~\n]+)[*_~]{1,3}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export const threadPath = (id: string) => `/forum/t/${id}`;
/** Link ke balasan tertentu: halaman dihitung server dari ?balasan=, fragmen menggulir ke balasannya. */
export const replyPath = (threadId: string, replyId: string) => `/forum/t/${threadId}?balasan=${replyId}#b-${replyId}`;

/** Rata-rata rating dengan satu desimal gaya Indonesia (4,7). */
export function formatRating(sum: number, count: number) {
  if (!count) return "0";
  return (Math.round((sum / count) * 10) / 10).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
