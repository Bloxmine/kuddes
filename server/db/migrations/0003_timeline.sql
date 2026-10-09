CREATE TYPE "public"."activity_type" AS ENUM('status', 'photo', 'kietel', 'friendship', 'avatar', 'blip_join');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('iedereen', 'vrienden');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "activity_type" NOT NULL,
	"actor_id" integer NOT NULL,
	"target_user_id" integer,
	"status_id" integer,
	"photo_id" integer,
	"kietel_id" integer,
	"friendship_id" integer,
	"blip_id" integer,
	"visibility" "visibility" DEFAULT 'iedereen' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_respects" (
	"activity_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_respects_activity_id_user_id_pk" PRIMARY KEY("activity_id","user_id")
);
--> statement-breakpoint
-- Backfill the timeline from existing content, oldest first so ids stay chronological
INSERT INTO "activities" ("type", "actor_id", "target_user_id", "status_id", "photo_id", "kietel_id", "friendship_id", "blip_id", "created_at")
SELECT "type"::"activity_type", "actor_id", "target_user_id", "status_id", "photo_id", "kietel_id", "friendship_id", "blip_id", "created_at" FROM (
	SELECT 'status' AS "type", "user_id" AS "actor_id", NULL::integer AS "target_user_id", "id" AS "status_id", NULL::integer AS "photo_id", NULL::integer AS "kietel_id", NULL::integer AS "friendship_id", NULL::integer AS "blip_id", "created_at" FROM "statuses"
	UNION ALL SELECT 'photo', "user_id", NULL, NULL, "id", NULL, NULL, NULL, "created_at" FROM "photos"
	UNION ALL SELECT 'kietel', "author_id", "profile_id", NULL, NULL, "id", NULL, NULL, "created_at" FROM "kietels"
	UNION ALL SELECT 'friendship', "addressee_id", "requester_id", NULL, NULL, NULL, "id", NULL, coalesce("responded_at", "created_at") FROM "friendships" WHERE "status" = 'accepted'
	UNION ALL SELECT 'blip_join', "user_id", NULL, NULL, NULL, NULL, NULL, "blip_id", "joined_at" FROM "blip_members"
) AS existing ORDER BY "created_at";--> statement-breakpoint
-- Move WieWatWaar reactions onto their timeline item
INSERT INTO "activity_comments" ("activity_id", "user_id", "text", "created_at")
SELECT a."id", r."user_id", r."text", r."created_at" FROM "status_reactions" r JOIN "activities" a ON a."status_id" = r."status_id" ORDER BY r."id";--> statement-breakpoint
ALTER TABLE "status_reactions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "status_reactions" CASCADE;--> statement-breakpoint
ALTER TABLE "statuses" ADD COLUMN "mood" text;--> statement-breakpoint
ALTER TABLE "statuses" ADD COLUMN "visibility" "visibility" DEFAULT 'iedereen' NOT NULL;--> statement-breakpoint
ALTER TABLE "statuses" ADD COLUMN "photo_id" integer;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_kietel_id_kietels_id_fk" FOREIGN KEY ("kietel_id") REFERENCES "public"."kietels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_friendship_id_friendships_id_fk" FOREIGN KEY ("friendship_id") REFERENCES "public"."friendships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_blip_id_blips_id_fk" FOREIGN KEY ("blip_id") REFERENCES "public"."blips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_comments" ADD CONSTRAINT "activity_comments_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_comments" ADD CONSTRAINT "activity_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_respects" ADD CONSTRAINT "activity_respects_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_respects" ADD CONSTRAINT "activity_respects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_actor_idx" ON "activities" USING btree ("actor_id","id");--> statement-breakpoint
CREATE INDEX "activities_type_idx" ON "activities" USING btree ("type","id");--> statement-breakpoint
CREATE UNIQUE INDEX "activities_status_idx" ON "activities" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "activity_comments_activity_idx" ON "activity_comments" USING btree ("activity_id","id");--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE set null ON UPDATE no action;