CREATE TABLE "saved_layouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "custom_theme" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_colors" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_layout" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "home_layout" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferences" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_layouts" ADD CONSTRAINT "saved_layouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_layouts_user_idx" ON "saved_layouts" USING btree ("user_id","id");