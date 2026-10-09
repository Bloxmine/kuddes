CREATE TABLE "forum_poll_votes" (
	"thread_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"option" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forum_poll_votes_thread_id_user_id_pk" PRIMARY KEY("thread_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "forum_threads" ADD COLUMN "poll" jsonb;--> statement-breakpoint
ALTER TABLE "kudde_posts" ADD COLUMN "kudde_photo_id" integer;--> statement-breakpoint
ALTER TABLE "forum_poll_votes" ADD CONSTRAINT "forum_poll_votes_thread_id_forum_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."forum_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_poll_votes" ADD CONSTRAINT "forum_poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kudde_posts" ADD CONSTRAINT "kudde_posts_kudde_photo_id_kudde_photos_id_fk" FOREIGN KEY ("kudde_photo_id") REFERENCES "public"."kudde_photos"("id") ON DELETE set null ON UPDATE no action;