CREATE TABLE "bots" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"triggers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"abilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"daily_at" text DEFAULT '12:00' NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"runs" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_bot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bots" ADD CONSTRAINT "bots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;