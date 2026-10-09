ALTER TABLE "users" ADD COLUMN "avatar_public" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Members who already turned it off in their preferences
UPDATE "users" SET "avatar_public" = false WHERE "preferences"->>'avatarPublic' = 'false';
