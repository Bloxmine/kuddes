ALTER TABLE "krabbels" RENAME TO "kietels";--> statement-breakpoint
ALTER TABLE "kietels" DROP CONSTRAINT "krabbels_profile_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "kietels" DROP CONSTRAINT "krabbels_author_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "krabbels_profile_idx";--> statement-breakpoint
DROP INDEX "krabbels_created_idx";--> statement-breakpoint
ALTER TABLE "kietels" ADD CONSTRAINT "kietels_profile_id_users_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kietels" ADD CONSTRAINT "kietels_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kietels_profile_idx" ON "kietels" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX "kietels_created_idx" ON "kietels" USING btree ("created_at");