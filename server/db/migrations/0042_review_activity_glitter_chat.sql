ALTER TYPE "public"."activity_type" ADD VALUE 'review';--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "media_review_id" integer;--> statement-breakpoint
ALTER TABLE "messenger_lines" ADD COLUMN "glitter_id" integer;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_media_review_id_media_reviews_id_fk" FOREIGN KEY ("media_review_id") REFERENCES "public"."media_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messenger_lines" ADD CONSTRAINT "messenger_lines_glitter_id_glitters_id_fk" FOREIGN KEY ("glitter_id") REFERENCES "public"."glitters"("id") ON DELETE set null ON UPDATE no action;