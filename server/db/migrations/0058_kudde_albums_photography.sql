CREATE TABLE "kudde_photo_albums" (
	"id" serial PRIMARY KEY NOT NULL,
	"kudde_id" integer NOT NULL,
	"created_by" integer,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kudde_photos" ADD COLUMN "album_id" integer;--> statement-breakpoint
ALTER TABLE "kudde_photos" ADD COLUMN "exif" jsonb;--> statement-breakpoint
ALTER TABLE "kudde_photos" ADD COLUMN "show_exif" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "kuddes" ADD COLUMN "photography" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "kudde_photo_albums" ADD CONSTRAINT "kudde_photo_albums_kudde_id_kuddes_id_fk" FOREIGN KEY ("kudde_id") REFERENCES "public"."kuddes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kudde_photo_albums" ADD CONSTRAINT "kudde_photo_albums_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kudde_photo_albums_kudde_idx" ON "kudde_photo_albums" USING btree ("kudde_id");--> statement-breakpoint
ALTER TABLE "kudde_photos" ADD CONSTRAINT "kudde_photos_album_id_kudde_photo_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."kudde_photo_albums"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kudde_photos_album_idx" ON "kudde_photos" USING btree ("album_id");