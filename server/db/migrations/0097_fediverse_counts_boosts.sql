ALTER TABLE "activities" ADD COLUMN "boosted_by_id" integer;--> statement-breakpoint
ALTER TABLE "remote_actors" ADD COLUMN "api_id" text;--> statement-breakpoint
ALTER TABLE "remote_actors" ADD COLUMN "counts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "statuses" ADD COLUMN "remote_likes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "statuses" ADD COLUMN "remote_boosts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "statuses" ADD COLUMN "remote_replies" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "statuses" ADD COLUMN "remote_api_id" text;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_boosted_by_id_users_id_fk" FOREIGN KEY ("boosted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;