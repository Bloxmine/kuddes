ALTER TABLE "gadget_pets" ADD COLUMN "coins" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "gadget_pets" ADD COLUMN "unlocked" text[] DEFAULT '{}'::text[] NOT NULL;