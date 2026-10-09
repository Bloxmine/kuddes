CREATE TABLE "actor_keys" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"inbox" text NOT NULL,
	"body" jsonb NOT NULL,
	"sender_id" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_servers" (
	"domain" text PRIMARY KEY NOT NULL,
	"policy" text DEFAULT 'normaal' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"software" text,
	"weide" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone,
	"failing_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remote_actors" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"uri" text NOT NULL,
	"inbox" text NOT NULL,
	"shared_inbox" text,
	"url" text,
	"key_id" text NOT NULL,
	"public_key" text NOT NULL,
	"weide" boolean DEFAULT false NOT NULL,
	"avatar_source" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "friendships" ADD COLUMN "ap_id" text;--> statement-breakpoint
ALTER TABLE "knuffels" ADD COLUMN "ap_id" text;--> statement-breakpoint
ALTER TABLE "statuses" ADD COLUMN "ap_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "domain" text;--> statement-breakpoint
ALTER TABLE "actor_keys" ADD CONSTRAINT "actor_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "federation_deliveries" ADD CONSTRAINT "federation_deliveries_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_actors" ADD CONSTRAINT "remote_actors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "federation_deliveries_next_idx" ON "federation_deliveries" USING btree ("next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "remote_actors_uri_idx" ON "remote_actors" USING btree ("uri");--> statement-breakpoint
CREATE INDEX "remote_actors_key_idx" ON "remote_actors" USING btree ("key_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knuffels_ap_idx" ON "knuffels" USING btree ("ap_id");--> statement-breakpoint
CREATE UNIQUE INDEX "statuses_ap_idx" ON "statuses" USING btree ("ap_id");--> statement-breakpoint
CREATE INDEX "users_domain_idx" ON "users" USING btree ("domain");