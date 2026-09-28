CREATE TABLE "job_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"details" jsonb
);
--> statement-breakpoint
CREATE UNLOGGED TABLE "rate_limits" (
	"key" text NOT NULL,
	"bucket" bigint NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limits_key_bucket_pk" PRIMARY KEY("key","bucket")
);
--> statement-breakpoint
CREATE TABLE "system_kv" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "release_files" ADD COLUMN "scanned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "release_files" ADD COLUMN "scan_engine" text;--> statement-breakpoint
ALTER TABLE "release_files" ADD COLUMN "scan_signature" text;--> statement-breakpoint
ALTER TABLE "release_files" ADD COLUMN "scan_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "release_files" ADD COLUMN "scan_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "job_runs_job_time_idx" ON "job_runs" USING btree ("job","started_at");--> statement-breakpoint
CREATE INDEX "rate_limits_expires_idx" ON "rate_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "release_files_scan_idx" ON "release_files" USING btree ("scan_status","scan_claimed_at");