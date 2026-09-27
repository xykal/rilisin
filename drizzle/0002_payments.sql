CREATE TYPE "public"."ledger_kind" AS ENUM('sale', 'refund', 'payout', 'payout_reversal', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'expired', 'canceled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('requested', 'paid', 'rejected', 'canceled');--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"kind" "ledger_kind" NOT NULL,
	"amount_idr" bigint NOT NULL,
	"order_id" uuid,
	"payout_id" uuid,
	"available_at" timestamp with time zone NOT NULL,
	"memo" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_amount_check" CHECK (amount_idr <> 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"buyer_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_title" text NOT NULL,
	"amount_idr" bigint NOT NULL,
	"gateway_fee_idr" bigint DEFAULT 0 NOT NULL,
	"total_pay_idr" bigint DEFAULT 0 NOT NULL,
	"commission_bps" integer NOT NULL,
	"commission_idr" bigint NOT NULL,
	"seller_earning_idr" bigint NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"provider" text NOT NULL,
	"payment_method" text NOT NULL,
	"provider_txn_id" text,
	"payment_data" jsonb,
	"is_sandbox" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"refund_reason" text,
	"refunded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_code_unique" UNIQUE("code"),
	CONSTRAINT "orders_money_check" CHECK (amount_idr > 0 and gateway_fee_idr >= 0 and commission_idr >= 0 and seller_earning_idr >= 0 and commission_idr + seller_earning_idr = amount_idr)
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"source" text NOT NULL,
	"order_code" text,
	"order_id" uuid,
	"result" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_accounts" (
	"seller_id" uuid PRIMARY KEY NOT NULL,
	"method" text NOT NULL,
	"provider_name" text NOT NULL,
	"account_holder" text NOT NULL,
	"account_number_enc" text NOT NULL,
	"account_last4" text NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"amount_idr" bigint NOT NULL,
	"status" "payout_status" DEFAULT 'requested' NOT NULL,
	"method" text NOT NULL,
	"provider_name" text NOT NULL,
	"account_holder" text NOT NULL,
	"account_number_enc" text NOT NULL,
	"account_last4" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"processed_by" uuid,
	"transfer_ref" text,
	"reject_reason" text,
	CONSTRAINT "payouts_amount_check" CHECK (amount_idr > 0)
);
--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN "zero_commission_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_refunded_by_users_id_fk" FOREIGN KEY ("refunded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_seller_idx" ON "ledger_entries" USING btree ("seller_id","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_order_kind_idx" ON "ledger_entries" USING btree ("order_id","kind") WHERE order_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_payout_kind_idx" ON "ledger_entries" USING btree ("payout_id","kind") WHERE payout_id is not null;--> statement-breakpoint
CREATE INDEX "orders_buyer_idx" ON "orders" USING btree ("buyer_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_seller_idx" ON "orders" USING btree ("seller_id","status","paid_at");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_provider_txn_idx" ON "orders" USING btree ("provider","provider_txn_id") WHERE provider_txn_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_one_pending_idx" ON "orders" USING btree ("buyer_id","product_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "payment_events_order_idx" ON "payment_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "payouts_status_idx" ON "payouts" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "payouts_seller_idx" ON "payouts" USING btree ("seller_id","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_one_open_idx" ON "payouts" USING btree ("seller_id") WHERE status = 'requested';--> statement-breakpoint
-- Pengaman di level database: buku besar uang bersifat append-only. Koreksi = baris baru (refund/adjustment), bukan edit.
CREATE OR REPLACE FUNCTION "forbid_ledger_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries bersifat append-only (tidak boleh UPDATE/DELETE)';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "ledger_entries_append_only" BEFORE UPDATE OR DELETE ON "ledger_entries" FOR EACH ROW EXECUTE FUNCTION "forbid_ledger_mutation"();
