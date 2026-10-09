CREATE TABLE "kudde_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"kudde_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"path" text NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kudde_posts" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kuddes" ADD COLUMN "info" jsonb;--> statement-breakpoint
ALTER TABLE "kudde_photos" ADD CONSTRAINT "kudde_photos_kudde_id_kuddes_id_fk" FOREIGN KEY ("kudde_id") REFERENCES "public"."kuddes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kudde_photos" ADD CONSTRAINT "kudde_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kudde_photos_kudde_idx" ON "kudde_photos" USING btree ("kudde_id","id");--> statement-breakpoint
CREATE INDEX "kudde_photos_user_idx" ON "kudde_photos" USING btree ("user_id");