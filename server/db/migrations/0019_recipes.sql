ALTER TYPE "public"."activity_type" ADD VALUE 'recipe';--> statement-breakpoint
CREATE TABLE "recipe_likes" (
	"user_id" integer NOT NULL,
	"recipe_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_likes_user_id_recipe_id_pk" PRIMARY KEY("user_id","recipe_id")
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"intro" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'overig' NOT NULL,
	"level" text DEFAULT 'makkelijk' NOT NULL,
	"minutes" integer NOT NULL,
	"servings" integer NOT NULL,
	"photo_path" text,
	"ingredients" jsonb NOT NULL,
	"steps" jsonb NOT NULL,
	"tips" text DEFAULT '' NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "recipe_id" integer;--> statement-breakpoint
ALTER TABLE "recipe_likes" ADD CONSTRAINT "recipe_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_likes" ADD CONSTRAINT "recipe_likes_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_likes_recipe_idx" ON "recipe_likes" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "recipes_category_idx" ON "recipes" USING btree ("category","id");--> statement-breakpoint
CREATE INDEX "recipes_user_idx" ON "recipes" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "recipes_likes_idx" ON "recipes" USING btree ("likes");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;