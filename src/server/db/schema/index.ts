import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { PLATFORMS } from "../../../lib/platforms";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const bytea = customType<{ data: Buffer; driverData: Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (v) => Buffer.from(v),
});
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ───────────────────────────── Enums ───────────────────────────── */

export const platformEnum = pgEnum("platform", PLATFORMS);
export const memberRoleEnum = pgEnum("member_role", ["owner", "admin", "editor", "viewer"]);
export const socialAccountStatusEnum = pgEnum("social_account_status", [
  "connected",
  "expired",
  "permission_required",
  "disconnected",
  "error",
]);
export const contentStatusEnum = pgEnum("content_status", [
  "draft",
  "scheduled",
  "publishing",
  "published",
  "partially_published",
  "failed",
  "cancelled",
  "archived",
]);
export const publishingStatusEnum = pgEnum("publishing_status", [
  "draft",
  "queued",
  "scheduled",
  "processing",
  "published",
  "failed",
  "cancelled",
  "needs_reconnection",
]);
export const attemptOutcomeEnum = pgEnum("attempt_outcome", [
  "success",
  "retryable_error",
  "permanent_error",
  "auth_error",
  "interrupted",
]);
export const mediaKindEnum = pgEnum("media_kind", ["image", "video"]);
export const documentStatusEnum = pgEnum("document_status", [
  "uploaded",
  "processing",
  "extracted",
  "reviewed",
  "failed",
]);
export const metricAvailabilityEnum = pgEnum("metric_availability", [
  "available",
  "unsupported",
  "permission_missing",
  "unavailable",
]);
export const usageMetricEnum = pgEnum("usage_metric", [
  "ai_request",
  "ai_tokens",
  "document_processed",
  "storage_bytes",
  "publishing_job",
]);

/* ─────────────────────── Auth (better-auth) ─────────────────────── */

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  timezone: text("timezone").notNull().default("UTC"),
  onboardingCompletedAt: ts("onboarding_completed_at"),
  /** "Get started" guide: steps the user skipped, and whether they hid the guide. */
  setupState: jsonb("setup_state").$type<{ skipped?: string[]; hiddenAt?: string }>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Sign-in identities (password, Google). Distinct from social publishing accounts. */
export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("auth_accounts_user_idx").on(t.userId)],
);

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ─────────────────────────── Workspaces ─────────────────────────── */

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("UTC"),
  plan: text("plan").notNull().default("free"),
  documentRetentionDays: integer("document_retention_days").notNull().default(30),
  aiProcessingConsentAt: ts("ai_processing_consent_at"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("editor"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("workspace_members_unique").on(t.workspaceId, t.userId), index("workspace_members_user_idx").on(t.userId)],
);

export const brandProfiles = pgTable(
  "brand_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    audience: text("audience"),
    industry: text("industry"),
    tone: text("tone").notNull().default("conversational"),
    writingStyle: text("writing_style"),
    language: text("language").notNull().default("English"),
    perspective: text("perspective").notNull().default("first_person"),
    formality: text("formality").notNull().default("neutral"),
    vocabulary: text("vocabulary").array().notNull().default(sql`'{}'::text[]`),
    avoidPhrases: text("avoid_phrases").array().notNull().default(sql`'{}'::text[]`),
    preferredCtas: text("preferred_ctas").array().notNull().default(sql`'{}'::text[]`),
    hashtagPreference: text("hashtag_preference").notNull().default("minimal"),
    emojiPreference: text("emoji_preference").notNull().default("minimal"),
    examplePosts: text("example_posts").array().notNull().default(sql`'{}'::text[]`),
    derivedStyle: jsonb("derived_style").$type<DerivedStyle | null>(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("brand_profiles_workspace_idx").on(t.workspaceId)],
);

export interface DerivedStyle {
  summary: string;
  sentenceLength: string;
  traits: string[];
  signaturePhrases: string[];
  avoid: string[];
  derivedAt: string;
}

/* ───────────────────────── Social accounts ───────────────────────── */

export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    externalAccountId: text("external_account_id").notNull(),
    accountType: text("account_type").notNull().default("member"),
    displayName: text("display_name").notNull(),
    username: text("username"),
    avatarUrl: text("avatar_url"),
    status: socialAccountStatusEnum("status").notNull().default("connected"),
    grantedScopes: text("granted_scopes").array().notNull().default(sql`'{}'::text[]`),
    tokenExpiresAt: ts("token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    lastRefreshedAt: ts("last_refreshed_at"),
    lastError: text("last_error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    connectedBy: text("connected_by").references(() => users.id, { onDelete: "set null" }),
    disconnectedAt: ts("disconnected_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("social_accounts_unique").on(t.workspaceId, t.platform, t.externalAccountId),
    index("social_accounts_expiry_idx").on(t.status, t.tokenExpiresAt),
  ],
);

/** Encrypted (AES-256-GCM) tokens. Never selected by code paths that serialize to the browser. */
export const oauthCredentials = pgTable("encrypted_oauth_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  socialAccountId: uuid("social_account_id")
    .notNull()
    .unique()
    .references(() => socialAccounts.id, { onDelete: "cascade" }),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Single-use OAuth state for CSRF protection and PKCE verifier storage. */
export const oauthStates = pgTable(
  "oauth_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stateHash: text("state_hash").notNull().unique(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    codeVerifierEnc: text("code_verifier_enc"),
    returnTo: text("return_to"),
    expiresAt: ts("expires_at").notNull(),
    consumedAt: ts("consumed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("oauth_states_expiry_idx").on(t.expiresAt)],
);

/* ───────────────────────────── Media ───────────────────────────── */

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    uploadedBy: text("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    kind: mediaKindEnum("kind").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    width: integer("width"),
    height: integer("height"),
    durationSeconds: integer("duration_seconds"),
    storageKey: text("storage_key").notNull(),
    thumbnailKey: text("thumbnail_key"),
    originalFilename: text("original_filename").notNull(),
    sha256: text("sha256").notNull(),
    altText: text("alt_text"),
    createdAt: createdAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("media_assets_workspace_idx").on(t.workspaceId, t.createdAt)],
);

/* ─────────────────────────── Documents ─────────────────────────── */

export const uploadedDocuments = pgTable(
  "uploaded_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    uploadedBy: text("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    storageKey: text("storage_key"),
    pageCount: integer("page_count"),
    status: documentStatusEnum("status").notNull().default("uploaded"),
    error: text("error"),
    aiProvider: text("ai_provider"),
    providerConsentAt: ts("provider_consent_at"),
    fileDeletedAt: ts("file_deleted_at"),
    expiresAt: ts("expires_at"),
    correlationId: text("correlation_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("uploaded_documents_workspace_idx").on(t.workspaceId, t.createdAt), index("uploaded_documents_expiry_idx").on(t.expiresAt)],
);

export interface ExtractedField {
  key: string;
  label: string;
  value: string;
  confidence: "high" | "medium" | "low";
  evidence?: string | null;
  page?: number | null;
  source: "document" | "user";
}

export const documentExtractions = pgTable(
  "document_extractions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => uploadedDocuments.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    documentType: text("document_type").notNull(),
    method: text("method").notNull(),
    extractedText: text("extracted_text").notNull().default(""),
    summary: text("summary"),
    fields: jsonb("fields").$type<ExtractedField[]>().notNull().default([]),
    missingFields: jsonb("missing_fields").$type<string[]>().notNull().default([]),
    warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
    reviewedFields: jsonb("reviewed_fields").$type<ExtractedField[] | null>(),
    userClaims: text("user_claims"),
    provider: text("provider"),
    model: text("model"),
    reviewedAt: ts("reviewed_at"),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("document_extractions_document_idx").on(t.documentId, t.createdAt)],
);

/* ──────────────────────────── Content ──────────────────────────── */

export const contentItems = pgTable(
  "content_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull().default("Untitled post"),
    body: text("body").notNull().default(""),
    linkUrl: text("link_url"),
    hashtags: text("hashtags").array().notNull().default(sql`'{}'::text[]`),
    callToAction: text("call_to_action"),
    status: contentStatusEnum("status").notNull().default("draft"),
    brandProfileId: uuid("brand_profile_id").references(() => brandProfiles.id, { onDelete: "set null" }),
    sourceDocumentId: uuid("source_document_id").references(() => uploadedDocuments.id, { onDelete: "set null" }),
    campaign: text("campaign"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    isTemplate: boolean("is_template").notNull().default(false),
    scheduledAt: ts("scheduled_at"),
    timezone: text("timezone"),
    archivedAt: ts("archived_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("content_items_workspace_status_idx").on(t.workspaceId, t.status, t.updatedAt),
    index("content_items_workspace_updated_idx").on(t.workspaceId, t.updatedAt),
  ],
);

export const contentMedia = pgTable(
  "content_media",
  {
    contentId: uuid("content_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.contentId, t.mediaId] })],
);

export const contentVariants = pgTable(
  "content_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentId: uuid("content_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    body: text("body").notNull().default(""),
    hashtags: text("hashtags").array().notNull().default(sql`'{}'::text[]`),
    includeMedia: boolean("include_media").notNull().default(true),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("content_variants_unique").on(t.contentId, t.platform)],
);

/* ────────────────────────── AI generations ────────────────────────── */

export const aiGenerations = pgTable(
  "ai_generation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    task: text("task").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    status: text("status").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms"),
    providerRequestId: text("provider_request_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    correlationId: text("correlation_id"),
    contentId: uuid("content_id").references(() => contentItems.id, { onDelete: "set null" }),
    documentId: uuid("document_id").references(() => uploadedDocuments.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("ai_generations_workspace_idx").on(t.workspaceId, t.createdAt)],
);

/* ─────────────────────────── Publishing ─────────────────────────── */

export interface PayloadSnapshot {
  text: string;
  mediaIds: string[];
  linkUrl?: string | null;
}

export const publishingJobs = pgTable(
  "publishing_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    contentId: uuid("content_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => contentVariants.id, { onDelete: "cascade" }),
    socialAccountId: uuid("social_account_id")
      .notNull()
      .references(() => socialAccounts.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    scheduledAt: ts("scheduled_at").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    status: publishingStatusEnum("status").notNull().default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextRetryAt: ts("next_retry_at"),
    lockedAt: ts("locked_at"),
    lockedBy: text("locked_by"),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    cancelledAt: ts("cancelled_at"),
    externalPostId: text("external_post_id"),
    publishedUrl: text("published_url"),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    correlationId: text("correlation_id").notNull(),
    payloadSnapshot: jsonb("payload_snapshot").$type<PayloadSnapshot | null>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // One active (or successful) job per variant/destination: blocks double-click duplicates and
    // accidental republishing. Failed/cancelled jobs don't count, so a safe retry can create a new one.
    uniqueIndex("publishing_jobs_active_unique")
      .on(t.variantId, t.socialAccountId)
      .where(sql`status in ('queued','scheduled','processing','published')`),
    index("publishing_jobs_due_idx").on(t.status, t.scheduledAt),
    index("publishing_jobs_workspace_idx").on(t.workspaceId, t.scheduledAt),
    index("publishing_jobs_content_idx").on(t.contentId),
  ],
);

export const publishingAttempts = pgTable(
  "publishing_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => publishingJobs.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
    outcome: attemptOutcomeEnum("outcome"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    httpStatus: integer("http_status"),
    platformRequestId: text("platform_request_id"),
    durationMs: integer("duration_ms"),
  },
  (t) => [uniqueIndex("publishing_attempts_unique").on(t.jobId, t.attemptNumber)],
);

/**
 * Every post we know about on a connected account: published through Verdant (`source=verdant`,
 * linked to a job) or imported from the platform (`source=imported`) so comments and metrics can
 * be shown for the whole account, not just posts created here.
 */
export const publishedPosts = pgTable(
  "published_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .unique()
      .references(() => publishingJobs.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contentId: uuid("content_id").references(() => contentItems.id, { onDelete: "set null" }),
    socialAccountId: uuid("social_account_id")
      .notNull()
      .references(() => socialAccounts.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    externalPostId: text("external_post_id").notNull(),
    url: text("url"),
    source: text("source").notNull().default("verdant"),
    text: text("text"),
    thumbnailUrl: text("thumbnail_url"),
    publishedAt: ts("published_at").notNull(),
    lastMetricsAt: ts("last_metrics_at"),
    lastCommentsAt: ts("last_comments_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("published_posts_workspace_idx").on(t.workspaceId, t.publishedAt),
    uniqueIndex("published_posts_account_external_unique").on(t.socialAccountId, t.externalPostId),
  ],
);

/* ───────────────────────── Engagement (inbox) ───────────────────────── */

export interface ReplyTarget {
  /** Platform-specific identifiers needed to reply (e.g. Bluesky uri+cid of root/parent). */
  [key: string]: string | undefined;
}

/** Comments, replies and mentions received on connected accounts. */
export const engagementItems = pgTable(
  "engagement_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    socialAccountId: uuid("social_account_id")
      .notNull()
      .references(() => socialAccounts.id, { onDelete: "cascade" }),
    publishedPostId: uuid("published_post_id").references(() => publishedPosts.id, { onDelete: "set null" }),
    platform: platformEnum("platform").notNull(),
    kind: text("kind").notNull().default("comment"),
    externalId: text("external_id").notNull(),
    postExternalId: text("post_external_id"),
    parentExternalId: text("parent_external_id"),
    authorName: text("author_name"),
    authorHandle: text("author_handle"),
    authorExternalId: text("author_external_id"),
    authorAvatarUrl: text("author_avatar_url"),
    text: text("text").notNull().default(""),
    permalink: text("permalink"),
    replyTarget: jsonb("reply_target").$type<ReplyTarget>().notNull().default({}),
    isOwn: boolean("is_own").notNull().default(false),
    status: text("status").notNull().default("new"),
    sentiment: text("sentiment"),
    draftReply: text("draft_reply"),
    replyText: text("reply_text"),
    replyExternalId: text("reply_external_id"),
    repliedAt: ts("replied_at"),
    repliedBy: text("replied_by"),
    autopilotRuleId: uuid("autopilot_rule_id"),
    autopilotNote: text("autopilot_note"),
    occurredAt: ts("occurred_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("engagement_items_unique").on(t.socialAccountId, t.externalId),
    index("engagement_items_inbox_idx").on(t.workspaceId, t.status, t.occurredAt),
    index("engagement_items_post_idx").on(t.publishedPostId, t.occurredAt),
  ],
);

/** Autopilot rules: when to answer comments/mentions automatically (or draft for approval). */
export const autoReplyRules = pgTable(
  "auto_reply_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    /** Empty = all connected accounts that support replies. */
    socialAccountIds: uuid("social_account_ids").array().notNull().default(sql`'{}'::uuid[]`),
    trigger: text("trigger").notNull().default("all"),
    keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
    instructions: text("instructions"),
    mode: text("mode").notNull().default("draft"),
    dailyLimit: integer("daily_limit").notNull().default(50),
    skipNegative: boolean("skip_negative").notNull().default(true),
    brandProfileId: uuid("brand_profile_id").references(() => brandProfiles.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("auto_reply_rules_workspace_idx").on(t.workspaceId)],
);

export const postAnalytics = pgTable(
  "post_analytics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publishedPostId: uuid("published_post_id")
      .notNull()
      .references(() => publishedPosts.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    metric: text("metric").notNull(),
    value: bigint("value", { mode: "number" }),
    availability: metricAvailabilityEnum("availability").notNull(),
    source: text("source").notNull().default("platform_api"),
    note: text("note"),
    collectedAt: ts("collected_at").notNull().defaultNow(),
  },
  (t) => [
    index("post_analytics_post_metric_idx").on(t.publishedPostId, t.metric, t.collectedAt),
    index("post_analytics_workspace_idx").on(t.workspaceId, t.collectedAt),
  ],
);

/* ───────────────────── Notifications / audit / usage ───────────────────── */

export const notifications = pgTable(
  "notification_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    severity: text("severity").notNull().default("info"),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    dedupeKey: text("dedupe_key"),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.workspaceId, t.createdAt),
    uniqueIndex("notifications_dedupe_unique").on(t.userId, t.dedupeKey),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    correlationId: text("correlation_id"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_workspace_idx").on(t.workspaceId, t.createdAt)],
);

export const usageRecords = pgTable(
  "usage_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    metric: usageMetricEnum("metric").notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("usage_records_workspace_metric_idx").on(t.workspaceId, t.metric, t.createdAt)],
);

export const subscriptionRecords = pgTable(
  "subscription_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    plan: text("plan").notNull(),
    status: text("status").notNull().default("active"),
    provider: text("provider").notNull().default("manual"),
    providerReference: text("provider_reference"),
    currentPeriodStart: ts("current_period_start"),
    currentPeriodEnd: ts("current_period_end"),
    createdAt: createdAt(),
  },
  (t) => [index("subscription_records_workspace_idx").on(t.workspaceId, t.createdAt)],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    route: text("route").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("idempotency_keys_unique").on(t.workspaceId, t.route, t.key)],
);

/* ───────────────────────────── Relations ───────────────────────────── */

export const workspaceRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  socialAccounts: many(socialAccounts),
}));

export const workspaceMemberRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, { fields: [workspaceMembers.workspaceId], references: [workspaces.id] }),
  user: one(users, { fields: [workspaceMembers.userId], references: [users.id] }),
}));

export const contentItemRelations = relations(contentItems, ({ many, one }) => ({
  variants: many(contentVariants),
  media: many(contentMedia),
  jobs: many(publishingJobs),
  brandProfile: one(brandProfiles, { fields: [contentItems.brandProfileId], references: [brandProfiles.id] }),
}));

export const contentVariantRelations = relations(contentVariants, ({ one }) => ({
  content: one(contentItems, { fields: [contentVariants.contentId], references: [contentItems.id] }),
}));

export const contentMediaRelations = relations(contentMedia, ({ one }) => ({
  content: one(contentItems, { fields: [contentMedia.contentId], references: [contentItems.id] }),
  media: one(mediaAssets, { fields: [contentMedia.mediaId], references: [mediaAssets.id] }),
}));

export const publishingJobRelations = relations(publishingJobs, ({ one, many }) => ({
  content: one(contentItems, { fields: [publishingJobs.contentId], references: [contentItems.id] }),
  variant: one(contentVariants, { fields: [publishingJobs.variantId], references: [contentVariants.id] }),
  socialAccount: one(socialAccounts, { fields: [publishingJobs.socialAccountId], references: [socialAccounts.id] }),
  attempts: many(publishingAttempts),
}));

export const publishingAttemptRelations = relations(publishingAttempts, ({ one }) => ({
  job: one(publishingJobs, { fields: [publishingAttempts.jobId], references: [publishingJobs.id] }),
}));

export const documentRelations = relations(uploadedDocuments, ({ many }) => ({
  extractions: many(documentExtractions),
}));

export const documentExtractionRelations = relations(documentExtractions, ({ one }) => ({
  document: one(uploadedDocuments, { fields: [documentExtractions.documentId], references: [uploadedDocuments.id] }),
}));

export const publishedPostRelations = relations(publishedPosts, ({ one, many }) => ({
  job: one(publishingJobs, { fields: [publishedPosts.jobId], references: [publishingJobs.id] }),
  socialAccount: one(socialAccounts, { fields: [publishedPosts.socialAccountId], references: [socialAccounts.id] }),
  metrics: many(postAnalytics),
}));

export const postAnalyticsRelations = relations(postAnalytics, ({ one }) => ({
  post: one(publishedPosts, { fields: [postAnalytics.publishedPostId], references: [publishedPosts.id] }),
}));

export const engagementItemRelations = relations(engagementItems, ({ one }) => ({
  account: one(socialAccounts, { fields: [engagementItems.socialAccountId], references: [socialAccounts.id] }),
  post: one(publishedPosts, { fields: [engagementItems.publishedPostId], references: [publishedPosts.id] }),
}));

/** Small key/value store for app-wide state, e.g. when each scheduled task last ran (cron mode). */
export const appState = pgTable("app_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/**
 * File storage inside Postgres (STORAGE_DRIVER=database, the default on Vercel): each object is
 * stored as ordered chunks so large files upload and stream in pieces under serverless limits.
 */
export const storedFileChunks = pgTable(
  "stored_file_chunks",
  {
    key: text("key").notNull(),
    idx: integer("idx").notNull(),
    data: bytea("data").notNull(),
    contentType: text("content_type"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.key, t.idx] })],
);
