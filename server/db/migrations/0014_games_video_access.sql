CREATE TYPE "public"."game_end" AS ENUM('uitgespeeld', 'opgegeven', 'verlaten');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('uitgenodigd', 'bezig', 'klaar', 'geweigerd', 'geannuleerd', 'afgebroken');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('open', 'goedgekeurd', 'afgewezen');--> statement-breakpoint
CREATE TABLE "games" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'mancala' NOT NULL,
	"host_id" integer NOT NULL,
	"guest_id" integer NOT NULL,
	"status" "game_status" DEFAULT 'uitgenodigd' NOT NULL,
	"winner_id" integer,
	"host_score" integer DEFAULT 0 NOT NULL,
	"guest_score" integer DEFAULT 0 NOT NULL,
	"moves" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"highlights" jsonb,
	"end_reason" "game_end",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "games_not_self" CHECK ("games"."host_id" <> "games"."guest_id")
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"user_id" integer NOT NULL,
	"key" text NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone,
	CONSTRAINT "user_achievements_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "video_upload_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"motivation" text DEFAULT '' NOT NULL,
	"status" "request_status" DEFAULT 'open' NOT NULL,
	"answer" text,
	"handled_at" timestamp with time zone,
	"handled_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "video_upload_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "codec" text DEFAULT 'h264' NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_guest_id_users_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_winner_id_users_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_upload_requests" ADD CONSTRAINT "video_upload_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_upload_requests" ADD CONSTRAINT "video_upload_requests_handled_by_id_users_id_fk" FOREIGN KEY ("handled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "games_host_idx" ON "games" USING btree ("host_id","status");--> statement-breakpoint
CREATE INDEX "games_guest_idx" ON "games" USING btree ("guest_id","status");--> statement-breakpoint
CREATE INDEX "games_finished_idx" ON "games" USING btree ("status","finished_at");--> statement-breakpoint
CREATE INDEX "video_upload_requests_status_idx" ON "video_upload_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "video_upload_requests_open_idx" ON "video_upload_requests" USING btree ("user_id") WHERE "video_upload_requests"."status" = 'open';--> statement-breakpoint
-- Who already uploaded videos (and the admin) keeps the right to upload
UPDATE "users" SET "video_upload_allowed" = true WHERE "forum_role" = 'admin' OR "id" IN (SELECT DISTINCT "user_id" FROM "videos");
