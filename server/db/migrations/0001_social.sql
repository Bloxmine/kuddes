CREATE TYPE "public"."blip_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."suggestion_kind" AS ENUM('suggestie', 'probleem');--> statement-breakpoint
CREATE TABLE "blip_members" (
	"blip_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" "blip_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blip_members_blip_id_user_id_pk" PRIMARY KEY("blip_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "blips" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_path" text,
	"creator_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"kind" "suggestion_kind" DEFAULT 'suggestie' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"page" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "poll_options" CASCADE;--> statement-breakpoint
DROP TABLE "poll_votes" CASCADE;--> statement-breakpoint
DROP TABLE "polls" CASCADE;--> statement-breakpoint
ALTER TABLE "blip_members" ADD CONSTRAINT "blip_members_blip_id_blips_id_fk" FOREIGN KEY ("blip_id") REFERENCES "public"."blips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blip_members" ADD CONSTRAINT "blip_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blips" ADD CONSTRAINT "blips_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blip_members_user_idx" ON "blip_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blips_slug_idx" ON "blips" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "blips_name_idx" ON "blips" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "suggestions_created_idx" ON "suggestions" USING btree ("kind","created_at");