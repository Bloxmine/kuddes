CREATE TYPE "public"."messenger_group_kind" AS ENUM('msg', 'nudge', 'created', 'joined', 'left', 'removed', 'renamed');--> statement-breakpoint
CREATE TABLE "messenger_group_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"sender_id" integer,
	"kind" "messenger_group_kind" DEFAULT 'msg' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"glitter_id" integer,
	"share" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messenger_group_members" (
	"group_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"last_read_id" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messenger_group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "messenger_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "statuses" ADD COLUMN "kudde_photo_id" integer;--> statement-breakpoint
ALTER TABLE "messenger_group_lines" ADD CONSTRAINT "messenger_group_lines_group_id_messenger_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."messenger_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messenger_group_lines" ADD CONSTRAINT "messenger_group_lines_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messenger_group_lines" ADD CONSTRAINT "messenger_group_lines_glitter_id_glitters_id_fk" FOREIGN KEY ("glitter_id") REFERENCES "public"."glitters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messenger_group_members" ADD CONSTRAINT "messenger_group_members_group_id_messenger_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."messenger_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messenger_group_members" ADD CONSTRAINT "messenger_group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messenger_groups" ADD CONSTRAINT "messenger_groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messenger_group_lines_group_idx" ON "messenger_group_lines" USING btree ("group_id","id");--> statement-breakpoint
CREATE INDEX "messenger_group_members_user_idx" ON "messenger_group_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_kudde_photo_id_kudde_photos_id_fk" FOREIGN KEY ("kudde_photo_id") REFERENCES "public"."kudde_photos"("id") ON DELETE set null ON UPDATE no action;