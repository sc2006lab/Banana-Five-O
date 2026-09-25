// Workspaces, members and invitations (SaaS tenancy).
import { Router } from 'express';
import { acceptInviteSchema, inviteSchema, memberRoleSchema, planOf, workspaceNameSchema, type InviteDto, type MemberDto } from '@famplan/shared';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { HttpError, parse } from '../lib/http.js';
import { sendMail } from '../account/mailer.js';
import { hashToken, newToken, requireUser } from '../account/sessions.js';
import { index } from '../neighbourhoods/store.js';
import { createWorkspace, requireMembership, summaries } from './service.js';

export const INVITE_TTL_DAYS = 7;
export const workspaceRouter = Router();

workspaceRouter.get('/workspaces', requireUser, async (req, res) => {
  const account = await prisma.userAccount.findUniqueOrThrow({ where: { id: req.user!.id }, select: { activeWorkspaceId: true, plan: true } });
  const list = await summaries(req.user!.id);
  const owned = list.filter((w) => w.role === 'OWNER').length;
  res.json({
    activeWorkspaceId: account.activeWorkspaceId,
    workspaces: list,
    ownedCount: owned,
    ownedLimit: planOf(account.plan).limits.ownedWorkspaces,
  });
});

workspaceRouter.post('/workspaces', requireUser, async (req, res) => {
  const { name } = parse(workspaceNameSchema, req.body);
  const account = await prisma.userAccount.findUniqueOrThrow({ where: { id: req.user!.id } });
  const plan = planOf(account.plan);
  const owned = await prisma.workspace.count({ where: { ownerId: account.id } });
  if (owned >= plan.limits.ownedWorkspaces)
    throw new HttpError(
      402,
      plan.id === 'advisor'
        ? `The Advisor plan includes ${plan.limits.ownedWorkspaces} workspaces. Delete one before creating another.`
        : `Your ${plan.name} plan includes ${plan.limits.ownedWorkspaces} workspace. Upgrade to Advisor to manage separate client households.`,
    );
  const ws = await prisma.$transaction(async (tx) => {
    const w = await createWorkspace(tx, account.id, name, false, plan.id);
    await tx.userAccount.update({ where: { id: account.id }, data: { activeWorkspaceId: w.id } });
    return w;
  });
  res.status(201).json({ id: ws.id, name: ws.name });
});

workspaceRouter.post('/workspaces/:id/switch', requireUser, async (req, res) => {
  const m = await requireMembership(req.user!.id, String(req.params.id));
  await prisma.userAccount.update({ where: { id: req.user!.id }, data: { activeWorkspaceId: m.workspaceId } });
  res.json({ activeWorkspaceId: m.workspaceId, name: m.workspace.name });
});

workspaceRouter.patch('/workspaces/:id', requireUser, async (req, res) => {
  const { name } = parse(workspaceNameSchema, req.body);
  const m = await requireMembership(req.user!.id, String(req.params.id), 'ADMIN');
  await prisma.workspace.update({ where: { id: m.workspaceId }, data: { name } });
  res.json({ id: m.workspaceId, name });
});

workspaceRouter.delete('/workspaces/:id', requireUser, async (req, res) => {
  const m = await requireMembership(req.user!.id, String(req.params.id), 'OWNER');
  if (m.workspace.personal) throw new HttpError(400, 'Your personal household workspace cannot be deleted. Delete your account instead.');
  await prisma.workspace.delete({ where: { id: m.workspaceId } });
  res.json({ message: `Deleted “${m.workspace.name}” and its shared shortlist.` });
});

// ───────────── Members ─────────────

workspaceRouter.get('/workspaces/:id/members', requireUser, async (req, res) => {
  const m = await requireMembership(req.user!.id, String(req.params.id));
  const rows = await prisma.workspaceMember.findMany({
    where: { workspaceId: m.workspaceId },
    include: { account: { select: { displayName: true, email: true } } },
    orderBy: { joinedAt: 'asc' },
  });
  const members: MemberDto[] = rows.map((r) => ({
    accountId: r.accountId,
    displayName: r.account.displayName,
    email: r.account.email,
    role: r.role as MemberDto['role'],
    joinedAt: r.joinedAt.toISOString(),
  }));
  let invites: InviteDto[] = [];
  if (m.role !== 'MEMBER') {
    const inv = await prisma.workspaceInvite.findMany({
      where: { workspaceId: m.workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    invites = inv.map((i) => ({ id: i.id, email: i.email, role: i.role as InviteDto['role'], createdAt: i.createdAt.toISOString(), expiresAt: i.expiresAt.toISOString() }));
  }
  res.json({ role: m.role, memberLimit: m.workspace.memberLimit, members, invites });
});

workspaceRouter.patch('/workspaces/:id/members/:accountId', requireUser, async (req, res) => {
  const { role } = parse(memberRoleSchema, req.body);
  const m = await requireMembership(req.user!.id, String(req.params.id), 'OWNER');
  const target = String(req.params.accountId);
  if (target === m.workspace.ownerId) throw new HttpError(400, 'The owner’s role cannot be changed.');
  const r = await prisma.workspaceMember.updateMany({ where: { workspaceId: m.workspaceId, accountId: target }, data: { role } });
  if (!r.count) throw new HttpError(404, 'That person is not a member of this workspace.');
  res.json({ message: 'Role updated.' });
});

workspaceRouter.delete('/workspaces/:id/members/:accountId', requireUser, async (req, res) => {
  const target = String(req.params.accountId);
  const self = target === req.user!.id;
  const m = await requireMembership(req.user!.id, String(req.params.id), self ? 'MEMBER' : 'ADMIN');
  if (target === m.workspace.ownerId) throw new HttpError(400, self ? 'Owners cannot leave their own workspace. Delete it instead.' : 'The owner cannot be removed.');
  const r = await prisma.workspaceMember.deleteMany({ where: { workspaceId: m.workspaceId, accountId: target } });
  if (!r.count) throw new HttpError(404, 'That person is not a member of this workspace.');
  await prisma.userAccount.updateMany({ where: { id: target, activeWorkspaceId: m.workspaceId }, data: { activeWorkspaceId: null } });
  res.json({ message: self ? `You left “${m.workspace.name}”.` : 'Member removed.' });
});

// ───────────── Invitations ─────────────

workspaceRouter.post('/workspaces/:id/invites', requireUser, async (req, res) => {
  const { email, role } = parse(inviteSchema, req.body);
  const m = await requireMembership(req.user!.id, String(req.params.id), 'ADMIN');
  const plan = planOf(m.workspace.owner.plan);
  const [members, pending, already] = await Promise.all([
    prisma.workspaceMember.count({ where: { workspaceId: m.workspaceId } }),
    prisma.workspaceInvite.count({ where: { workspaceId: m.workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.workspaceMember.findFirst({ where: { workspaceId: m.workspaceId, account: { email } } }),
  ]);
  if (already) throw new HttpError(409, 'That person is already a member.', { email: 'Already a member of this workspace.' });
  if (members + pending >= m.workspace.memberLimit)
    throw new HttpError(
      402,
      plan.id === 'household'
        ? 'The Household plan is for one person. Upgrade to Family to plan together with up to 4 people.'
        : `This workspace is full (${m.workspace.memberLimit} people including pending invites). Remove someone or revoke an invite first.`,
    );
  const token = newToken();
  const invite = await prisma.workspaceInvite.create({
    data: {
      workspaceId: m.workspaceId,
      email,
      role,
      tokenHash: hashToken(token),
      invitedById: req.user!.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
    },
  });
  const link = `${config.appOrigin}/invite?token=${token}`;
  await sendMail({
    to: email,
    subject: `${req.user!.displayName} invited you to “${m.workspace.name}” on FamPlan`,
    text: `${req.user!.displayName} invited you to plan together in “${m.workspace.name}”.\n\nAccept within ${INVITE_TTL_DAYS} days:\n${link}\n\nYou'll need a FamPlan account with this email address.`,
  });
  const dto: InviteDto = { id: invite.id, email, role, createdAt: invite.createdAt.toISOString(), expiresAt: invite.expiresAt.toISOString(), link };
  res.status(201).json(dto);
});

workspaceRouter.delete('/workspaces/:id/invites/:inviteId', requireUser, async (req, res) => {
  const m = await requireMembership(req.user!.id, String(req.params.id), 'ADMIN');
  const r = await prisma.workspaceInvite.deleteMany({ where: { id: String(req.params.inviteId), workspaceId: m.workspaceId, acceptedAt: null } });
  if (!r.count) throw new HttpError(404, 'Invite not found.');
  res.json({ message: 'Invite revoked.' });
});

async function findInvite(token: string) {
  const inv = await prisma.workspaceInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { workspace: { select: { id: true, name: true, memberLimit: true } }, invitedBy: { select: { displayName: true } } },
  });
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw new HttpError(404, 'This invite link is invalid, already used, or expired. Ask for a new one.');
  return inv;
}

/** Public preview so the invitee sees what they are joining before signing in. */
workspaceRouter.get('/invites/:token', async (req, res) => {
  const { token } = parse(acceptInviteSchema, { token: req.params.token });
  const inv = await findInvite(token);
  res.json({ workspaceName: inv.workspace.name, invitedBy: inv.invitedBy.displayName, email: inv.email, role: inv.role, expiresAt: inv.expiresAt.toISOString() });
});

workspaceRouter.post('/invites/accept', requireUser, async (req, res) => {
  const { token } = parse(acceptInviteSchema, req.body);
  const inv = await findInvite(token);
  if (inv.email.toLowerCase() !== req.user!.email.toLowerCase())
    throw new HttpError(403, `This invite was sent to ${inv.email}. Sign in with that email address to accept it.`);
  await prisma.$transaction(async (tx) => {
    const exists = await tx.workspaceMember.findUnique({ where: { workspaceId_accountId: { workspaceId: inv.workspaceId, accountId: req.user!.id } } });
    if (!exists) {
      const count = await tx.workspaceMember.count({ where: { workspaceId: inv.workspaceId } });
      if (count >= inv.workspace.memberLimit) throw new HttpError(402, 'This workspace is full. Ask the owner to upgrade or remove someone.');
      await tx.workspaceMember.create({ data: { workspaceId: inv.workspaceId, accountId: req.user!.id, role: inv.role } });
    }
    await tx.workspaceInvite.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
    await tx.userAccount.update({ where: { id: req.user!.id }, data: { activeWorkspaceId: inv.workspaceId } });
  });
  res.json({ workspaceId: inv.workspaceId, message: `You joined “${inv.workspace.name}”.` });
});

// ───────────── Export (paid plans) ─────────────

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  // Neutralise spreadsheet formula injection and quote every cell.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

workspaceRouter.get('/workspaces/:id/export.csv', requireUser, async (req, res) => {
  const m = await requireMembership(req.user!.id, String(req.params.id));
  const plan = planOf(m.workspace.owner.plan);
  if (plan.id === 'household') throw new HttpError(402, 'CSV export is included with the Family and Advisor plans.');
  const rows = await prisma.shortlistEntry.findMany({
    where: { workspaceId: m.workspaceId },
    include: { account: { select: { displayName: true } } },
    orderBy: { addedAt: 'asc' },
  });
  const header = ['Neighbourhood', 'Planning area', 'Region', 'Added by', 'Added at', 'Note'];
  const lines = rows.map((r) => {
    const n = index.byId.get(r.neighbourhoodId);
    return [n?.name ?? r.neighbourhoodId, n?.planningArea ?? '', n?.region ?? '', r.account.displayName, r.addedAt.toISOString(), r.note].map(csvCell).join(',');
  });
  const filename = `famplan-${m.workspace.name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}-shortlist.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + [header.map(csvCell).join(','), ...lines].join('\r\n'));
});
