/**
 * Skema database Rilisin.
 *  - Fase 1: akun, toko, katalog, rilis, file, library, moderasi.
 *  - Fase 1.5: keamanan akun (2FA, log keamanan, sesi) + komunitas chat grup + laporan.
 * Tabel transaksi/uang (Fase 2) ditambahkan belakangan lewat migrasi baru — lihat blueprint bagian 8.
 */
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  primaryKey,
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
export const reportStatus = pgEnum("report_status", ["open", "resolved", "dismissed"]);

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
    /** Fase 4: diisi worker scan malware (ClamAV). Sekarang: "pending" + review manual. */
    scanStatus: scanStatus("scan_status").notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [
    index("release_files_release_idx").on(t.releaseId),
    index("release_files_sha256_idx").on(t.sha256),
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
