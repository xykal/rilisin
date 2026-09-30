ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "audio_key" text;
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "audio_secs" integer;
ALTER TABLE "chat_uploads" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'image' NOT NULL;
ALTER TABLE "chat_uploads" ADD COLUMN IF NOT EXISTS "duration_secs" integer;
