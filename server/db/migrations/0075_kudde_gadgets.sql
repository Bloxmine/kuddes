CREATE TABLE "kudde_gadgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"kudde_id" integer NOT NULL,
	"type" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kuddes" ADD COLUMN "views" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "kudde_gadgets" ADD CONSTRAINT "kudde_gadgets_kudde_id_kuddes_id_fk" FOREIGN KEY ("kudde_id") REFERENCES "public"."kuddes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kudde_gadgets_kudde_idx" ON "kudde_gadgets" USING btree ("kudde_id","position");