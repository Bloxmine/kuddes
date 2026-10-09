CREATE TABLE "news_respects" (
	"news_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_respects_news_id_user_id_pk" PRIMARY KEY("news_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN "banner_path" text;--> statement-breakpoint
ALTER TABLE "news_respects" ADD CONSTRAINT "news_respects_news_id_news_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_respects" ADD CONSTRAINT "news_respects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;