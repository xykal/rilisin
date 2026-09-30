/**
 * Konstanta, tipe, dan aturan chat yang dipakai bersama oleh server & browser.
 * (Jangan import modul server di sini.)
 */

export const CHAT_LIMITS = {
  maxChars: 2000,
  /** Edit hanya dalam 15 menit (seperti WhatsApp). */
  editWindowMs: 15 * 60 * 1000,
  /** "Hapus untuk semua orang" hanya dalam 48 jam — moderator kapan saja. */
  deleteWindowMs: 48 * 60 * 60 * 1000,
  pageSize: 40,
  imageMaxBytes: 8 * 1024 * 1024,
  audioMaxBytes: 5 * 1024 * 1024,
  /** Durasi rekam maksimal per pesan suara. */
  audioMaxSecs: 300,
  /** Pesan otomatis disembunyikan kalau dilaporkan sebanyak ini oleh orang berbeda. */
  reportHideThreshold: 3,
  /** Akun baru belum boleh kirim link selama sekian jam (anti bot spam). */
  newAccountLinkHours: 24,
  maxLinksPerMessage: 3,
} as const;

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

export const EMOJI_GROUPS = [
  {
    id: "ekspresi",
    label: "Ekspresi",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘",
      "😋", "😜", "🤪", "🤗", "🤭", "🤔", "🤐", "😐", "😶", "😏", "😒", "🙄", "😬", "😌", "😔", "😴",
      "😷", "🤯", "🥳", "😎", "🤓", "🧐", "😕", "😟", "😮", "😲", "😳", "🥺", "😢", "😭", "😱", "😤",
      "😡", "💀", "🤡", "👻", "🙈", "🙊",
    ],
  },
  {
    id: "gestur",
    label: "Gestur",
    emojis: ["👍", "👎", "👌", "✌️", "🤞", "🤟", "🤙", "👈", "👉", "👆", "👇", "✋", "👋", "👏", "🙌", "🙏", "🤝", "💪", "🫡", "🫶"],
  },
  {
    id: "simbol",
    label: "Simbol",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "💯", "✨", "🔥", "⭐", "🌟", "⚡", "💥", "✅", "❌", "⚠️", "❓", "❗", "🎉", "🎊", "🏆", "🥇", "🎯", "💡"],
  },
  {
    id: "kreator",
    label: "Kreator",
    emojis: ["💻", "⌨️", "🖥️", "📱", "🎮", "🕹️", "🎨", "🖌️", "📚", "📖", "📝", "🐛", "🚀", "🛠️", "⚙️", "🔧", "🧪", "📦", "☕", "🍵", "🍜", "🌶️", "🇮🇩"],
  },
] as const;

/** Hanya emoji dari daftar ini yang boleh dipakai sebagai reaksi (validasi di server). */
export const ALLOWED_REACTIONS: ReadonlySet<string> = new Set<string>([
  ...QUICK_REACTIONS,
  ...EMOJI_GROUPS.flatMap((g) => g.emojis as readonly string[]),
]);

export const REPORT_REASONS = [
  { id: "spam", label: "Spam / promosi berlebihan" },
  { id: "judol", label: "Judi online / pinjol ilegal" },
  { id: "penipuan", label: "Penipuan / phishing" },
  { id: "pelecehan", label: "Pelecehan / bullying" },
  { id: "sara", label: "SARA / ujaran kebencian" },
  { id: "dewasa", label: "Konten dewasa" },
  { id: "bajakan", label: "Link bajakan / crack" },
  { id: "lainnya", label: "Lainnya" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["id"];
export const REPORT_REASON_IDS = REPORT_REASONS.map((r) => r.id) as [ReportReason, ...ReportReason[]];

export function reportReasonLabel(id: string) {
  return REPORT_REASONS.find((r) => r.id === id)?.label ?? id;
}

export const MUTE_OPTIONS = [
  { minutes: 60, label: "1 jam" },
  { minutes: 24 * 60, label: "24 jam" },
  { minutes: 7 * 24 * 60, label: "7 hari" },
] as const;

// ─── Tipe data yang dikirim ke browser ─────────────────────────────────────
export type ChatRole = "user" | "moderator" | "admin";

export type ChatUserDTO = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: ChatRole;
  isSeller: boolean;
  isTrusted: boolean;
};

export type ChatReactionDTO = {
  emoji: string;
  count: number;
  users: { id: string; name: string }[];
};

export type ChatMessageDTO = {
  id: string;
  seq: number;
  roomId: string;
  clientId: string | null;
  author: ChatUserDTO;
  /** Kosong kalau pesan dihapus / disembunyikan. */
  body: string;
  image: { url: string; w: number; h: number } | null;
  audio: { url: string; secs: number } | null;
  replyTo: {
    id: string;
    authorId: string;
    authorName: string;
    body: string;
    hasImage: boolean;
    hasAudio: boolean;
    unavailable: boolean;
  } | null;
  reactions: ChatReactionDTO[];
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  deleted: null | "author" | "moderator";
  hiddenByReports: boolean;
};

export type ChatRoomDTO = {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  description: string;
  kind: "public" | "announcement";
  slowModeSec: number;
  pinnedMessageId: string | null;
  /** Grup privat: hanya anggota yang melihat di daftar. */
  isPrivate: boolean;
  lastMessage: { authorName: string; preview: string; at: string } | null;
  unread: number | null;
};

export type ChatViewerDTO = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: ChatRole;
  createdAt: string;
};

export type ChatMuteDTO = { until: string; reason: string | null } | null;

/** Event realtime (Server-Sent Events) */
export type ChatActivity = {
  roomId: string;
  seq: number;
  authorId: string;
  authorName: string;
  preview: string;
  at: string;
};

// ─── Aturan (dipakai UI untuk menampilkan menu, dan server untuk memvalidasi) ──
export function isStaffRole(role: ChatRole | null | undefined) {
  return role === "admin" || role === "moderator";
}

export function canEdit(msg: Pick<ChatMessageDTO, "author" | "createdAt" | "deleted" | "hiddenByReports">, viewerId: string | null, now = Date.now()) {
  return (
    !!viewerId &&
    msg.author.id === viewerId &&
    !msg.deleted &&
    !msg.hiddenByReports &&
    now - new Date(msg.createdAt).getTime() <= CHAT_LIMITS.editWindowMs
  );
}

export function canDeleteForEveryone(
  msg: Pick<ChatMessageDTO, "author" | "createdAt" | "deleted">,
  viewer: { id: string; role: ChatRole } | null,
  now = Date.now(),
) {
  if (!viewer || msg.deleted) return false;
  if (isStaffRole(viewer.role)) return true;
  return msg.author.id === viewer.id && now - new Date(msg.createdAt).getTime() <= CHAT_LIMITS.deleteWindowMs;
}

/** Cuplikan satu baris untuk balasan / daftar ruang. */
export function snippet(body: string, max = 90) {
  const oneLine = body.replace(/```[\s\S]*?```/g, "[kode]").replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/** Pratinjau pesan berlampiran — satu-satunya tempat label 📷/🎤 hidup (daftar ruang, SSE, notif, optimistik). */
export function attachmentPreview(body: string, kind: "image" | "audio" | null): string {
  if (kind === "image") return body ? `📷 ${snippet(body, 60)}` : "📷 Foto";
  if (kind === "audio") return body ? `🎤 ${snippet(body, 60)}` : "🎤 Pesan suara";
  return snippet(body, 70);
}
