CREATE TYPE "public"."messenger_kind" AS ENUM('msg', 'nudge', 'invite', 'game');--> statement-breakpoint
CREATE TABLE "messenger_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"sender_id" integer NOT NULL,
	"recipient_id" integer NOT NULL,
	"kind" "messenger_kind" DEFAULT 'msg' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"game_id" integer,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "messenger_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "messenger_lines" ADD CONSTRAINT "messenger_lines_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messenger_lines" ADD CONSTRAINT "messenger_lines_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messenger_lines" ADD CONSTRAINT "messenger_lines_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messenger_lines_pair_idx" ON "messenger_lines" USING btree (least("sender_id", "recipient_id"),greatest("sender_id", "recipient_id"),"id");--> statement-breakpoint
CREATE INDEX "messenger_lines_unread_idx" ON "messenger_lines" USING btree ("recipient_id","read_at");