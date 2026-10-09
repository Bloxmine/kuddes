CREATE TABLE "bejeweled_progress" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"badges" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bejeweled_progress" ADD CONSTRAINT "bejeweled_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;