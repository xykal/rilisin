/**
 * Skema database Rilisin.
 *  - Fase 1: akun, toko, katalog, rilis, file, library, moderasi.
 *  - Fase 1.5: keamanan akun (2FA, log keamanan, sesi) + komunitas chat grup + laporan.
 *  - Fase 2: uang — pesanan, log event pembayaran, buku besar saldo seller (append-only), rekening & pencairan.
 *    Aturan emas: rupiah selalu BIGINT (tanpa desimal), saldo = SUM(ledger), ledger tidak pernah di-UPDATE/DELETE.
 *  - Fase 3: komunitas — ulasan & rating (khusus pemilik), forum (thread/balasan/upvote/jawaban terbaik),
 *    notifikasi in-app + email, reset password lewat email.
 *    Penghitung (rating produk, jumlah balasan, skor vote) dijaga trigger database, bukan kode aplikasi.
 *  - Fase 3b: ikuti seller/produk (notifikasi karya baru, versi baru, devlog), lapor produk & profil.
 *  - Fase 4: rate limit bersama (Postgres), riwayat tugas terjadwal, hasil scan antivirus per file.
 */
import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  primaryKey,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const tsz = (name: string) => timestamp(name, { withTimezone: true });

// ─── Enum ────────────────────────────────────────────────────────────────────
export const userRole = pgEnum("user_role", ["user", "moderator", "admin"]);
export const productStatus = pgEnum("product_status", [
  "draft",
  "review",
  "published",
  "rejected",
  "suspended",
]);
export const releaseStatus = pgEnum("release_status", [
  "draft",
  "review",
  "published",
  "rejected",
]);
export const pricingModel = pgEnum("pricing_model", ["free", "fixed", "pwyw"]);
export const scanStatus = pgEnum("scan_status", [
  "pending",
  "clean",
  "infected",
  "error",
]);
export const androidRegistration = pgEnum("android_registration", [
  "registered",
  "not_registered",
]);
export const entitlementSource = pgEnum("entitlement_source", [
  "free",
  "purchase",
  "gift",
  "admin",
]);
export const chatRoomKind = pgEnum("chat_room_kind", ["public", "announcement"]);
export const orderStatus = pgEnum("order_status", ["pending", "paid", "expired", "canceled", "refunded"]);
export const ledgerKind = pgEnum("ledger_kind", ["sale", "refund", "payout", "payout_reversal", "adjustment"]);
export const payoutStatus = pgEnum("payout_status", ["requested", "paid", "rejected", "canceled"]);
export const reportStatus = pgEnum("report_status", ["open", "resolved", "dismissed"]);
/** discussion = diskusi biasa · qa = tanya jawab (ada jawaban terbaik) · announcement = hanya staf yang bisa membuat thread. */
export const forumCategoryKind = pgEnum("forum_category_kind", ["discussion", "qa", "announcement"]);

/** Preferensi notifikasi: email per kategori (lihat NOTIFICATION_CATEGORIES). Kunci yang tidak ada = pakai default. */
export type NotifyPrefs = { email?: Record<string, boolean> };
/** Data tampilan notifikasi (judul thread, nama produk, cuplikan, dll). Selalu dirender sebagai teks biasa. */
export type NotificationData = Record<string, string | number | null>;

// ─── Akun ────────────────────────────────────────────────────────────────────
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("user"),
    bio: text("bio"),
    avatarKey: text("avatar_key"),
    createdAt: createdAt(),
    bannedAt: tsz("banned_at"),
    banReason: text("ban_reason"),
    passwordChangedAt: tsz("password_changed_at"),
    /** Secret TOTP (2FA) terenkripsi AES-256-GCM. null = 2FA belum aktif. */
    totpSecretEnc: text("totp_secret_enc"),
    /** Secret sementara saat proses aktivasi 2FA (belum dikonfirmasi). */
    totpPendingEnc: text("totp_pending_enc"),
    totpEnabledAt: tsz("totp_enabled_at"),
    /** Time-step TOTP terakhir yang dipakai — kode yang sama tidak bisa dipakai 2x (anti replay). */
    totpLastStep: bigint("totp_last_step", { mode: "number" }),
    notifyPrefs: jsonb("notify_prefs").$type<NotifyPrefs>().notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [
    uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`),
    uniqueIndex("users_username_lower_idx").on(sql`lower(${t.username})`),
  ],
);

/** Session login. `id` = SHA-256 dari token di cookie (token asli tidak pernah disimpan). */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: tsz("expires_at").notNull(),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"),
    lastSeenAt: tsz("last_seen_at"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Kode cadangan 2FA (sekali pakai). Hanya hash-nya yang disimpan. */
export const recoveryCodes = pgTable(
  "recovery_codes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: tsz("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("recovery_codes_user_idx").on(t.userId)],
);

/** Tantangan login 2FA: password sudah benar, tinggal verifikasi kode. `id` = SHA-256 token cookie. */
export const authChallenges = pgTable("auth_challenges", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  nextPath: text("next_path").notNull().default("/"),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: tsz("expires_at").notNull(),
  createdAt: createdAt(),
});

/** Log keamanan: login, gagal login, 2FA, ganti password, pesan diblokir, aksi admin, dll. */
export const securityEvents = pgTable(
  "security_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("security_events_user_time_idx").on(t.userId, t.createdAt),
    index("security_events_type_time_idx").on(t.type, t.createdAt),
  ],
);

export const sellerProfiles = pgTable("seller_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  storeName: text("store_name").notNull(),
  tagline: text("tagline"),
  websiteUrl: text("website_url"),
  /** Seller terpercaya: produk & rilis baru langsung tayang tanpa antre review. */
  isTrusted: boolean("is_trusted").notNull().default(false),
  /** Komisi dalam basis poin (1000 = 10%). Dipakai mulai Fase 2. */
  commissionBps: integer("commission_bps").notNull().default(1000),
  /** Promo seller awal: sebelum tanggal ini komisi 0% (snapshot ke pesanan saat checkout). */
  zeroCommissionUntil: tsz("zero_commission_until"),
  activatedAt: tsz("activated_at").notNull().defaultNow(),
});

// ─── Katalog ─────────────────────────────────────────────────────────────────
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    descriptionMd: text("description_md").notNull().default(""),
    category: text("category").notNull(),
    platforms: text("platforms")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    pricingModel: pricingModel("pricing_model").notNull().default("free"),
    /** Harga dalam rupiah (integer, tanpa desimal). */
    priceIdr: bigint("price_idr", { mode: "number" }).notNull().default(0),
    minPriceIdr: bigint("min_price_idr", { mode: "number" }).notNull().default(0),
    license: text("license").notNull(),
    iconKey: text("icon_key"),
    coverKey: text("cover_key"),
    websiteUrl: text("website_url"),
    sourceUrl: text("source_url"),
    androidPackage: text("android_package"),
    androidRegistration: androidRegistration("android_registration"),
    /** Diisi moderator setelah mengecek bukti registrasi developer Android. */
    androidCheckedAt: tsz("android_checked_at"),
    status: productStatus("status").notNull().default("draft"),
    rejectionReason: text("rejection_reason"),
    isFeatured: boolean("is_featured").notNull().default(false),
    /** Jumlah pemilik unik (orang yang pernah download / beli). */
    downloadCount: integer("download_count").notNull().default(0),
    /** Dijaga trigger `product_reviews_sync_rating`: hanya ulasan yang tampil (tidak disembunyikan). */
    ratingCount: integer("rating_count").notNull().default(0),
    ratingSum: integer("rating_sum").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: tsz("updated_at").notNull().defaultNow(),
    submittedAt: tsz("submitted_at"),
    publishedAt: tsz("published_at"),
  },
  (t) => [
    index("products_status_published_idx").on(t.status, t.publishedAt),
    index("products_seller_idx").on(t.sellerId),
    index("products_category_idx").on(t.category),
    index("products_search_idx").using(
      "gin",
      sql`to_tsvector('simple', ${t.title} || ' ' || ${t.summary})`,
    ),
  ],
);

/** Screenshot produk (ikon & cover disimpan langsung di tabel products). */
export const productMedia = pgTable(
  "product_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    width: integer("width"),
    height: integer("height"),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("product_media_product_idx").on(t.productId, t.sort)],
);

export const releases = pgTable(
  "releases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    changelogMd: text("changelog_md").notNull().default(""),
    status: releaseStatus("status").notNull().default("draft"),
    rejectionReason: text("rejection_reason"),
    createdAt: createdAt(),
    submittedAt: tsz("submitted_at"),
    publishedAt: tsz("published_at"),
  },
  (t) => [
    uniqueIndex("releases_product_version_idx").on(t.productId, t.version),
    index("releases_product_status_idx").on(t.productId, t.status),
  ],
);

export const releaseFiles = pgTable(
  "release_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    releaseId: uuid("release_id")
      .notNull()
      .references(() => releases.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    filename: text("filename").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    detectedType: text("detected_type").notNull(),
    /** Diisi worker antivirus (ClamAV) lewat /api/internal/scan. pending = belum dipindai. */
    scanStatus: scanStatus("scan_status").notNull().default("pending"),
    scannedAt: tsz("scanned_at"),
    /** Mesin & versi database signature saat dipindai, mis. "ClamAV 1.4.3/27412". */
    scanEngine: text("scan_engine"),
    /** Nama signature kalau terinfeksi / pesan error kalau gagal. */
    scanSignature: text("scan_signature"),
    /** Sewa worker: file yang sedang dipindai tidak diambil worker lain selama 15 menit. */
    scanClaimedAt: tsz("scan_claimed_at"),
    scanAttempts: integer("scan_attempts").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("release_files_release_idx").on(t.releaseId),
    index("release_files_sha256_idx").on(t.sha256),
    index("release_files_scan_idx").on(t.scanStatus, t.scanClaimedAt),
  ],
);

/** Hash file yang diblokir (malware / bajakan) — upload ulang otomatis ditolak. */
export const blockedHashes = pgTable("blocked_hashes", {
  sha256: text("sha256").primaryKey(),
  reason: text("reason").notNull(),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
});

// ─── Library & download ─────────────────────────────────────────────────────
export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    source: entitlementSource("source").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("entitlements_user_product_idx").on(t.userId, t.productId)],
);

export const downloadLogs = pgTable(
  "download_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    releaseFileId: uuid("release_file_id").references(() => releaseFiles.id, {
      onDelete: "set null",
    }),
    ipHash: text("ip_hash"),
    createdAt: createdAt(),
  },
  (t) => [
    index("download_logs_product_time_idx").on(t.productId, t.createdAt),
    index("download_logs_user_product_idx").on(t.userId, t.productId),
  ],
);

// ─── Moderasi ────────────────────────────────────────────────────────────────
export const moderationActions = pgTable(
  "moderation_actions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** null = aksi otomatis sistem (misal auto-approve seller terpercaya). */
    moderatorId: uuid("moderator_id").references(() => users.id, {
      onDelete: "set null",
    }),
    targetType: text("target_type").notNull(), // product | release | user
    targetId: uuid("target_id").notNull(),
    action: text("action").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("moderation_target_idx").on(t.targetType, t.targetId)],
);

// ─── Komunitas: chat grup ───────────────────────────────────────────────────
export const chatRooms = pgTable("chat_rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull(),
  description: text("description").notNull().default(""),
  /** announcement = hanya admin/moderator yang bisa kirim pesan. */
  kind: chatRoomKind("kind").notNull().default("public"),
  sort: integer("sort").notNull().default(0),
  /** Mode lambat: jeda minimal (detik) antar pesan per anggota. 0 = mati. */
  slowModeSec: integer("slow_mode_sec").notNull().default(0),
  pinnedMessageId: uuid("pinned_message_id"),
  lastMessageAt: tsz("last_message_at"),
  createdAt: createdAt(),
});

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Urutan pesan (dipakai untuk paginasi & hitung belum dibaca). */
    seq: bigserial("seq", { mode: "number" }).notNull().unique(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => chatRooms.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull().default(""),
    replyToId: uuid("reply_to_id"),
    /** ID acak dari browser — kirim ulang karena sinyal jelek tidak bikin pesan dobel. */
    clientId: text("client_id"),
    imageKey: text("image_key"),
    imageW: integer("image_w"),
    imageH: integer("image_h"),
    createdAt: createdAt(),
    /** Naik setiap ada perubahan (edit, hapus, reaksi) — dipakai sinkronisasi realtime. */
    updatedAt: tsz("updated_at").notNull().defaultNow(),
    editedAt: tsz("edited_at"),
    deletedAt: tsz("deleted_at"),
    deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
    /** author | moderator */
    deleteReason: text("delete_reason"),
    /** Disembunyikan otomatis karena dilaporkan banyak anggota (menunggu moderator). */
    reportHiddenAt: tsz("report_hidden_at"),
  },
  (t) => [
    index("chat_messages_room_seq_idx").on(t.roomId, t.seq),
    index("chat_messages_room_updated_idx").on(t.roomId, t.updatedAt),
    index("chat_messages_author_time_idx").on(t.authorId, t.createdAt),
    uniqueIndex("chat_messages_author_client_idx").on(t.authorId, t.clientId),
  ],
);

/** Satu reaksi per orang per pesan (seperti WhatsApp). */
export const chatReactions = pgTable(
  "chat_reactions",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId] })],
);

/** "Hapus untuk saya": pesan disembunyikan hanya untuk user ini. */
export const chatHiddenMessages = pgTable(
  "chat_hidden_messages",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.messageId] })],
);

/** Penanda sudah dibaca sampai pesan ke-berapa (untuk badge belum dibaca). */
export const chatReads = pgTable(
  "chat_reads",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => chatRooms.id, { onDelete: "cascade" }),
    lastReadSeq: bigint("last_read_seq", { mode: "number" }).notNull().default(0),
    updatedAt: tsz("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roomId] })],
);

/** Riwayat edit (hanya untuk moderator saat menangani laporan). */
export const chatMessageEdits = pgTable(
  "chat_message_edits",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    previousBody: text("previous_body").notNull(),
    editedAt: createdAt(),
  },
  (t) => [index("chat_message_edits_msg_idx").on(t.messageId)],
);

/** Bisukan anggota (roomId null = semua ruang). */
export const chatMutes = pgTable(
  "chat_mutes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roomId: uuid("room_id").references(() => chatRooms.id, { onDelete: "cascade" }),
    until: tsz("until").notNull(),
    reason: text("reason"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("chat_mutes_user_until_idx").on(t.userId, t.until)],
);

/** Gambar yang diupload untuk chat (sudah dikonversi ke WebP, metadata EXIF dibuang). */
export const chatUploads = pgTable(
  "chat_uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    uploaderId: uuid("uploader_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    usedAt: tsz("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("chat_uploads_uploader_time_idx").on(t.uploaderId, t.createdAt)],
);

/** Laporan dari anggota (pesan chat; nanti juga produk & profil). */
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(), // chat_message | product | user
    targetId: uuid("target_id").notNull(),
    reason: text("reason").notNull(),
    note: text("note"),
    /** Salinan konten saat dilaporkan — tetap ada walau pesan diedit/dihapus pelaku. */
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>(),
    status: reportStatus("status").notNull().default("open"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: tsz("resolved_at"),
    resolution: text("resolution"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("reports_reporter_target_idx").on(t.reporterId, t.targetType, t.targetId),
    index("reports_status_time_idx").on(t.status, t.createdAt),
    index("reports_target_idx").on(t.targetType, t.targetId),
  ],
);

// ─── Komunitas: ulasan & rating (Fase 3) ────────────────────────────────────
/**
 * Satu ulasan per orang per produk. Hanya pemilik (punya entitlement: download gratis / beli) yang boleh menulis —
 * dicek di aplikasi. Seller tidak bisa menghapus ulasan, hanya membalas atau melapor.
 */
export const productReviews = pgTable(
  "product_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: smallint("rating").notNull(),
    body: text("body").notNull().default(""),
    /** Versi terbaru saat ulasan ditulis (konteks: ulasan untuk versi lama). */
    version: text("version"),
    sellerReply: text("seller_reply"),
    sellerRepliedAt: tsz("seller_replied_at"),
    hiddenAt: tsz("hidden_at"),
    hiddenBy: uuid("hidden_by").references(() => users.id, { onDelete: "set null" }),
    hiddenReason: text("hidden_reason"),
    /** Disembunyikan otomatis karena dilaporkan banyak anggota (menunggu moderator). */
    reportHiddenAt: tsz("report_hidden_at"),
    createdAt: createdAt(),
    updatedAt: tsz("updated_at").notNull().defaultNow(),
    editedAt: tsz("edited_at"),
  },
  (t) => [
    uniqueIndex("product_reviews_product_user_idx").on(t.productId, t.userId),
    index("product_reviews_product_time_idx").on(t.productId, t.createdAt),
    index("product_reviews_user_idx").on(t.userId),
    check("product_reviews_rating_check", sql`rating between 1 and 5`),
    check("product_reviews_body_check", sql`char_length(body) <= 2000`),
  ],
);

// ─── Komunitas: forum (Fase 3) ──────────────────────────────────────────────
export const forumCategories = pgTable("forum_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull(),
  description: text("description").notNull().default(""),
  kind: forumCategoryKind("kind").notNull().default("discussion"),
  sort: integer("sort").notNull().default(0),
  createdAt: createdAt(),
});

export const forumThreads = pgTable(
  "forum_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => forumCategories.id, { onDelete: "restrict" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Thread diskusi milik sebuah produk (tab Diskusi di halaman produk). */
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** Dijaga trigger dari forum_votes. */
    score: integer("score").notNull().default(0),
    /** Dijaga trigger dari forum_replies (hanya balasan yang tampil). */
    replyCount: integer("reply_count").notNull().default(0),
    lastReplyAt: tsz("last_reply_at"),
    lastReplyBy: uuid("last_reply_by").references(() => users.id, { onDelete: "set null" }),
    /** Urutan "aktif": naik saat thread dibuat / ada balasan baru. */
    lastActivityAt: tsz("last_activity_at").notNull().defaultNow(),
    acceptedReplyId: uuid("accepted_reply_id").references((): AnyPgColumn => forumReplies.id, { onDelete: "set null" }),
    pinnedAt: tsz("pinned_at"),
    lockedAt: tsz("locked_at"),
    hiddenAt: tsz("hidden_at"),
    hiddenBy: uuid("hidden_by").references(() => users.id, { onDelete: "set null" }),
    hiddenReason: text("hidden_reason"),
    reportHiddenAt: tsz("report_hidden_at"),
    /** Dihapus penulis (soft delete): hilang dari daftar, balasan tetap tersimpan untuk moderator. */
    deletedAt: tsz("deleted_at"),
    editedAt: tsz("edited_at"),
    createdAt: createdAt(),
    updatedAt: tsz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("forum_threads_category_activity_idx").on(t.categoryId, t.lastActivityAt),
    index("forum_threads_activity_idx").on(t.lastActivityAt),
    index("forum_threads_product_idx").on(t.productId, t.lastActivityAt).where(sql`product_id is not null`),
    index("forum_threads_author_idx").on(t.authorId, t.createdAt),
    index("forum_threads_search_idx").using("gin", sql`to_tsvector('simple', ${t.title} || ' ' || ${t.body})`),
    check("forum_threads_title_check", sql`char_length(title) between 1 and 200`),
    check("forum_threads_body_check", sql`char_length(body) <= 20000`),
  ],
);

export const forumReplies = pgTable(
  "forum_replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => forumThreads.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    score: integer("score").notNull().default(0),
    hiddenAt: tsz("hidden_at"),
    hiddenBy: uuid("hidden_by").references(() => users.id, { onDelete: "set null" }),
    hiddenReason: text("hidden_reason"),
    reportHiddenAt: tsz("report_hidden_at"),
    deletedAt: tsz("deleted_at"),
    editedAt: tsz("edited_at"),
    createdAt: createdAt(),
    updatedAt: tsz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("forum_replies_thread_time_idx").on(t.threadId, t.createdAt),
    index("forum_replies_author_idx").on(t.authorId, t.createdAt),
    check("forum_replies_body_check", sql`char_length(body) <= 10000`),
  ],
);

/** Upvote saja (tanpa downvote) — satu per orang per postingan. Skor dijaga trigger. */
export const forumVotes = pgTable(
  "forum_votes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(), // thread | reply
    targetId: uuid("target_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.targetType, t.targetId] }),
    index("forum_votes_target_idx").on(t.targetType, t.targetId),
    check("forum_votes_type_check", sql`target_type in ('thread', 'reply')`),
  ],
);

// ─── Ikuti (Fase 3b) ────────────────────────────────────────────────────────
/**
 * Mengikuti seller (karya baru) atau produk (versi baru & devlog). Pemilik produk otomatis mengikuti
 * saat pertama kali mengunduh / membeli (bisa berhenti kapan saja).
 */
export const follows = pgTable(
  "follows",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(), // seller | product
    targetId: uuid("target_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.targetType, t.targetId] }),
    index("follows_target_idx").on(t.targetType, t.targetId),
    check("follows_type_check", sql`target_type in ('seller', 'product')`),
  ],
);

// ─── Sistem (Fase 4) ────────────────────────────────────────────────────────
/**
 * Rate limit bersama antar server (Vercel bisa menjalankan banyak instance sekaligus — hitungan di memori
 * masing-masing instance mudah diakali). Tabel UNLOGGED (tanpa WAL, cepat); kunci sudah di-hash (tanpa IP/email mentah).
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    bucket: bigint("bucket", { mode: "number" }).notNull(),
    count: integer("count").notNull().default(0),
    expiresAt: tsz("expires_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.key, t.bucket] }), index("rate_limits_expires_idx").on(t.expiresAt)],
);

/** Riwayat tugas terjadwal (pemeliharaan harian, backup, worker antivirus) untuk halaman Sistem admin. */
export const jobRuns = pgTable(
  "job_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    job: text("job").notNull(),
    startedAt: tsz("started_at").notNull().defaultNow(),
    finishedAt: tsz("finished_at"),
    ok: boolean("ok"),
    details: jsonb("details").$type<Record<string, unknown>>(),
  },
  (t) => [index("job_runs_job_time_idx").on(t.job, t.startedAt)],
);

/** Status sistem kecil (mis. detak jantung worker antivirus). */
export const systemKv = pgTable("system_kv", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: tsz("updated_at").notNull().defaultNow(),
});

// ─── Notifikasi (Fase 3) ────────────────────────────────────────────────────
/**
 * Notifikasi in-app. Kejadian sejenis yang belum dibaca digabung lewat group_key
 * (mis. 5 balasan di thread yang sama = 1 notifikasi dengan count 5), jadi lonceng tidak banjir.
 * `url` wajib path internal (dicek constraint) — tidak bisa dipakai untuk open redirect.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    url: text("url").notNull(),
    data: jsonb("data").$type<NotificationData>().notNull().default(sql`'{}'::jsonb`),
    groupKey: text("group_key"),
    count: integer("count").notNull().default(1),
    readAt: tsz("read_at"),
    /** Email untuk grup ini sudah dikirim — balasan berikutnya tidak memicu email lagi sampai dibaca. */
    emailedAt: tsz("emailed_at"),
    createdAt: createdAt(),
    updatedAt: tsz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_time_idx").on(t.userId, t.updatedAt),
    index("notifications_unread_idx").on(t.userId).where(sql`read_at is null`),
    uniqueIndex("notifications_group_unread_idx").on(t.userId, t.groupKey).where(sql`read_at is null and group_key is not null`),
    check("notifications_url_check", sql`url like '/%' and url not like '//%'`),
  ],
);

/** Token reset password (sekali pakai, 30 menit). `id` = SHA-256 token; token asli hanya ada di email. */
export const passwordResets = pgTable(
  "password_resets",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: tsz("expires_at").notNull(),
    usedAt: tsz("used_at"),
    ipHash: text("ip_hash"),
    createdAt: createdAt(),
  },
  (t) => [index("password_resets_user_idx").on(t.userId, t.createdAt)],
);

// ─── Relasi (untuk query bertingkat) ────────────────────────────────────────
export const usersRelations = relations(users, ({ one, many }) => ({
  sellerProfile: one(sellerProfiles, {
    fields: [users.id],
    references: [sellerProfiles.userId],
  }),
  products: many(products),
}));

export const sellerProfilesRelations = relations(sellerProfiles, ({ one }) => ({
  user: one(users, { fields: [sellerProfiles.userId], references: [users.id] }),
}));

// ─── Uang (Fase 2) ───────────────────────────────────────────────────────────
/** Data pembayaran yang ditampilkan ke pembeli (bukan rahasia): string QRIS / nomor VA / link. */
export type PaymentData = { qrString?: string | null; vaNumber?: string | null; paymentLink?: string | null };

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Kode pesanan acak (juga dipakai sebagai order_id di payment gateway). Tidak bisa ditebak. */
    code: text("code").notNull().unique(),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    productTitle: text("product_title").notNull(),
    /** Harga produk yang dibayar (dasar komisi). Biaya gateway TIDAK termasuk. */
    amountIdr: bigint("amount_idr", { mode: "number" }).notNull(),
    /** Biaya layanan pembayaran dari gateway (dibayar pembeli di atas harga). */
    gatewayFeeIdr: bigint("gateway_fee_idr", { mode: "number" }).notNull().default(0),
    totalPayIdr: bigint("total_pay_idr", { mode: "number" }).notNull().default(0),
    commissionBps: integer("commission_bps").notNull(),
    commissionIdr: bigint("commission_idr", { mode: "number" }).notNull(),
    sellerEarningIdr: bigint("seller_earning_idr", { mode: "number" }).notNull(),
    status: orderStatus("status").notNull().default("pending"),
    provider: text("provider").notNull(),
    paymentMethod: text("payment_method").notNull(),
    providerTxnId: text("provider_txn_id"),
    paymentData: jsonb("payment_data").$type<PaymentData>(),
    isSandbox: boolean("is_sandbox").notNull().default(false),
    expiresAt: tsz("expires_at").notNull(),
    paidAt: tsz("paid_at"),
    lastCheckedAt: tsz("last_checked_at"),
    refundedAt: tsz("refunded_at"),
    refundReason: text("refund_reason"),
    refundedBy: uuid("refunded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: tsz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("orders_buyer_idx").on(t.buyerId, t.createdAt),
    index("orders_seller_idx").on(t.sellerId, t.status, t.paidAt),
    index("orders_status_idx").on(t.status, t.createdAt),
    uniqueIndex("orders_provider_txn_idx").on(t.provider, t.providerTxnId).where(sql`provider_txn_id is not null`),
    /** Maksimal 1 pesanan menunggu pembayaran per pembeli per produk (klik ganda = pesanan yang sama). */
    uniqueIndex("orders_one_pending_idx").on(t.buyerId, t.productId).where(sql`status = 'pending'`),
    check(
      "orders_money_check",
      sql`amount_idr > 0 and gateway_fee_idr >= 0 and commission_idr >= 0 and seller_earning_idr >= 0 and commission_idr + seller_earning_idr = amount_idr`,
    ),
  ],
);

/** Log mentah setiap event pembayaran (webhook/polling/simulasi) — audit & investigasi. Append-only. */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    provider: text("provider").notNull(),
    source: text("source").notNull(),
    orderCode: text("order_code"),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    result: text("result").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("payment_events_order_idx").on(t.orderId, t.createdAt)],
);

/** Rekening/e-wallet tujuan pencairan. Nomor rekening dienkripsi (AES-GCM); yang tampil cuma 4 digit terakhir. */
export const payoutAccounts = pgTable("payout_accounts", {
  sellerId: uuid("seller_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  method: text("method").notNull(),
  providerName: text("provider_name").notNull(),
  accountHolder: text("account_holder").notNull(),
  accountNumberEnc: text("account_number_enc").notNull(),
  accountLast4: text("account_last4").notNull(),
  /** Diisi admin setelah nama pemilik rekening dicek (KYC sederhana). Ganti rekening = verifikasi ulang. */
  verifiedAt: tsz("verified_at"),
  verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: tsz("updated_at").notNull().defaultNow(),
});

export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amountIdr: bigint("amount_idr", { mode: "number" }).notNull(),
    status: payoutStatus("status").notNull().default("requested"),
    /** Snapshot tujuan saat diajukan (kalau rekening diganti belakangan, pencairan ini tetap ke tujuan lama). */
    method: text("method").notNull(),
    providerName: text("provider_name").notNull(),
    accountHolder: text("account_holder").notNull(),
    accountNumberEnc: text("account_number_enc").notNull(),
    accountLast4: text("account_last4").notNull(),
    requestedAt: tsz("requested_at").notNull().defaultNow(),
    processedAt: tsz("processed_at"),
    processedBy: uuid("processed_by").references(() => users.id, { onDelete: "set null" }),
    transferRef: text("transfer_ref"),
    rejectReason: text("reject_reason"),
  },
  (t) => [
    index("payouts_status_idx").on(t.status, t.requestedAt),
    index("payouts_seller_idx").on(t.sellerId, t.requestedAt),
    uniqueIndex("payouts_one_open_idx").on(t.sellerId).where(sql`status = 'requested'`),
    check("payouts_amount_check", sql`amount_idr > 0`),
  ],
);

/**
 * Buku besar saldo seller. Satu baris = satu mutasi (positif = masuk, negatif = keluar).
 *  - sale: +pendapatan seller, available_at = paid_at + masa tahan (7 hari)
 *  - refund: −pendapatan, available_at = sama dengan sale-nya (kalau masih ditahan, yang berkurang saldo tertahan)
 *  - payout: −jumlah saat pengajuan (langsung mengurangi saldo tersedia) · payout_reversal: +jumlah kalau ditolak/dibatalkan
 * Saldo tersedia = SUM(amount) WHERE available_at <= now(); tertahan = SUM(amount) WHERE available_at > now().
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: ledgerKind("kind").notNull(),
    amountIdr: bigint("amount_idr", { mode: "number" }).notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }),
    payoutId: uuid("payout_id").references(() => payouts.id, { onDelete: "restrict" }),
    availableAt: tsz("available_at").notNull(),
    memo: text("memo"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("ledger_seller_idx").on(t.sellerId, t.availableAt),
    /** Idempoten: 1 pesanan = maksimal 1 sale & 1 refund; 1 pencairan = maksimal 1 debit & 1 pengembalian. */
    uniqueIndex("ledger_order_kind_idx").on(t.orderId, t.kind).where(sql`order_id is not null`),
    uniqueIndex("ledger_payout_kind_idx").on(t.payoutId, t.kind).where(sql`payout_id is not null`),
    check("ledger_amount_check", sql`amount_idr <> 0`),
  ],
);

export const productsRelations = relations(products, ({ one, many }) => ({
  seller: one(users, { fields: [products.sellerId], references: [users.id] }),
  media: many(productMedia),
  releases: many(releases),
}));

export const productMediaRelations = relations(productMedia, ({ one }) => ({
  product: one(products, {
    fields: [productMedia.productId],
    references: [products.id],
  }),
}));

export const releasesRelations = relations(releases, ({ one, many }) => ({
  product: one(products, { fields: [releases.productId], references: [products.id] }),
  files: many(releaseFiles),
}));

export const releaseFilesRelations = relations(releaseFiles, ({ one }) => ({
  release: one(releases, {
    fields: [releaseFiles.releaseId],
    references: [releases.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type ChatRoom = typeof chatRooms.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Release = typeof releases.$inferSelect;
export type ReleaseFile = typeof releaseFiles.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
export type ProductReview = typeof productReviews.$inferSelect;
export type ForumCategory = typeof forumCategories.$inferSelect;
export type ForumThread = typeof forumThreads.$inferSelect;
export type ForumReply = typeof forumReplies.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
