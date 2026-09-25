// Workspace tenancy: resolution of the active workspace, role checks, and plan-limit propagation.
import type { NextFunction, Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { planOf, type PlanId, type WorkspaceRole, type WorkspaceSummary } from '@famplan/shared';
import { prisma } from '../db.js';
import { HttpError } from '../lib/http.js';

export interface ActiveWorkspace {
  id: string;
  name: string;
  role: WorkspaceRole;
  ownerId: string;
  plan: PlanId;
  shortlistLimit: number;
  memberLimit: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      workspace?: ActiveWorkspace;
    }
  }
}

type Tx = Prisma.TransactionClient;

export async function createWorkspace(tx: Tx, ownerId: string, name: string, personal: boolean, plan: PlanId) {
  const limits = planOf(plan).limits;
  const ws = await tx.workspace.create({
    data: {
      name: name.slice(0, 60),
      ownerId,
      personal,
      shortlistLimit: limits.shortlist,
      memberLimit: limits.membersPerWorkspace,
      members: { create: { accountId: ownerId, role: 'OWNER' } },
    },
  });
  return ws;
}

/** Re-apply the owner's plan limits to every workspace they own (after an upgrade/downgrade). */
export async function applyPlanToOwnedWorkspaces(tx: Tx, ownerId: string, plan: PlanId) {
  const limits = planOf(plan).limits;
  await tx.workspace.updateMany({ where: { ownerId }, data: { shortlistLimit: limits.shortlist, memberLimit: limits.membersPerWorkspace } });
}

/** Reasons a downgrade cannot proceed yet (keeps data consistent with the smaller plan). */
export async function downgradeBlockers(ownerId: string, plan: PlanId): Promise<string[]> {
  const limits = planOf(plan).limits;
  const owned = await prisma.workspace.findMany({
    where: { ownerId },
    select: { name: true, _count: { select: { members: true, shortlist: true } } },
  });
  const out: string[] = [];
  if (owned.length > limits.ownedWorkspaces)
    out.push(`You own ${owned.length} workspaces; the ${planOf(plan).name} plan allows ${limits.ownedWorkspaces}. Delete or transfer the extra workspaces first.`);
  for (const w of owned) {
    if (w._count.members > limits.membersPerWorkspace)
      out.push(`“${w.name}” has ${w._count.members} members; the ${planOf(plan).name} plan allows ${limits.membersPerWorkspace}.`);
    if (w._count.shortlist > limits.shortlist)
      out.push(`“${w.name}” has ${w._count.shortlist} shortlisted neighbourhoods; the ${planOf(plan).name} plan allows ${limits.shortlist}.`);
  }
  return out;
}

export async function summaries(accountId: string): Promise<WorkspaceSummary[]> {
  const rows = await prisma.workspaceMember.findMany({
    where: { accountId },
    include: {
      workspace: {
        include: {
          owner: { select: { displayName: true, plan: true } },
          _count: { select: { members: true, shortlist: true } },
        },
      },
    },
    orderBy: { joinedAt: 'asc' },
  });
  return rows.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    personal: m.workspace.personal,
    role: m.role as WorkspaceRole,
    ownerName: m.workspace.owner.displayName,
    plan: planOf(m.workspace.owner.plan).id,
    memberCount: m.workspace._count.members,
    memberLimit: m.workspace.memberLimit,
    shortlistCount: m.workspace._count.shortlist,
    shortlistLimit: m.workspace.shortlistLimit,
  }));
}

/** Resolve the caller's active workspace (falling back to their first membership) and attach it to the request. */
export async function loadWorkspace(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Please sign in to use this feature.'));
  const account = await prisma.userAccount.findUnique({ where: { id: req.user.id }, select: { activeWorkspaceId: true } });
  let m = account?.activeWorkspaceId
    ? await prisma.workspaceMember.findUnique({
        where: { workspaceId_accountId: { workspaceId: account.activeWorkspaceId, accountId: req.user.id } },
        include: { workspace: { include: { owner: { select: { plan: true } } } } },
      })
    : null;
  if (!m) {
    m = await prisma.workspaceMember.findFirst({
      where: { accountId: req.user.id },
      orderBy: { joinedAt: 'asc' },
      include: { workspace: { include: { owner: { select: { plan: true } } } } },
    });
    if (m) await prisma.userAccount.update({ where: { id: req.user.id }, data: { activeWorkspaceId: m.workspaceId } });
  }
  if (!m) return next(new HttpError(409, 'You are not a member of any workspace. Create one from Settings → Workspaces.'));
  req.workspace = {
    id: m.workspace.id,
    name: m.workspace.name,
    role: m.role as WorkspaceRole,
    ownerId: m.workspace.ownerId,
    plan: planOf(m.workspace.owner.plan).id,
    shortlistLimit: m.workspace.shortlistLimit,
    memberLimit: m.workspace.memberLimit,
  };
  next();
}

/** Membership + minimum role for a workspace named in the URL. */
export async function requireMembership(accountId: string, workspaceId: string, minRole: WorkspaceRole = 'MEMBER') {
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) throw new HttpError(404, 'Workspace not found.');
  const m = await prisma.workspaceMember.findUnique({
    where: { workspaceId_accountId: { workspaceId, accountId } },
    include: { workspace: { include: { owner: { select: { plan: true } } } } },
  });
  if (!m) throw new HttpError(404, 'Workspace not found.');
  const rank = { MEMBER: 0, ADMIN: 1, OWNER: 2 } as const;
  if (rank[m.role as WorkspaceRole] < rank[minRole])
    throw new HttpError(403, minRole === 'OWNER' ? 'Only the workspace owner can do this.' : 'Only workspace owners and admins can do this.');
  return m;
}
