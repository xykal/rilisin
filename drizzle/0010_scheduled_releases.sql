ALTER TABLE "releases" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "releases_scheduled_idx" ON "releases" USING btree ("status","scheduled_at");
