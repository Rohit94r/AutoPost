ALTER TYPE "public"."platform" ADD VALUE 'facebook';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'threads';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'youtube';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'tiktok';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'pinterest';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'reddit';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'bluesky';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'mastodon';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'telegram';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'discord';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'wordpress';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'webhook';--> statement-breakpoint
CREATE TABLE "auto_reply_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"social_account_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"trigger" text DEFAULT 'all' NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"instructions" text,
	"mode" text DEFAULT 'draft' NOT NULL,
	"daily_limit" integer DEFAULT 50 NOT NULL,
	"skip_negative" boolean DEFAULT true NOT NULL,
	"brand_profile_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"social_account_id" uuid NOT NULL,
	"published_post_id" uuid,
	"platform" "platform" NOT NULL,
	"kind" text DEFAULT 'comment' NOT NULL,
	"external_id" text NOT NULL,
	"post_external_id" text,
	"parent_external_id" text,
	"author_name" text,
	"author_handle" text,
	"author_external_id" text,
	"author_avatar_url" text,
	"text" text DEFAULT '' NOT NULL,
	"permalink" text,
	"reply_target" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_own" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"sentiment" text,
	"draft_reply" text,
	"reply_text" text,
	"reply_external_id" text,
	"replied_at" timestamp with time zone,
	"replied_by" text,
	"autopilot_rule_id" uuid,
	"autopilot_note" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "published_posts" ALTER COLUMN "job_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "published_posts" ADD COLUMN "source" text DEFAULT 'verdant' NOT NULL;--> statement-breakpoint
ALTER TABLE "published_posts" ADD COLUMN "text" text;--> statement-breakpoint
ALTER TABLE "published_posts" ADD COLUMN "thumbnail_url" text;--> statement-breakpoint
ALTER TABLE "published_posts" ADD COLUMN "last_comments_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auto_reply_rules" ADD CONSTRAINT "auto_reply_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_reply_rules" ADD CONSTRAINT "auto_reply_rules_brand_profile_id_brand_profiles_id_fk" FOREIGN KEY ("brand_profile_id") REFERENCES "public"."brand_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_reply_rules" ADD CONSTRAINT "auto_reply_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_items" ADD CONSTRAINT "engagement_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_items" ADD CONSTRAINT "engagement_items_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_items" ADD CONSTRAINT "engagement_items_published_post_id_published_posts_id_fk" FOREIGN KEY ("published_post_id") REFERENCES "public"."published_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auto_reply_rules_workspace_idx" ON "auto_reply_rules" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_items_unique" ON "engagement_items" USING btree ("social_account_id","external_id");--> statement-breakpoint
CREATE INDEX "engagement_items_inbox_idx" ON "engagement_items" USING btree ("workspace_id","status","occurred_at");--> statement-breakpoint
CREATE INDEX "engagement_items_post_idx" ON "engagement_items" USING btree ("published_post_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "published_posts_account_external_unique" ON "published_posts" USING btree ("social_account_id","external_post_id");