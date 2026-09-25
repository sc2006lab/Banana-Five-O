// SaaS plan catalogue — single source of truth for pricing pages and server-side limit enforcement.
export const PLAN_IDS = ['household', 'family', 'advisor'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  priceMonthlySgd: number;
  limits: {
    /** People who can belong to one workspace. */
    membersPerWorkspace: number;
    /** Neighbourhoods a workspace can shortlist. */
    shortlist: number;
    /** Workspaces a user may own on this plan (advisors manage one per client household). */
    ownedWorkspaces: number;
  };
  features: string[];
  highlight?: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  household: {
    id: 'household',
    name: 'Household',
    tagline: 'Everything one family needs to decide.',
    priceMonthlySgd: 0,
    limits: { membersPerWorkspace: 1, shortlist: 10, ownedWorkspaces: 1 },
    features: [
      'Search all 170 family neighbourhoods',
      'Transparent, adjustable suitability scores',
      'Compare up to 4 side by side',
      'Shortlist of 10 with private notes',
      'Commute checks to 3 priority places',
    ],
  },
  family: {
    id: 'family',
    name: 'Family',
    tagline: 'Plan together with a partner or grandparents.',
    priceMonthlySgd: 6,
    limits: { membersPerWorkspace: 4, shortlist: 25, ownedWorkspaces: 1 },
    features: [
      'Everything in Household',
      'Shared workspace for up to 4 people',
      'Shared shortlist of 25 with notes',
      'Export shortlist to CSV',
      'Invite links for family members',
    ],
    highlight: true,
  },
  advisor: {
    id: 'advisor',
    name: 'Advisor',
    tagline: 'For relocation, HR and property advisors.',
    priceMonthlySgd: 39,
    limits: { membersPerWorkspace: 6, shortlist: 25, ownedWorkspaces: 25 },
    features: [
      'Everything in Family',
      'Up to 25 client workspaces',
      'Invite each client household',
      'Switch between clients instantly',
      'CSV exports for every client',
    ],
  },
};

export const planOf = (id: string | null | undefined): Plan => PLANS[(id as PlanId) ?? 'household'] ?? PLANS.household;

export const WORKSPACE_ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
