-- Only Online, Bezig, Afwezig and Toon offline are left; move the others to the closest one
UPDATE "users" SET "online_status" = 'Bezig' WHERE "online_status" = 'Aan de telefoon';--> statement-breakpoint
UPDATE "users" SET "online_status" = 'Afwezig' WHERE "online_status" IN ('Ben zo terug', 'Lunchen');
