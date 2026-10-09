ALTER TYPE "public"."activity_type" ADD VALUE 'track';--> statement-breakpoint
ALTER TYPE "public"."activity_type" ADD VALUE 'radio';--> statement-breakpoint
ALTER TYPE "public"."activity_type" ADD VALUE 'photography';--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "track_id" integer;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "music_pages" ADD COLUMN "avatar_path" text;--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "released_on" date;--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "release_year_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "credits" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;