CREATE TABLE "admin_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer,
	"action" text NOT NULL,
	"target" text DEFAULT '' NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"label" text DEFAULT 'Nieuws & updates' NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"author_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "handled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "blocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "block_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_dummy" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_log" ADD CONSTRAINT "admin_log_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news" ADD CONSTRAINT "news_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_log_created_idx" ON "admin_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "news_slug_idx" ON "news" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "news_published_idx" ON "news" USING btree ("published","published_at");--> statement-breakpoint
-- The news that used to live in server/content.ts
INSERT INTO "news" ("slug", "label", "title", "summary", "body", "published_at") VALUES
  ('welkom-bij-kuddes', 'Nieuws & updates', 'Welkom bij Kuddes!', 'Het gezelligste vriendennetwerk van Nederland is open. Maak je profiel, knuffel je vrienden en pimp je pagina.',
   E'Kuddes is een vriendennetwerk zoals we het vroeger kenden: een eigen profiel, knuffels van je vrienden en laten weten wat je aan het doen bent.\n\nMaak je profiel compleet, zoek je vrienden op en laat een knuffel achter. Je kunt je profiel ook helemaal pimpen met een eigen design.',
   '2026-09-25 12:00+02'),
  ('kuddes-zijn-er', 'Nieuw', 'Kuddes: jouw eigen groep', 'Start een Kudde over je school, club, hobby of favoriete game en nodig je vrienden uit.',
   E'Met Kuddes maak je een groep rond alles wat je leuk vindt. Geef je Kudde een naam, een omschrijving en een mooie afbeelding.\n\nIedereen kan lid worden van een Kudde. De populairste Kuddes staan op de homepage.',
   '2026-09-25 11:00+02'),
  ('pimp-je-profiel', 'Tip', 'Pimp je profiel met een eigen design', 'Kies onder Instellingen een design voor je profiel: Pink Glitter, Oranje Boven, Dark Symphony en meer.',
   E'Ga naar Instellingen en kies bij "Pimp je profiel" een design. Bezoekers zien je profiel dan in jouw stijl.\n\nVind je het toch te veel? Bezoekers kunnen altijd op "Toon in standaard design" klikken.',
   '2026-09-25 10:00+02')
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Hein is the one and only admin
UPDATE "users" SET "forum_role" = NULL WHERE "forum_role" = 'admin' AND "username" <> 'hein';--> statement-breakpoint
UPDATE "users" SET "forum_role" = 'admin' WHERE "username" = 'hein';
