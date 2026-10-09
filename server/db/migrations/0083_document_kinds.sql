DROP INDEX "documents_user_idx";--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "kind" text DEFAULT 'woord' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "content" jsonb;--> statement-breakpoint
CREATE INDEX "documents_user_idx" ON "documents" USING btree ("user_id","kind","updated_at");