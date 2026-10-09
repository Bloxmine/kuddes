-- More than one photo with a WieWatWaar: the photos move to their own table, in order.
CREATE TABLE "status_photos" (
	"status_id" integer NOT NULL,
	"position" integer NOT NULL,
	"photo_id" integer,
	"kudde_photo_id" integer,
	CONSTRAINT "status_photos_status_id_position_pk" PRIMARY KEY("status_id","position"),
	CONSTRAINT "status_photos_one_source" CHECK (("status_photos"."photo_id" is null) <> ("status_photos"."kudde_photo_id" is null))
);
--> statement-breakpoint
ALTER TABLE "statuses" DROP CONSTRAINT "statuses_photo_id_photos_id_fk";
--> statement-breakpoint
ALTER TABLE "statuses" DROP CONSTRAINT "statuses_kudde_photo_id_kudde_photos_id_fk";
--> statement-breakpoint
ALTER TABLE "status_photos" ADD CONSTRAINT "status_photos_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_photos" ADD CONSTRAINT "status_photos_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_photos" ADD CONSTRAINT "status_photos_kudde_photo_id_kudde_photos_id_fk" FOREIGN KEY ("kudde_photo_id") REFERENCES "public"."kudde_photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "status_photos_photo_idx" ON "status_photos" USING btree ("photo_id");--> statement-breakpoint
CREATE INDEX "status_photos_kudde_photo_idx" ON "status_photos" USING btree ("kudde_photo_id");--> statement-breakpoint
-- The photo every WieWatWaar had so far becomes its first (and only) one
INSERT INTO "status_photos" ("status_id", "position", "photo_id", "kudde_photo_id")
  SELECT "id", 0, "photo_id", CASE WHEN "photo_id" IS NULL THEN "kudde_photo_id" END FROM "statuses"
  WHERE "photo_id" IS NOT NULL OR "kudde_photo_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "statuses" DROP COLUMN "photo_id";--> statement-breakpoint
ALTER TABLE "statuses" DROP COLUMN "kudde_photo_id";