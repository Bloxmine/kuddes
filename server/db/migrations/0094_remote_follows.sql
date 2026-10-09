CREATE TABLE "remote_follows" (
	"follower_id" integer NOT NULL,
	"target_id" integer NOT NULL,
	"accepted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "remote_follows_follower_id_target_id_pk" PRIMARY KEY("follower_id","target_id")
);
--> statement-breakpoint
ALTER TABLE "remote_follows" ADD CONSTRAINT "remote_follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_follows" ADD CONSTRAINT "remote_follows_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "remote_follows_target_idx" ON "remote_follows" USING btree ("target_id");