ALTER TABLE "forum_replies" ADD COLUMN "parent_id" uuid REFERENCES "forum_replies"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX "forum_replies_parent_idx" ON "forum_replies" USING btree ("parent_id");
