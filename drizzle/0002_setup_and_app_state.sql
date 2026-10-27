CREATE TABLE "app_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "setup_state" jsonb DEFAULT '{}'::jsonb NOT NULL;