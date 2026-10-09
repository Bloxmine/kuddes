CREATE TABLE "solo_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"score" integer NOT NULL,
	"won" boolean DEFAULT false NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "solo_scores" ADD CONSTRAINT "solo_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "solo_scores_kind_idx" ON "solo_scores" USING btree ("kind","score");--> statement-breakpoint
CREATE INDEX "solo_scores_user_idx" ON "solo_scores" USING btree ("user_id","kind");