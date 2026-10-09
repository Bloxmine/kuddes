CREATE TABLE "bot_warnings" (
	"id" serial PRIMARY KEY NOT NULL,
	"bot_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"reason" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"place" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bots" ADD COLUMN "moderation" jsonb DEFAULT '{"enabled":false,"words":[],"places":["wiewatwaar","knuffel","reactie","forum","kudde","foto","video","blog"],"behaviours":{"flood":{"on":true,"count":15,"minutes":5},"herhaling":{"on":true,"count":4,"minutes":10},"links":{"on":false,"count":4,"minutes":0},"hoofdletters":{"on":false,"count":0,"minutes":0},"vriendverzoeken":{"on":true,"count":30,"minutes":10}},"onWord":{"warn":true,"remove":false,"report":true},"onBehaviour":{"warn":true,"report":false},"warning":"Hoi {voornaam}, even een seintje van Kuddes: {reden} ({waar}). Houd het gezellig voor iedereen, anders kijkt de beheerder ernaar.","reportAfter":3}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "bot_warnings" ADD CONSTRAINT "bot_warnings_bot_id_users_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_warnings" ADD CONSTRAINT "bot_warnings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bot_warnings_user_idx" ON "bot_warnings" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "bot_warnings_created_idx" ON "bot_warnings" USING btree ("created_at");