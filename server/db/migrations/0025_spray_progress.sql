CREATE TABLE "spray_progress" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"cans" text[] DEFAULT '{}'::text[] NOT NULL,
	"photos" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spray_progress" ADD CONSTRAINT "spray_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;