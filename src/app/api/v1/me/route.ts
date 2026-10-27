import { eq } from "drizzle-orm";
import { z } from "zod";
import { isValidTimeZone } from "@/lib/time";
import { getRegistry } from "@/server/ai/registry";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { integrationStatus } from "@/server/env";
import { apiRoute, parseJson } from "@/server/http/handler";
import { SKIP_ID, updateSetupState } from "@/server/setup/service";
import { listMemberships } from "@/server/workspaces/service";

export const GET = apiRoute({}, async ({ user, workspace, role }) => {
  const [u] = await db.select().from(users).where(eq(users.id, user.id));
  return {
    user: { id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified, image: user.image, timezone: u?.timezone ?? "UTC", onboardingCompletedAt: u?.onboardingCompletedAt ?? null },
    workspace: { id: workspace.id, name: workspace.name, timezone: workspace.timezone, plan: workspace.plan, role },
    memberships: await listMemberships(user.id),
    integrations: integrationStatus(),
    ai: getRegistry().status(),
  };
});

const patch = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  timezone: z.string().refine(isValidTimeZone, "Invalid time zone").optional(),
  completeOnboarding: z.boolean().optional(),
  /** Get started guide: skip / un-skip a step, app or server check; hide or show the guide. */
  setup: z.object({ skip: z.string().regex(SKIP_ID).optional(), unskip: z.string().regex(SKIP_ID).optional(), hidden: z.boolean().optional() }).optional(),
});

export const PATCH = apiRoute({ role: "viewer" }, async ({ req, user }) => {
  const body = await parseJson(req, patch);
  const profile = {
    ...(body.name ? { name: body.name } : {}),
    ...(body.timezone ? { timezone: body.timezone } : {}),
    ...(body.completeOnboarding ? { onboardingCompletedAt: new Date() } : {}),
  };
  if (Object.keys(profile).length) await db.update(users).set(profile).where(eq(users.id, user.id));
  if (body.setup) await updateSetupState(user.id, body.setup);
  return { ok: true };
});
