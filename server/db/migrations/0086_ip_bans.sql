CREATE TABLE "ip_bans" (
	"id" serial PRIMARY KEY NOT NULL,
	"range" text NOT NULL,
	"scope" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_ip" text;--> statement-breakpoint
CREATE INDEX "ip_bans_expires_idx" ON "ip_bans" USING btree ("expires_at");