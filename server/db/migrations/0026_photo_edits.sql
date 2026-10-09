ALTER TABLE "photos" ADD COLUMN "original_path" text;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "edits" jsonb;