CREATE TABLE "automations" (
	"id" serial PRIMARY KEY NOT NULL,
	"config" jsonb NOT NULL,
	"done" jsonb DEFAULT '{"members":[],"day":""}'::jsonb NOT NULL,
	"runs" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
