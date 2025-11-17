-- Create conversation_message table if it doesn't exist
CREATE TABLE IF NOT EXISTS "video_conversation_message" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"parts" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Add columns to video_session if they don't exist
DO $$ 
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns 
		WHERE table_name = 'video_session' AND column_name = 'current_step'
	) THEN
		ALTER TABLE "video_session" ADD COLUMN "current_step" varchar(50);
	END IF;
	
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns 
		WHERE table_name = 'video_session' AND column_name = 'workflow_context'
	) THEN
		ALTER TABLE "video_session" ADD COLUMN "workflow_context" jsonb;
	END IF;
END $$;
--> statement-breakpoint
-- Add foreign key constraint if it doesn't exist
DO $$ 
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint 
		WHERE conname = 'video_conversation_message_session_id_video_session_id_fk'
	) THEN
		ALTER TABLE "video_conversation_message" ADD CONSTRAINT "video_conversation_message_session_id_video_session_id_fk" 
		FOREIGN KEY ("session_id") REFERENCES "public"."video_session"("id") 
		ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;