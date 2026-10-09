CREATE TABLE "media_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"creator" text DEFAULT '' NOT NULL,
	"year" text DEFAULT '' NOT NULL,
	"genre" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"color" text NOT NULL,
	"style" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"added_by" integer,
	"reviews" integer DEFAULT 0 NOT NULL,
	"rating" real DEFAULT 0 NOT NULL,
	"last_review_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_review_respects" (
	"review_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_review_respects_review_id_user_id_pk" PRIMARY KEY("review_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "media_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"rating" real NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"respect" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_review_respects" ADD CONSTRAINT "media_review_respects_review_id_media_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."media_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_review_respects" ADD CONSTRAINT "media_review_respects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_reviews" ADD CONSTRAINT "media_reviews_item_id_media_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_reviews" ADD CONSTRAINT "media_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_items_unique_idx" ON "media_items" USING btree ("kind",lower("title"),lower("creator"));--> statement-breakpoint
CREATE INDEX "media_items_kind_idx" ON "media_items" USING btree ("kind","last_review_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_reviews_one_idx" ON "media_reviews" USING btree ("item_id","user_id");--> statement-breakpoint
CREATE INDEX "media_reviews_recent_idx" ON "media_reviews" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "media_reviews_user_idx" ON "media_reviews" USING btree ("user_id","id");