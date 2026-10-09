CREATE TABLE "gadget_pets" (
	"gadget_id" integer PRIMARY KEY NOT NULL,
	"fed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"petted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL,
	"care" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet_care" (
	"gadget_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"action" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pet_care_gadget_id_user_id_action_pk" PRIMARY KEY("gadget_id","user_id","action")
);
--> statement-breakpoint
ALTER TABLE "gadget_pets" ADD CONSTRAINT "gadget_pets_gadget_id_gadgets_id_fk" FOREIGN KEY ("gadget_id") REFERENCES "public"."gadgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_care" ADD CONSTRAINT "pet_care_gadget_id_gadgets_id_fk" FOREIGN KEY ("gadget_id") REFERENCES "public"."gadgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_care" ADD CONSTRAINT "pet_care_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pet_care_recent_idx" ON "pet_care" USING btree ("gadget_id","at");