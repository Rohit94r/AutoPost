/**
 * Plan definitions — the single source of numeric limits. Client-safe so the usage page can
 * render them; enforcement happens server-side in `server/usage`.
 */
export type PlanId = "free" | "pro" | "team";

export interface PlanLimits {
  aiRequestsPerMonth: number;
  documentsPerMonth: number;
  publishingJobsPerMonth: number;
  connectedAccounts: number;
  storageBytes: number;
  members: number;
}

const GB = 1024 ** 3;

export const PLANS: Record<PlanId, { name: string; description: string; limits: PlanLimits }> = {
  free: {
    name: "Free",
    description: "For trying Verdant with a couple of accounts.",
    limits: {
      aiRequestsPerMonth: 150,
      documentsPerMonth: 15,
      publishingJobsPerMonth: 60,
      connectedAccounts: 3,
      storageBytes: 1 * GB,
      members: 1,
    },
  },
  pro: {
    name: "Pro",
    description: "For creators and freelancers publishing every day.",
    limits: {
      aiRequestsPerMonth: 2_000,
      documentsPerMonth: 150,
      publishingJobsPerMonth: 1_000,
      connectedAccounts: 10,
      storageBytes: 20 * GB,
      members: 3,
    },
  },
  team: {
    name: "Team",
    description: "For agencies and marketing teams.",
    limits: {
      aiRequestsPerMonth: 10_000,
      documentsPerMonth: 600,
      publishingJobsPerMonth: 5_000,
      connectedAccounts: 30,
      storageBytes: 100 * GB,
      members: 15,
    },
  },
};

export function planLimits(plan: string): PlanLimits {
  return (PLANS[plan as PlanId] ?? PLANS.free).limits;
}
