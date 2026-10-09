CREATE TYPE "public"."chat_kind" AS ENUM('msg', 'me', 'join', 'part', 'topic', 'kick', 'system');--> statement-breakpoint
CREATE TYPE "public"."forum_role" AS ENUM('admin', 'moderator');--> statement-breakpoint
CREATE TABLE "chat_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"topic" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" integer NOT NULL,
	"user_id" integer,
	"kind" "chat_kind" DEFAULT 'msg' NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_bans" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"banned_by_id" integer,
	"until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_moderators" (
	"section_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_moderators_section_id_user_id_pk" PRIMARY KEY("section_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "forum_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"thread_id" integer NOT NULL,
	"user_id" integer,
	"body" text NOT NULL,
	"edited_at" timestamp with time zone,
	"edited_by_id" integer,
	"deleted_at" timestamp with time zone,
	"deleted_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_profile_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_user_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_profiles" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"signature" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_reactions" (
	"post_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"reaction" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_reactions_post_id_user_id_reaction_pk" PRIMARY KEY("post_id","user_id","reaction")
);
--> statement-breakpoint
CREATE TABLE "forum_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT 'comment' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"staff_only" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"section_id" integer NOT NULL,
	"user_id" integer,
	"title" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"post_count" integer DEFAULT 0 NOT NULL,
	"last_post_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_post_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "forum_role" "forum_role";--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_bans" ADD CONSTRAINT "forum_bans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_bans" ADD CONSTRAINT "forum_bans_banned_by_id_users_id_fk" FOREIGN KEY ("banned_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_moderators" ADD CONSTRAINT "forum_moderators_section_id_forum_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."forum_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_moderators" ADD CONSTRAINT "forum_moderators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_thread_id_forum_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."forum_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_edited_by_id_users_id_fk" FOREIGN KEY ("edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_deleted_by_id_users_id_fk" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_profile_comments" ADD CONSTRAINT "forum_profile_comments_profile_user_id_users_id_fk" FOREIGN KEY ("profile_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_profile_comments" ADD CONSTRAINT "forum_profile_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_profiles" ADD CONSTRAINT "forum_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_reactions" ADD CONSTRAINT "forum_reactions_post_id_forum_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."forum_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_reactions" ADD CONSTRAINT "forum_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_section_id_forum_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."forum_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_last_post_user_id_users_id_fk" FOREIGN KEY ("last_post_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_channels_name_idx" ON "chat_channels" USING btree ("name");--> statement-breakpoint
CREATE INDEX "chat_messages_channel_idx" ON "chat_messages" USING btree ("channel_id","id");--> statement-breakpoint
CREATE INDEX "forum_posts_thread_idx" ON "forum_posts" USING btree ("thread_id","id");--> statement-breakpoint
CREATE INDEX "forum_posts_user_idx" ON "forum_posts" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "forum_profile_comments_idx" ON "forum_profile_comments" USING btree ("profile_user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "forum_sections_slug_idx" ON "forum_sections" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "forum_threads_section_idx" ON "forum_threads" USING btree ("section_id","pinned","last_post_at");--> statement-breakpoint
CREATE INDEX "forum_threads_user_idx" ON "forum_threads" USING btree ("user_id");--> statement-breakpoint
-- Starting sections, grouped under categories
INSERT INTO "forum_sections" ("slug", "category", "name", "description", "icon", "position", "staff_only") VALUES
  ('mededelingen', 'Algemeen', 'Mededelingen', 'Nieuws van het Kuddes-team.', 'newspaper', 1, true),
  ('voorstellen', 'Algemeen', 'Voorstellen', 'Nieuw hier? Vertel wie je bent!', 'group', 2, false),
  ('algemeen', 'Algemeen', 'Algemene discussie', 'Over alles en nog wat.', 'comment', 3, false),
  ('muziek', 'Vrije tijd', 'Muziek', 'Bands, albums, festivals en je favoriete nummers.', 'music', 10, false),
  ('games', 'Vrije tijd', 'Games', 'Van Habbo tot de nieuwste consoles.', 'controller', 11, false),
  ('films-series', 'Vrije tijd', 'Films & series', 'Wat kijk jij?', 'film', 12, false),
  ('sport', 'Vrije tijd', 'Sport', 'Voetbal, schaatsen en alles wat beweegt.', 'sport_soccer', 13, false),
  ('suggesties', 'Kuddes', 'Suggesties & feedback', 'Ideeën om Kuddes beter te maken.', 'lightbulb', 20, false),
  ('hulp', 'Kuddes', 'Hulp & vragen', 'Kom je er niet uit? Vraag het hier.', 'help', 21, false);--> statement-breakpoint
INSERT INTO "chat_channels" ("name", "topic", "position") VALUES
  ('algemeen', 'Welkom in de Kuddes-chat! Wees aardig voor elkaar.', 1),
  ('muziek', 'Wat luister je nu?', 2),
  ('games', 'Gamen, gamen, gamen', 3),
  ('offtopic', 'Alles mag (bijna)', 4);--> statement-breakpoint
-- Hein runs the forum
UPDATE "users" SET "forum_role" = 'admin' WHERE "username" = 'hein';
