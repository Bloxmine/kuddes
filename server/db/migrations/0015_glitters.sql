CREATE TABLE "glitter_collection" (
	"user_id" integer NOT NULL,
	"glitter_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "glitter_collection_user_id_glitter_id_pk" PRIMARY KEY("user_id","glitter_id")
);
--> statement-breakpoint
CREATE TABLE "glitters" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT 'overig' NOT NULL,
	"path" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knuffels" ADD COLUMN "glitter_id" integer;--> statement-breakpoint
ALTER TABLE "glitter_collection" ADD CONSTRAINT "glitter_collection_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glitter_collection" ADD CONSTRAINT "glitter_collection_glitter_id_glitters_id_fk" FOREIGN KEY ("glitter_id") REFERENCES "public"."glitters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glitters" ADD CONSTRAINT "glitters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "glitter_collection_glitter_idx" ON "glitter_collection" USING btree ("glitter_id");--> statement-breakpoint
CREATE INDEX "glitters_category_idx" ON "glitters" USING btree ("category","id");--> statement-breakpoint
CREATE INDEX "glitters_user_idx" ON "glitters" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "glitters_uses_idx" ON "glitters" USING btree ("uses");--> statement-breakpoint
ALTER TABLE "knuffels" ADD CONSTRAINT "knuffels_glitter_id_glitters_id_fk" FOREIGN KEY ("glitter_id") REFERENCES "public"."glitters"("id") ON DELETE set null ON UPDATE no action;