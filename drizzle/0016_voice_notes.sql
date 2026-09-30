ALTER TABLE "chat_messages" ADD COLUMN "audio_key" text;
ALTER TABLE "chat_messages" ADD COLUMN "audio_secs" integer;
ALTER TABLE "chat_uploads" ADD COLUMN "kind" text DEFAULT 'image' NOT NULL;
ALTER TABLE "chat_uploads" ADD COLUMN "duration_secs" integer;
