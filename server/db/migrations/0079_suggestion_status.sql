ALTER TYPE "public"."notification_kind" ADD VALUE 'suggestie';--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "status" text DEFAULT 'nieuw' NOT NULL;--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "status_note" text;--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "status_at" timestamp with time zone;--> statement-breakpoint
-- What the admin already dealt with counts as done
UPDATE "suggestions" SET "status" = 'klaar', "status_at" = "handled_at" WHERE "handled_at" IS NOT NULL;
