ALTER TABLE "chat_rooms" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD COLUMN "invite_code" text;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD COLUMN "owner_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_rooms_invite_code_idx" ON "chat_rooms" USING btree ("invite_code");--> statement-breakpoint
CREATE TABLE "chat_members" (
	"room_id" uuid NOT NULL REFERENCES "chat_rooms"("id") ON DELETE CASCADE,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_members_pkey" PRIMARY KEY("room_id","user_id")
);
