-- More than one tag per glitterplaatje: the single category becomes a list,
-- and the old category is its first tag.
ALTER TABLE "glitters" ADD COLUMN "categories" text[] DEFAULT '{overig}'::text[] NOT NULL;--> statement-breakpoint
UPDATE "glitters" SET "categories" = ARRAY["category"];--> statement-breakpoint
DROP INDEX "glitters_category_idx";--> statement-breakpoint
ALTER TABLE "glitters" DROP COLUMN "category";--> statement-breakpoint
CREATE INDEX "glitters_categories_idx" ON "glitters" USING gin ("categories");
