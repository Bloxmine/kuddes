CREATE TABLE "shared_design_respects" (
	"user_id" integer NOT NULL,
	"design_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_design_respects_user_id_design_id_pk" PRIMARY KEY("user_id","design_id")
);
--> statement-breakpoint
CREATE TABLE "shared_designs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"data" jsonb NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shared_design_respects" ADD CONSTRAINT "shared_design_respects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_design_respects" ADD CONSTRAINT "shared_design_respects_design_id_shared_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."shared_designs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_designs" ADD CONSTRAINT "shared_designs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shared_design_respects_design_idx" ON "shared_design_respects" USING btree ("design_id");--> statement-breakpoint
CREATE INDEX "shared_designs_kind_idx" ON "shared_designs" USING btree ("kind","id");--> statement-breakpoint
CREATE INDEX "shared_designs_user_idx" ON "shared_designs" USING btree ("user_id");