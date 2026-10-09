CREATE TYPE "public"."attendance" AS ENUM('ja', 'misschien');--> statement-breakpoint
CREATE TYPE "public"."blip_visibility" AS ENUM('openbaar', 'besloten');--> statement-breakpoint
ALTER TYPE "public"."blip_role" ADD VALUE 'pending';--> statement-breakpoint
CREATE TABLE "blip_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"blip_id" integer NOT NULL,
	"creator_id" integer,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"location" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_attendees" (
	"event_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"status" "attendance" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_attendees_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "blips" ADD COLUMN "category" text DEFAULT 'groepen' NOT NULL;--> statement-breakpoint
ALTER TABLE "blips" ADD COLUMN "subcategory" text;--> statement-breakpoint
ALTER TABLE "blips" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "blips" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "blips" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "blips" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "blips" ADD COLUMN "visibility" "blip_visibility" DEFAULT 'openbaar' NOT NULL;--> statement-breakpoint
ALTER TABLE "blip_events" ADD CONSTRAINT "blip_events_blip_id_blips_id_fk" FOREIGN KEY ("blip_id") REFERENCES "public"."blips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blip_events" ADD CONSTRAINT "blip_events_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_event_id_blip_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."blip_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blip_events_starts_idx" ON "blip_events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "blip_events_blip_idx" ON "blip_events" USING btree ("blip_id","starts_at");--> statement-breakpoint
CREATE INDEX "event_attendees_user_idx" ON "event_attendees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "blips_category_idx" ON "blips" USING btree ("category");