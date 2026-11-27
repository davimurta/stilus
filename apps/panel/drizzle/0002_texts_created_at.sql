ALTER TABLE "texts" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
-- Existing texts are not "new": use their last update as creation time.
UPDATE "texts" SET "created_at" = "updated_at";
