ALTER TYPE "public"."notification_kind" ADD VALUE 'radio';--> statement-breakpoint
CREATE TABLE "radio_djs" (
	"station_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "radio_djs_station_id_user_id_pk" PRIMARY KEY("station_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "radio_follows" (
	"station_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "radio_follows_station_id_user_id_pk" PRIMARY KEY("station_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "radio_shows" (
	"id" serial PRIMARY KEY NOT NULL,
	"station_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"playlist" integer[] DEFAULT '{}'::int[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "radio_sounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "radio_stations" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"genre" text DEFAULT 'muziekmix' NOT NULL,
	"banner_path" text,
	"banner_y" integer DEFAULT 50 NOT NULL,
	"last_live_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "radio_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "radio_djs" ADD CONSTRAINT "radio_djs_station_id_radio_stations_user_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."radio_stations"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radio_djs" ADD CONSTRAINT "radio_djs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radio_follows" ADD CONSTRAINT "radio_follows_station_id_radio_stations_user_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."radio_stations"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radio_follows" ADD CONSTRAINT "radio_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radio_shows" ADD CONSTRAINT "radio_shows_station_id_radio_stations_user_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."radio_stations"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radio_sounds" ADD CONSTRAINT "radio_sounds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radio_stations" ADD CONSTRAINT "radio_stations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "radio_djs_user_idx" ON "radio_djs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "radio_follows_user_idx" ON "radio_follows" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "radio_shows_station_idx" ON "radio_shows" USING btree ("station_id","starts_at");--> statement-breakpoint
CREATE INDEX "radio_shows_time_idx" ON "radio_shows" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "radio_sounds_user_idx" ON "radio_sounds" USING btree ("user_id","id");