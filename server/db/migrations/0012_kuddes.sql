-- Blieprr is now Kuddes: Blips are "kuddes", kietels are "knuffels".
-- Everything is renamed in place, so no data is lost.
ALTER TYPE "public"."blip_role" RENAME TO "kudde_role";--> statement-breakpoint
ALTER TYPE "public"."blip_visibility" RENAME TO "kudde_visibility";--> statement-breakpoint
ALTER TYPE "public"."activity_type" RENAME VALUE 'kietel' TO 'knuffel';--> statement-breakpoint
ALTER TYPE "public"."activity_type" RENAME VALUE 'blip_join' TO 'kudde_join';--> statement-breakpoint

ALTER TABLE "blips" RENAME TO "kuddes";--> statement-breakpoint
ALTER TABLE "blip_members" RENAME TO "kudde_members";--> statement-breakpoint
ALTER TABLE "blip_events" RENAME TO "kudde_events";--> statement-breakpoint
ALTER TABLE "kietels" RENAME TO "knuffels";--> statement-breakpoint
ALTER TABLE "kudde_members" RENAME COLUMN "blip_id" TO "kudde_id";--> statement-breakpoint
ALTER TABLE "kudde_events" RENAME COLUMN "blip_id" TO "kudde_id";--> statement-breakpoint
ALTER TABLE "activities" RENAME COLUMN "blip_id" TO "kudde_id";--> statement-breakpoint
ALTER TABLE "activities" RENAME COLUMN "kietel_id" TO "knuffel_id";--> statement-breakpoint

ALTER SEQUENCE IF EXISTS "blips_id_seq" RENAME TO "kuddes_id_seq";--> statement-breakpoint
ALTER SEQUENCE IF EXISTS "blip_events_id_seq" RENAME TO "kudde_events_id_seq";--> statement-breakpoint
ALTER SEQUENCE IF EXISTS "krabbels_id_seq" RENAME TO "knuffels_id_seq";--> statement-breakpoint
ALTER SEQUENCE IF EXISTS "kietels_id_seq" RENAME TO "knuffels_id_seq";--> statement-breakpoint

ALTER TABLE "kuddes" RENAME CONSTRAINT "blips_pkey" TO "kuddes_pkey";--> statement-breakpoint
ALTER TABLE "kudde_events" RENAME CONSTRAINT "blip_events_pkey" TO "kudde_events_pkey";--> statement-breakpoint
ALTER TABLE "knuffels" RENAME CONSTRAINT "krabbels_pkey" TO "knuffels_pkey";--> statement-breakpoint
ALTER TABLE "kuddes" RENAME CONSTRAINT "blips_creator_id_users_id_fk" TO "kuddes_creator_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "kudde_members" RENAME CONSTRAINT "blip_members_blip_id_blips_id_fk" TO "kudde_members_kudde_id_kuddes_id_fk";--> statement-breakpoint
ALTER TABLE "kudde_members" RENAME CONSTRAINT "blip_members_user_id_users_id_fk" TO "kudde_members_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "kudde_members" RENAME CONSTRAINT "blip_members_blip_id_user_id_pk" TO "kudde_members_kudde_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "kudde_events" RENAME CONSTRAINT "blip_events_blip_id_blips_id_fk" TO "kudde_events_kudde_id_kuddes_id_fk";--> statement-breakpoint
ALTER TABLE "kudde_events" RENAME CONSTRAINT "blip_events_creator_id_users_id_fk" TO "kudde_events_creator_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "knuffels" RENAME CONSTRAINT "kietels_profile_id_users_id_fk" TO "knuffels_profile_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "knuffels" RENAME CONSTRAINT "kietels_author_id_users_id_fk" TO "knuffels_author_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "activities" RENAME CONSTRAINT "activities_blip_id_blips_id_fk" TO "activities_kudde_id_kuddes_id_fk";--> statement-breakpoint
ALTER TABLE "activities" RENAME CONSTRAINT "activities_kietel_id_kietels_id_fk" TO "activities_knuffel_id_knuffels_id_fk";--> statement-breakpoint
ALTER TABLE "event_attendees" RENAME CONSTRAINT "event_attendees_event_id_blip_events_id_fk" TO "event_attendees_event_id_kudde_events_id_fk";--> statement-breakpoint

ALTER INDEX "blips_slug_idx" RENAME TO "kuddes_slug_idx";--> statement-breakpoint
ALTER INDEX "blips_name_idx" RENAME TO "kuddes_name_idx";--> statement-breakpoint
ALTER INDEX "blips_category_idx" RENAME TO "kuddes_category_idx";--> statement-breakpoint
ALTER INDEX "blip_members_user_idx" RENAME TO "kudde_members_user_idx";--> statement-breakpoint
ALTER INDEX "blip_events_starts_idx" RENAME TO "kudde_events_starts_idx";--> statement-breakpoint
ALTER INDEX "blip_events_blip_idx" RENAME TO "kudde_events_kudde_idx";--> statement-breakpoint
ALTER INDEX "kietels_profile_idx" RENAME TO "knuffels_profile_idx";--> statement-breakpoint
ALTER INDEX "kietels_created_idx" RENAME TO "knuffels_created_idx";--> statement-breakpoint

-- Kudde pictures moved from uploads/blips/ to uploads/kuddes/
UPDATE "kuddes" SET "image_path" = replace("image_path", 'blips/', 'kuddes/') WHERE "image_path" LIKE 'blips/%';--> statement-breakpoint

-- Box names in saved layouts: "kietels" -> "knuffels", "blips" -> "kuddes"
UPDATE "users" SET "profile_layout" = replace(replace("profile_layout"::text, '"kietels"', '"knuffels"'), '"blips"', '"kuddes"')::jsonb WHERE "profile_layout" IS NOT NULL;--> statement-breakpoint
UPDATE "users" SET "home_layout" = replace("home_layout"::text, '"blips"', '"kuddes"')::jsonb WHERE "home_layout" IS NOT NULL;--> statement-breakpoint
UPDATE "saved_layouts" SET "data" = replace(replace("data"::text, '"kietels"', '"knuffels"'), '"blips"', '"kuddes"')::jsonb;--> statement-breakpoint
UPDATE "users" SET "preferences" = ("preferences" - 'kietelsFrom') || jsonb_build_object('knuffelsFrom', "preferences"->'kietelsFrom') WHERE "preferences" ? 'kietelsFrom';--> statement-breakpoint
UPDATE "gadgets" SET "type" = 'kuddesvideo' WHERE "type" = 'blipvideo';--> statement-breakpoint

-- Themes: the Blieprr teal is gone (Blauwe lucht is the default now), Paars became Zuurstokroze
UPDATE "users" SET "theme" = NULL WHERE "theme" = 'blieprr';--> statement-breakpoint
UPDATE "users" SET "theme" = 'roze' WHERE "theme" = 'paars';--> statement-breakpoint
UPDATE "saved_layouts" SET "data" = jsonb_set("data", '{theme}', 'null'::jsonb) WHERE "data"->>'theme' = 'blieprr';--> statement-breakpoint
UPDATE "saved_layouts" SET "data" = jsonb_set("data", '{theme}', '"roze"'::jsonb) WHERE "data"->>'theme' = 'paars';--> statement-breakpoint

-- The starting forum and chat texts
UPDATE "forum_sections" SET "category" = 'Kuddes' WHERE "category" = 'Blieprr';--> statement-breakpoint
UPDATE "forum_sections" SET "description" = replace("description", 'Blieprr', 'Kuddes') WHERE "description" LIKE '%Blieprr%';--> statement-breakpoint
UPDATE "chat_channels" SET "topic" = replace("topic", 'Blieprr', 'Kuddes') WHERE "topic" LIKE '%Blieprr%';
