-- The online statuses in Dutch: "Away" became "Afwezig", "Toon Offline" became "Toon offline"
UPDATE "users" SET "online_status" = 'Afwezig' WHERE "online_status" = 'Away';--> statement-breakpoint
UPDATE "users" SET "online_status" = 'Toon offline' WHERE "online_status" = 'Toon Offline';
