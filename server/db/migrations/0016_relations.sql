CREATE TYPE "public"."relation_kind" AS ENUM('beste_vriend', 'partner', 'familie');--> statement-breakpoint
CREATE TYPE "public"."relation_status" AS ENUM('pending', 'accepted');--> statement-breakpoint
CREATE TABLE "relations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"other_id" integer NOT NULL,
	"kind" "relation_kind" NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"status" "relation_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "relations_not_self" CHECK ("relations"."user_id" <> "relations"."other_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "relationship_status" text;--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_other_id_users_id_fk" FOREIGN KEY ("other_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "relations_pair_idx" ON "relations" USING btree ("user_id","other_id","kind");--> statement-breakpoint
CREATE INDEX "relations_other_idx" ON "relations" USING btree ("other_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "relations_one_partner_idx" ON "relations" USING btree ("user_id") WHERE "relations"."kind" = 'partner';