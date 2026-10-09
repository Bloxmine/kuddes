CREATE TABLE "kudde_poll_votes" (
	"post_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"option" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kudde_poll_votes_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "kudde_post_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kudde_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"kudde_id" integer NOT NULL,
	"user_id" integer,
	"as_kudde" boolean DEFAULT false NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"photo_path" text,
	"poll" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kudde_poll_votes" ADD CONSTRAINT "kudde_poll_votes_post_id_kudde_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."kudde_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kudde_poll_votes" ADD CONSTRAINT "kudde_poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kudde_post_replies" ADD CONSTRAINT "kudde_post_replies_post_id_kudde_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."kudde_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kudde_post_replies" ADD CONSTRAINT "kudde_post_replies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kudde_posts" ADD CONSTRAINT "kudde_posts_kudde_id_kuddes_id_fk" FOREIGN KEY ("kudde_id") REFERENCES "public"."kuddes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kudde_posts" ADD CONSTRAINT "kudde_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kudde_post_replies_post_idx" ON "kudde_post_replies" USING btree ("post_id","id");--> statement-breakpoint
CREATE INDEX "kudde_posts_kudde_idx" ON "kudde_posts" USING btree ("kudde_id","id");--> statement-breakpoint
CREATE INDEX "kudde_posts_user_idx" ON "kudde_posts" USING btree ("user_id");