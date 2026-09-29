CREATE TYPE "public"."seller_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN "status" "seller_status" DEFAULT 'approved'::"public"."seller_status" NOT NULL;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "seller_profiles" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."seller_status";--> statement-breakpoint
CREATE INDEX "seller_profiles_status_idx" ON "seller_profiles" USING btree ("status");--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;