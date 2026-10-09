ALTER TABLE "users" ADD COLUMN "theme" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "buddy_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "buddy_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "buddy_mood" text;