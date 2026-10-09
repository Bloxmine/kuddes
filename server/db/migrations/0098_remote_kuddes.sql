ALTER TABLE "kudde_post_replies" ADD COLUMN "ap_id" text;--> statement-breakpoint
ALTER TABLE "kudde_posts" ADD COLUMN "ap_id" text;--> statement-breakpoint
ALTER TABLE "kuddes" ADD COLUMN "remote_actor_id" integer;--> statement-breakpoint
ALTER TABLE "kuddes" ADD COLUMN "remote_domain" text;--> statement-breakpoint
ALTER TABLE "kuddes" ADD COLUMN "remote_name" text;--> statement-breakpoint
ALTER TABLE "kuddes" ADD COLUMN "remote_url" text;--> statement-breakpoint
ALTER TABLE "kuddes" ADD CONSTRAINT "kuddes_remote_actor_id_users_id_fk" FOREIGN KEY ("remote_actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kudde_post_replies_ap_idx" ON "kudde_post_replies" USING btree ("ap_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kudde_posts_ap_idx" ON "kudde_posts" USING btree ("ap_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kuddes_remote_idx" ON "kuddes" USING btree ("remote_actor_id");