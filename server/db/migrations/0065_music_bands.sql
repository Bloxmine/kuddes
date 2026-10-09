-- More than one artist or band page per member: pages get their own id and a
-- slug for the address (the existing ones get the username, so old links keep
-- working), and every song points at its page.
ALTER TABLE "music_pages" DROP CONSTRAINT "music_pages_pkey";--> statement-breakpoint
ALTER TABLE "music_pages" ADD COLUMN "id" serial PRIMARY KEY NOT NULL;--> statement-breakpoint
ALTER TABLE "music_pages" ADD COLUMN "slug" text;--> statement-breakpoint
UPDATE "music_pages" mp SET "slug" = u."username" FROM "users" u WHERE u."id" = mp."user_id";--> statement-breakpoint
ALTER TABLE "music_pages" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "artist_id" integer;--> statement-breakpoint
UPDATE "tracks" t SET "artist_id" = mp."id" FROM "music_pages" mp WHERE mp."user_id" = t."user_id";--> statement-breakpoint
-- A song can only be uploaded with a page, but just in case: give its maker one
INSERT INTO "music_pages" ("user_id", "slug", "name") SELECT DISTINCT t."user_id", u."username", u."nickname" FROM "tracks" t JOIN "users" u ON u."id" = t."user_id" WHERE t."artist_id" IS NULL;--> statement-breakpoint
UPDATE "tracks" t SET "artist_id" = mp."id" FROM "music_pages" mp WHERE mp."user_id" = t."user_id" AND t."artist_id" IS NULL;--> statement-breakpoint
ALTER TABLE "tracks" ALTER COLUMN "artist_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_artist_id_music_pages_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."music_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "music_pages_slug_idx" ON "music_pages" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "music_pages_user_idx" ON "music_pages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tracks_artist_idx" ON "tracks" USING btree ("artist_id","id");
