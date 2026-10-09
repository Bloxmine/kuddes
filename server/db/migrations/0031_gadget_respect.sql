CREATE TABLE "gadget_respect" (
	"gadget_id" integer NOT NULL,
	"item_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gadget_respect_gadget_id_item_id_user_id_pk" PRIMARY KEY("gadget_id","item_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "gadget_respect" ADD CONSTRAINT "gadget_respect_gadget_id_gadgets_id_fk" FOREIGN KEY ("gadget_id") REFERENCES "public"."gadgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gadget_respect" ADD CONSTRAINT "gadget_respect_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;