CREATE TYPE "public"."game_player_status" AS ENUM('uitgenodigd', 'meedoen', 'geweigerd', 'weg');--> statement-breakpoint
CREATE TABLE "game_players" (
	"game_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"seat" integer NOT NULL,
	"status" "game_player_status" DEFAULT 'uitgenodigd' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"highlights" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_players_game_id_user_id_pk" PRIMARY KEY("game_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_players_seat_idx" ON "game_players" USING btree ("game_id","seat");--> statement-breakpoint
CREATE INDEX "game_players_user_idx" ON "game_players" USING btree ("user_id","status");--> statement-breakpoint
-- Everyone already in a game: the host on seat 0, the guest on seat 1
INSERT INTO "game_players" ("game_id", "user_id", "seat", "status", "score", "highlights", "created_at")
SELECT "id", "host_id", 0, 'meedoen', "host_score", "highlights"->'host', "created_at" FROM "games";--> statement-breakpoint
INSERT INTO "game_players" ("game_id", "user_id", "seat", "status", "score", "highlights", "created_at")
SELECT "id", "guest_id", 1,
  (CASE WHEN "status" = 'uitgenodigd' THEN 'uitgenodigd' WHEN "status" = 'geweigerd' THEN 'geweigerd' ELSE 'meedoen' END)::game_player_status,
  "guest_score", "highlights"->'guest', "created_at" FROM "games";
