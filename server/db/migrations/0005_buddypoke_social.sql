CREATE TYPE "public"."buddy_event_type" AS ENUM('poke', 'mood');--> statement-breakpoint
CREATE TABLE "buddy_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "buddy_event_type" NOT NULL,
	"from_id" integer NOT NULL,
	"to_id" integer,
	"action" text NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"private" boolean DEFAULT false NOT NULL,
	"hidden_by_from" boolean DEFAULT false NOT NULL,
	"hidden_by_to" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "buddy_mood_comment" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "buddy_state" text;--> statement-breakpoint
ALTER TABLE "buddy_events" ADD CONSTRAINT "buddy_events_from_id_users_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buddy_events" ADD CONSTRAINT "buddy_events_to_id_users_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buddy_events_to_idx" ON "buddy_events" USING btree ("to_id","id");--> statement-breakpoint
CREATE INDEX "buddy_events_from_idx" ON "buddy_events" USING btree ("from_id","id");