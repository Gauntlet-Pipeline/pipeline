ALTER TABLE "video_asset" ADD COLUMN "s3_key" text;--> statement-breakpoint
ALTER TABLE "video_session" ADD COLUMN "extracted_facts" jsonb;