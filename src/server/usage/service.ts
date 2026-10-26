import "server-only";
import { and, count, eq, gte, isNull, ne, sql, sum } from "drizzle-orm";
import { planLimits, type PlanLimits } from "@/lib/plans";
import { db, type DbOrTx } from "@/server/db";
import { mediaAssets, socialAccounts, uploadedDocuments, usageRecords, workspaces } from "@/server/db/schema";
import { quotaExceeded } from "@/server/errors";

export type UsageMetric = (typeof usageRecords.$inferInsert)["metric"];

export const monthStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

export async function recordUsage(
  input: { workspaceId: string; userId?: string | null; metric: UsageMetric; quantity: number; metadata?: Record<string, unknown> },
  conn: DbOrTx = db,
) {
  if (input.quantity <= 0) return;
  await conn.insert(usageRecords).values({
    workspaceId: input.workspaceId,
    userId: input.userId ?? null,
    metric: input.metric,
    quantity: Math.round(input.quantity),
    metadata: input.metadata ?? {},
  });
}

async function monthlyTotal(workspaceId: string, metric: UsageMetric, conn: DbOrTx) {
  const [row] = await conn
    .select({ total: sum(usageRecords.quantity) })
    .from(usageRecords)
    .where(and(eq(usageRecords.workspaceId, workspaceId), eq(usageRecords.metric, metric), gte(usageRecords.createdAt, monthStart())));
  return Number(row?.total ?? 0);
}

export async function storageUsed(workspaceId: string, conn: DbOrTx = db) {
  const [media] = await conn
    .select({ total: sum(mediaAssets.sizeBytes) })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.workspaceId, workspaceId), isNull(mediaAssets.deletedAt)));
  const [docs] = await conn
    .select({ total: sum(uploadedDocuments.sizeBytes) })
    .from(uploadedDocuments)
    .where(and(eq(uploadedDocuments.workspaceId, workspaceId), isNull(uploadedDocuments.fileDeletedAt)));
  return Number(media?.total ?? 0) + Number(docs?.total ?? 0);
}

async function activeAccounts(workspaceId: string, conn: DbOrTx) {
  const [row] = await conn
    .select({ n: count() })
    .from(socialAccounts)
    .where(and(eq(socialAccounts.workspaceId, workspaceId), ne(socialAccounts.status, "disconnected")));
  return row?.n ?? 0;
}

async function planFor(workspaceId: string, conn: DbOrTx) {
  const [ws] = await conn.select({ plan: workspaces.plan }).from(workspaces).where(eq(workspaces.id, workspaceId));
  return { plan: ws?.plan ?? "free", limits: planLimits(ws?.plan ?? "free") };
}

export type QuotaKind = "ai" | "document" | "publishing" | "account" | "storage";

const LABEL: Record<QuotaKind, string> = {
  ai: "AI requests this month",
  document: "documents processed this month",
  publishing: "publishing jobs this month",
  account: "connected accounts",
  storage: "storage",
};

/** Server-side quota enforcement. `amount` is the size of the operation about to happen. */
export async function assertQuota(workspaceId: string, kind: QuotaKind, amount = 1, conn: DbOrTx = db) {
  const { plan, limits } = await planFor(workspaceId, conn);
  const [used, limit] = await usedAndLimit(workspaceId, kind, limits, conn);
  if (used + amount > limit) {
    throw quotaExceeded(`Your ${plan} plan allows ${formatLimit(kind, limit)} ${LABEL[kind]}. You've used ${formatLimit(kind, used)}.`, {
      kind,
      used,
      limit,
      plan,
    });
  }
}

async function usedAndLimit(workspaceId: string, kind: QuotaKind, limits: PlanLimits, conn: DbOrTx): Promise<[number, number]> {
  switch (kind) {
    case "ai":
      return [await monthlyTotal(workspaceId, "ai_request", conn), limits.aiRequestsPerMonth];
    case "document":
      return [await monthlyTotal(workspaceId, "document_processed", conn), limits.documentsPerMonth];
    case "publishing":
      return [await monthlyTotal(workspaceId, "publishing_job", conn), limits.publishingJobsPerMonth];
    case "account":
      return [await activeAccounts(workspaceId, conn), limits.connectedAccounts];
    case "storage":
      return [await storageUsed(workspaceId, conn), limits.storageBytes];
  }
}

function formatLimit(kind: QuotaKind, n: number) {
  if (kind !== "storage") return n.toLocaleString("en-US");
  return `${(n / 1024 ** 3).toFixed(n < 1024 ** 3 ? 2 : 0)} GB`;
}

export async function usageSummary(workspaceId: string, conn: DbOrTx = db) {
  const { plan, limits } = await planFor(workspaceId, conn);
  const [ai, tokens, documents, publishing, accounts, storage] = await Promise.all([
    monthlyTotal(workspaceId, "ai_request", conn),
    monthlyTotal(workspaceId, "ai_tokens", conn),
    monthlyTotal(workspaceId, "document_processed", conn),
    monthlyTotal(workspaceId, "publishing_job", conn),
    activeAccounts(workspaceId, conn),
    storageUsed(workspaceId, conn),
  ]);
  return {
    plan,
    periodStart: monthStart().toISOString(),
    items: [
      { key: "ai", label: "AI requests", used: ai, limit: limits.aiRequestsPerMonth },
      { key: "document", label: "Documents processed", used: documents, limit: limits.documentsPerMonth },
      { key: "publishing", label: "Publishing jobs", used: publishing, limit: limits.publishingJobsPerMonth },
      { key: "account", label: "Connected accounts", used: accounts, limit: limits.connectedAccounts },
      { key: "storage", label: "Storage", used: storage, limit: limits.storageBytes, unit: "bytes" as const },
    ],
    aiTokens: tokens,
  };
}

/** Raw SQL helper used by analytics for consistent month bucketing. */
export const monthBucket = sql`date_trunc('month', now())`;
