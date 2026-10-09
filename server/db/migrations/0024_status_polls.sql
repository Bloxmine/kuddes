CREATE TABLE "status_poll_votes" (
	"status_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"option" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "status_poll_votes_status_id_user_id_pk" PRIMARY KEY("status_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "statuses" ADD COLUMN "poll" jsonb;--> statement-breakpoint
ALTER TABLE "status_poll_votes" ADD CONSTRAINT "status_poll_votes_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_poll_votes" ADD CONSTRAINT "status_poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;