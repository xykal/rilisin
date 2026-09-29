/**
 * Jenis notifikasi, kategori preferensi, dan teks tampilannya.
 * Dipakai lonceng (browser), halaman /notifikasi, dan email — jadi teksnya konsisten.
 * (Jangan import modul server di sini.)
 */

export const NOTIFICATION_CATEGORIES = [
  {
    id: "transaksi",
    label: "Pesanan & pencairan",
    description: "Karyamu terjual, pencairan saldo diproses atau ditolak.",
    emailDefault: true,
    pushDefault: true,
  },
  {
    id: "karya",
    label: "Karya & ulasan",
    description: "Karya disetujui / perlu perbaikan, ulasan baru untuk karyamu, balasan seller untuk ulasanmu.",
    emailDefault: true,
    pushDefault: true,
  },
  {
    id: "komunitas",
    label: "Forum",
    description: "Balasan di thread kamu, mention @username, jawaban terbaik. Maksimal satu email per thread sampai kamu membukanya.",
    emailDefault: true,
    pushDefault: false,
  },
  {
    id: "diikuti",
    label: "Update yang kamu ikuti",
    description: "Versi baru & devlog dari karya yang kamu ikuti (otomatis untuk karya yang kamu unduh/beli), karya baru dari seller yang kamu ikuti.",
    emailDefault: false,
    pushDefault: false,
  },
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]["id"];

/** `email: false` = hanya di lonceng (chat terlalu ramai untuk email; struk pembayaran sudah punya email sendiri). */
export const NOTIFICATION_TYPES = {
  order_paid: { category: "transaksi", email: false },
  sale: { category: "transaksi", email: true },
  payout_paid: { category: "transaksi", email: true },
  payout_rejected: { category: "transaksi", email: true },
  product_approved: { category: "karya", email: true },
  product_rejected: { category: "karya", email: true },
  review_new: { category: "karya", email: true },
  review_reply: { category: "karya", email: true },
  forum_reply: { category: "komunitas", email: true },
  forum_mention: { category: "komunitas", email: true },
  forum_accepted: { category: "komunitas", email: true },
  chat_reply: { category: "komunitas", email: false },
  chat_mention: { category: "komunitas", email: false },
  product_update: { category: "diikuti", email: true },
  product_new: { category: "diikuti", email: true },
  product_devlog: { category: "diikuti", email: true },
  new_follower: { category: "karya", email: false },
} as const satisfies Record<string, { category: NotificationCategory; email: boolean }>;
export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export function isNotificationType(t: string): t is NotificationType {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_TYPES, t);
}

export function categoryOf(type: string): NotificationCategory | null {
  return isNotificationType(type) ? NOTIFICATION_TYPES[type].category : null;
}

/** Bentuk data yang dikirim ke browser (lonceng & halaman notifikasi). */
export type NotificationDTO = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  href: string;
  count: number;
  read: boolean;
  at: string;
  actor: { name: string; username: string; avatarUrl: string | null } | null;
};

type Describable = {
  type: string;
  count: number;
  actorName: string | null;
  data: Record<string, unknown>;
};

const str = (v: unknown, max = 160) => {
  const s = typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
const rupiah = (v: unknown) =>
  typeof v === "number" ? `Rp${v.toLocaleString("id-ID")}` : str(v);
const quote = (v: unknown) => `“${str(v, 80)}”`;

/** Judul + isi singkat notifikasi dalam Bahasa Indonesia. Semua teks polos (dirender sebagai teks, bukan HTML). */
export function describeNotification(n: Describable): { title: string; body: string | null } {
  const who = n.actorName || "Seseorang";
  const d = n.data ?? {};
  const many = n.count > 1;
  const snippet = str(d.snippet, 160) || null;
  switch (n.type) {
    case "order_paid":
      return { title: `Pembayaran ${str(d.orderCode)} diterima`, body: `${str(d.productTitle)} sudah ada di Library kamu.` };
    case "sale":
      return many
        ? { title: `${n.count} penjualan baru`, body: `Terakhir: ${str(d.productTitle)} (${rupiah(d.earning)} untukmu).` }
        : { title: `Karyamu terjual: ${str(d.productTitle)}`, body: `Pendapatanmu ${rupiah(d.earning)} — bisa dicairkan setelah masa tahan ${str(d.holdDays) || "7"} hari.` };
    case "payout_paid":
      return { title: `Pencairan ${rupiah(d.amount)} sudah ditransfer`, body: d.transferRef ? `No. referensi: ${str(d.transferRef, 80)}` : null };
    case "payout_rejected":
      return { title: `Pencairan ${rupiah(d.amount)} ditolak`, body: `${str(d.reason, 200) || "Tanpa alasan"}. Saldo sudah dikembalikan.` };
    case "product_approved":
      return { title: `${str(d.productTitle)} sudah tayang`, body: "Lolos review moderator dan sekarang muncul di katalog." };
    case "product_rejected":
      return { title: `${str(d.productTitle)} perlu perbaikan`, body: str(d.reason, 200) || null };
    case "review_new":
      return many
        ? { title: `${n.count} ulasan baru untuk ${str(d.productTitle)}`, body: `Terakhir dari ${who}: ${"★".repeat(Number(d.rating) || 0)}` }
        : { title: `${who} memberi ${"★".repeat(Number(d.rating) || 0)} untuk ${str(d.productTitle)}`, body: snippet };
    case "review_reply":
      return { title: `${who} membalas ulasanmu di ${str(d.productTitle)}`, body: snippet };
    case "forum_reply":
      return many
        ? { title: `${n.count} balasan baru di ${quote(d.threadTitle)}`, body: snippet ? `${who}: ${snippet}` : null }
        : { title: `${who} membalas ${quote(d.threadTitle)}`, body: snippet };
    case "forum_mention":
      return { title: `${who} menyebut kamu di ${quote(d.threadTitle)}`, body: snippet };
    case "forum_accepted":
      return { title: `Balasanmu jadi jawaban terbaik`, body: `Di thread ${quote(d.threadTitle)}. Mantap!` };
    case "chat_reply":
      return many
        ? { title: `${n.count} balasan untuk pesanmu di #${str(d.roomName, 40)}`, body: snippet ? `${who}: ${snippet}` : null }
        : { title: `${who} membalas pesanmu di #${str(d.roomName, 40)}`, body: snippet };
    case "chat_mention":
      return many
        ? { title: `Kamu disebut ${n.count}× di #${str(d.roomName, 40)}`, body: snippet ? `${who}: ${snippet}` : null }
        : { title: `${who} menyebut kamu di #${str(d.roomName, 40)}`, body: snippet };
    case "product_update":
      return many
        ? { title: `${str(d.productTitle)} punya ${n.count} versi baru`, body: `Terbaru: v${str(d.version, 30)}. ${snippet ?? ""}`.trim() }
        : { title: `Versi baru ${str(d.productTitle)} v${str(d.version, 30)}`, body: snippet ?? "Buka Library untuk mengunduh versi terbaru." };
    case "product_new":
      return many
        ? { title: `${str(d.sellerName) || who} merilis ${n.count} karya baru`, body: `Terbaru: ${str(d.productTitle)}` }
        : { title: `${str(d.sellerName) || who} merilis karya baru: ${str(d.productTitle)}`, body: snippet };
    case "product_devlog":
      return many
        ? { title: `${n.count} devlog baru dari ${str(d.productTitle)}`, body: `Terbaru: ${quote(d.threadTitle)}` }
        : { title: `Devlog baru ${str(d.productTitle)}: ${quote(d.threadTitle)}`, body: snippet };
    case "new_follower":
      return many ? { title: `${n.count} pengikut baru`, body: `Terakhir: ${who}` } : { title: `${who} mulai mengikutimu`, body: "Mereka akan dapat kabar saat kamu merilis karya baru." };
    default:
      return { title: "Notifikasi baru", body: snippet };
  }
}
