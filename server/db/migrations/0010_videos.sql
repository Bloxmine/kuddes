CREATE TYPE "public"."video_status" AS ENUM('uploaden', 'verwerken', 'klaar', 'mislukt');--> statement-breakpoint
CREATE TYPE "public"."video_visibility" AS ENUM('openbaar', 'verborgen', 'vrienden');--> statement-breakpoint
ALTER TYPE "public"."activity_type" ADD VALUE 'video';--> statement-breakpoint
CREATE TABLE "video_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_favorites" (
	"video_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_favorites_video_id_user_id_pk" PRIMARY KEY("video_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "video_ratings" (
	"video_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"stars" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_ratings_video_id_user_id_pk" PRIMARY KEY("video_id","user_id"),
	CONSTRAINT "video_ratings_stars" CHECK ("video_ratings"."stars" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"category" text DEFAULT 'overig' NOT NULL,
	"visibility" "video_visibility" DEFAULT 'openbaar' NOT NULL,
	"status" "video_status" DEFAULT 'uploaden' NOT NULL,
	"error" text,
	"file_path" text,
	"thumb_path" text,
	"duration" integer DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"views" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "video_id" integer;--> statement-breakpoint
ALTER TABLE "video_comments" ADD CONSTRAINT "video_comments_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_comments" ADD CONSTRAINT "video_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_favorites" ADD CONSTRAINT "video_favorites_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_favorites" ADD CONSTRAINT "video_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_ratings" ADD CONSTRAINT "video_ratings_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_ratings" ADD CONSTRAINT "video_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_comments_video_idx" ON "video_comments" USING btree ("video_id","id");--> statement-breakpoint
CREATE INDEX "video_favorites_user_idx" ON "video_favorites" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "videos_public_idx" ON "videos" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "videos_user_idx" ON "videos" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "videos_list_idx" ON "videos" USING btree ("status","visibility","id");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;