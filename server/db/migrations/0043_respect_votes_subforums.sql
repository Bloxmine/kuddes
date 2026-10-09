CREATE TABLE "kudde_post_respects" (
	"post_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kudde_post_respects_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "video_comment_votes" (
	"comment_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"vote" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_comment_votes_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id"),
	CONSTRAINT "video_comment_votes_vote" CHECK ("video_comment_votes"."vote" in (-1, 1))
);
--> statement-breakpoint
ALTER TABLE "forum_sections" ADD COLUMN "parent_id" integer;--> statement-breakpoint
ALTER TABLE "video_comments" ADD COLUMN "likes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "video_comments" ADD COLUMN "dislikes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "kudde_post_respects" ADD CONSTRAINT "kudde_post_respects_post_id_kudde_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."kudde_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kudde_post_respects" ADD CONSTRAINT "kudde_post_respects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_comment_votes" ADD CONSTRAINT "video_comment_votes_comment_id_video_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."video_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_comment_votes" ADD CONSTRAINT "video_comment_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_sections" ADD CONSTRAINT "forum_sections_parent_id_forum_sections_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."forum_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "forum_sections_parent_idx" ON "forum_sections" USING btree ("parent_id");