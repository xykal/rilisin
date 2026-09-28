CREATE TYPE "public"."forum_category_kind" AS ENUM('discussion', 'qa', 'announcement');--> statement-breakpoint
CREATE TABLE "forum_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"emoji" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" "forum_category_kind" DEFAULT 'discussion' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "forum_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"hidden_at" timestamp with time zone,
	"hidden_by" uuid,
	"hidden_reason" text,
	"report_hidden_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_replies_body_check" CHECK (char_length(body) <= 10000)
);
--> statement-breakpoint
CREATE TABLE "forum_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"product_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"last_reply_at" timestamp with time zone,
	"last_reply_by" uuid,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_reply_id" uuid,
	"pinned_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	"hidden_by" uuid,
	"hidden_reason" text,
	"report_hidden_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_threads_title_check" CHECK (char_length(title) between 1 and 200),
	CONSTRAINT "forum_threads_body_check" CHECK (char_length(body) <= 20000)
);
--> statement-breakpoint
CREATE TABLE "forum_votes" (
	"user_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_votes_user_id_target_type_target_id_pk" PRIMARY KEY("user_id","target_type","target_id"),
	CONSTRAINT "forum_votes_type_check" CHECK (target_type in ('thread', 'reply'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor_id" uuid,
	"url" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"group_key" text,
	"count" integer DEFAULT 1 NOT NULL,
	"read_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_url_check" CHECK (url like '/%' and url not like '//%')
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"version" text,
	"seller_reply" text,
	"seller_replied_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	"hidden_by" uuid,
	"hidden_reason" text,
	"report_hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	CONSTRAINT "product_reviews_rating_check" CHECK (rating between 1 and 5),
	CONSTRAINT "product_reviews_body_check" CHECK (char_length(body) <= 2000)
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "rating_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "rating_sum" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notify_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "forum_replies" ADD CONSTRAINT "forum_replies_thread_id_forum_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."forum_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_replies" ADD CONSTRAINT "forum_replies_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_replies" ADD CONSTRAINT "forum_replies_hidden_by_users_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_category_id_forum_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."forum_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_last_reply_by_users_id_fk" FOREIGN KEY ("last_reply_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_accepted_reply_id_forum_replies_id_fk" FOREIGN KEY ("accepted_reply_id") REFERENCES "public"."forum_replies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_hidden_by_users_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_votes" ADD CONSTRAINT "forum_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_hidden_by_users_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "forum_replies_thread_time_idx" ON "forum_replies" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "forum_replies_author_idx" ON "forum_replies" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "forum_threads_category_activity_idx" ON "forum_threads" USING btree ("category_id","last_activity_at");--> statement-breakpoint
CREATE INDEX "forum_threads_activity_idx" ON "forum_threads" USING btree ("last_activity_at");--> statement-breakpoint
CREATE INDEX "forum_threads_product_idx" ON "forum_threads" USING btree ("product_id","last_activity_at") WHERE product_id is not null;--> statement-breakpoint
CREATE INDEX "forum_threads_author_idx" ON "forum_threads" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "forum_threads_search_idx" ON "forum_threads" USING gin (to_tsvector('simple', "title" || ' ' || "body"));--> statement-breakpoint
CREATE INDEX "forum_votes_target_idx" ON "forum_votes" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "notifications_user_time_idx" ON "notifications" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id") WHERE read_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_group_unread_idx" ON "notifications" USING btree ("user_id","group_key") WHERE read_at is null and group_key is not null;--> statement-breakpoint
CREATE INDEX "password_resets_user_idx" ON "password_resets" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_reviews_product_user_idx" ON "product_reviews" USING btree ("product_id","user_id");--> statement-breakpoint
CREATE INDEX "product_reviews_product_time_idx" ON "product_reviews" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "product_reviews_user_idx" ON "product_reviews" USING btree ("user_id");--> statement-breakpoint
-- Fase 3: penghitung dijaga database (bukan kode aplikasi) supaya selalu konsisten —
-- berlaku untuk aksi user, aksi moderator, seed, maupun hapus akun (cascade).
-- Rating produk = hanya ulasan yang tampil (tidak disembunyikan moderator / laporan).
CREATE OR REPLACE FUNCTION "refresh_product_rating"(pid uuid) RETURNS void AS $$
  UPDATE "products" SET
    rating_count = (SELECT count(*) FROM "product_reviews" r WHERE r.product_id = pid AND r.hidden_at IS NULL AND r.report_hidden_at IS NULL),
    rating_sum = (SELECT coalesce(sum(r.rating), 0) FROM "product_reviews" r WHERE r.product_id = pid AND r.hidden_at IS NULL AND r.report_hidden_at IS NULL)
  WHERE id = pid;
$$ LANGUAGE sql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "product_reviews_sync_rating"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM "refresh_product_rating"(OLD.product_id);
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM "refresh_product_rating"(NEW.product_id);
  ELSE
    PERFORM "refresh_product_rating"(NEW.product_id);
    IF NEW.product_id IS DISTINCT FROM OLD.product_id THEN
      PERFORM "refresh_product_rating"(OLD.product_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "product_reviews_sync_rating" AFTER INSERT OR DELETE OR UPDATE OF rating, hidden_at, report_hidden_at, product_id ON "product_reviews" FOR EACH ROW EXECUTE FUNCTION "product_reviews_sync_rating"();
--> statement-breakpoint
-- Jumlah balasan & balasan terakhir thread = hanya balasan yang tampil. Balasan baru menaikkan thread ke atas ("aktif").
CREATE OR REPLACE FUNCTION "refresh_thread_replies"(tid uuid) RETURNS void AS $$
  UPDATE "forum_threads" t SET
    reply_count = s.n,
    last_reply_at = s.last_at,
    last_reply_by = s.last_by
  FROM (
    SELECT count(*) AS n, max(created_at) AS last_at, (array_agg(author_id ORDER BY created_at DESC))[1] AS last_by
    FROM "forum_replies"
    WHERE thread_id = tid AND deleted_at IS NULL AND hidden_at IS NULL AND report_hidden_at IS NULL
  ) s
  WHERE t.id = tid;
$$ LANGUAGE sql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "forum_replies_sync_thread"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM "refresh_thread_replies"(OLD.thread_id);
  ELSE
    PERFORM "refresh_thread_replies"(NEW.thread_id);
    IF TG_OP = 'INSERT' THEN
      UPDATE "forum_threads" SET last_activity_at = greatest(last_activity_at, NEW.created_at) WHERE id = NEW.thread_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "forum_replies_sync_thread" AFTER INSERT OR DELETE OR UPDATE OF deleted_at, hidden_at, report_hidden_at ON "forum_replies" FOR EACH ROW EXECUTE FUNCTION "forum_replies_sync_thread"();
--> statement-breakpoint
-- Skor upvote thread/balasan.
CREATE OR REPLACE FUNCTION "forum_votes_sync_score"() RETURNS trigger AS $$
DECLARE
  d int;
  tt text;
  tid uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    d := 1; tt := NEW.target_type; tid := NEW.target_id;
  ELSE
    d := -1; tt := OLD.target_type; tid := OLD.target_id;
  END IF;
  IF tt = 'thread' THEN
    UPDATE "forum_threads" SET score = greatest(0, score + d) WHERE id = tid;
  ELSE
    UPDATE "forum_replies" SET score = greatest(0, score + d) WHERE id = tid;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "forum_votes_sync_score" AFTER INSERT OR DELETE ON "forum_votes" FOR EACH ROW EXECUTE FUNCTION "forum_votes_sync_score"();
