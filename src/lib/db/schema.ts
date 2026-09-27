/**
 * Skema database Rilisin (Fase 1: akun, toko, katalog, rilis, file, library, moderasi).
 * Tabel transaksi/uang (Fase 2) dan komunitas (Fase 3) ditambahkan belakangan
 * lewat migrasi baru — lihat blueprint bagian 8.
 */
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
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
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
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
export type Product = typeof products.$inferSelect;
export type Release = typeof releases.$inferSelect;
export type ReleaseFile = typeof releaseFiles.$inferSelect;
