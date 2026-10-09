CREATE TABLE "music_pages" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"genre" text DEFAULT 'pop' NOT NULL,
	"banner_path" text,
	"banner_y" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_likes" (
	"track_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "track_likes_track_id_user_id_pk" PRIMARY KEY("track_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "track_plays" (
	"id" serial PRIMARY KEY NOT NULL,
	"track_id" integer NOT NULL,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"genre" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"audio_path" text,
	"cover_path" text,
	"duration" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'verwerken' NOT NULL,
	"plays" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "video_upload_requests_open_idx";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "music_upload_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "channel_banner_path" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "channel_banner_y" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "video_upload_requests" ADD COLUMN "kind" text DEFAULT 'video' NOT NULL;--> statement-breakpoint
ALTER TABLE "music_pages" ADD CONSTRAINT "music_pages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_likes" ADD CONSTRAINT "track_likes_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_likes" ADD CONSTRAINT "track_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_plays" ADD CONSTRAINT "track_plays_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "track_likes_user_idx" ON "track_likes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "track_plays_time_idx" ON "track_plays" USING btree ("played_at","track_id");--> statement-breakpoint
CREATE INDEX "tracks_user_idx" ON "tracks" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "tracks_genre_idx" ON "tracks" USING btree ("genre","id");--> statement-breakpoint
CREATE INDEX "tracks_status_idx" ON "tracks" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "video_upload_requests_open_idx" ON "video_upload_requests" USING btree ("user_id","kind") WHERE "video_upload_requests"."status" = 'open';