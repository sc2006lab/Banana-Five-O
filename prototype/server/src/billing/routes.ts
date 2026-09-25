// Subscriptions: Stripe when configured, otherwise an explicit demo mode where no payment is taken.
import express, { Router } from 'express';
import { checkoutSchema, planOf, type BillingDto, type PlanId } from '@famplan/shared';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { HttpError, parse, sanitiseError } from '../lib/http.js';
import { requireUser } from '../account/sessions.js';
import { applyPlanToOwnedWorkspaces, downgradeBlockers } from '../workspaces/service.js';
import { createCheckoutSession, createPortalSession, stripeConfigured, verifyWebhook } from './stripe.js';

export const billingRouter = Router();
const demoAllowed = () => !stripeConfigured() && config.billing.demo;

export async function setPlan(accountId: string, plan: PlanId, extra: { status?: string; customerId?: string | null; subscriptionId?: string | null; periodEnd?: Date | null } = {}) {
  await prisma.$transaction(async (tx) => {
    await tx.userAccount.update({
      where: { id: accountId },
      data: {
        plan,
        subscriptionStatus: extra.status ?? (plan === 'household' ? 'none' : 'active'),
        ...(extra.customerId !== undefined ? { stripeCustomerId: extra.customerId } : {}),
        ...(extra.subscriptionId !== undefined ? { stripeSubscriptionId: extra.subscriptionId } : {}),
        ...(extra.periodEnd !== undefined ? { currentPeriodEnd: extra.periodEnd } : {}),
      },
    });
    await applyPlanToOwnedWorkspaces(tx, accountId, plan);
  });
}

billingRouter.get('/billing', requireUser, async (req, res) => {
  const a = await prisma.userAccount.findUniqueOrThrow({ where: { id: req.user!.id } });
  const owned = await prisma.workspace.count({ where: { ownerId: a.id } });
  const dto: BillingDto = {
    plan: planOf(a.plan).id,
    status: a.subscriptionStatus as BillingDto['status'],
    currentPeriodEnd: a.currentPeriodEnd?.toISOString() ?? null,
    provider: stripeConfigured() ? 'stripe' : 'demo',
    canManage: stripeConfigured() ? Boolean(a.stripeCustomerId) : demoAllowed(),
    usage: { ownedWorkspaces: owned, ownedWorkspaceLimit: planOf(a.plan).limits.ownedWorkspaces },
  };
  res.json(dto);
});

billingRouter.post('/billing/checkout', requireUser, async (req, res) => {
  const { plan } = parse(checkoutSchema, req.body);
  const a = await prisma.userAccount.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (plan === a.plan) throw new HttpError(400, `You're already on the ${planOf(plan).name} plan.`);
  const blockers = await downgradeBlockers(a.id, plan);
  if (blockers.length) throw new HttpError(409, blockers[0], { plan: blockers.join(' ') });

  if (stripeConfigured()) {
    if (plan === 'household' || a.stripeSubscriptionId) {
      if (!a.stripeCustomerId) throw new HttpError(400, 'No billing account found.');
      const portal = await createPortalSession(a.stripeCustomerId);
      return res.json({ mode: 'redirect', url: portal.url });
    }
    const session = await createCheckoutSession({ accountId: a.id, email: a.email, customerId: a.stripeCustomerId, plan });
    return res.json({ mode: 'redirect', url: session.url });
  }
  if (!demoAllowed()) throw new HttpError(503, 'Billing is not configured on this server.');
  res.json({ mode: 'demo', plan });
});

/** Demo only: confirm a plan change without payment. Disabled whenever Stripe is configured. */
billingRouter.post('/billing/demo/confirm', requireUser, async (req, res) => {
  if (!demoAllowed()) throw new HttpError(404, 'Unknown API endpoint.');
  const { plan } = parse(checkoutSchema, req.body);
  const blockers = await downgradeBlockers(req.user!.id, plan);
  if (blockers.length) throw new HttpError(409, blockers[0], { plan: blockers.join(' ') });
  await setPlan(req.user!.id, plan, { periodEnd: plan === 'household' ? null : new Date(Date.now() + 30 * 86_400_000) });
  res.json({ plan, message: plan === 'household' ? 'You’re back on the free Household plan.' : `Demo: ${planOf(plan).name} plan activated. No payment was taken.` });
});

billingRouter.post('/billing/portal', requireUser, async (req, res) => {
  if (!stripeConfigured()) throw new HttpError(400, 'Billing portal is available when Stripe is configured.');
  const a = await prisma.userAccount.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!a.stripeCustomerId) throw new HttpError(400, 'No billing account found yet.');
  res.json({ url: (await createPortalSession(a.stripeCustomerId)).url });
});

/** Stripe webhook — mounted with a raw body parser before express.json (see app.ts). */
export const stripeWebhook = [
  express.raw({ type: 'application/json', limit: '256kb' }),
  async (req: express.Request, res: express.Response) => {
    if (!verifyWebhook(req.body as Buffer, req.header('stripe-signature'), config.stripe.webhookSecret)) {
      res.status(400).json({ error: 'Invalid signature.' });
      return;
    }
    try {
      const event = JSON.parse((req.body as Buffer).toString('utf8')) as { type: string; data: { object: any } };
      const o = event.data.object;
      if (event.type === 'checkout.session.completed') {
        const accountId = o.client_reference_id ?? o.metadata?.accountId;
        const plan = planOf(o.metadata?.plan).id;
        if (accountId) await setPlan(accountId, plan, { customerId: o.customer ?? null, subscriptionId: o.subscription ?? null, status: 'active' });
      } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        const account = await prisma.userAccount.findFirst({ where: { OR: [{ stripeSubscriptionId: o.id }, { stripeCustomerId: o.customer }] } });
        if (account) {
          const deleted = event.type === 'customer.subscription.deleted' || o.status === 'canceled';
          const status = deleted ? 'canceled' : o.status === 'past_due' || o.status === 'unpaid' ? 'past_due' : 'active';
          const plan: PlanId = deleted ? 'household' : planOf(o.metadata?.plan ?? account.plan).id;
          await setPlan(account.id, plan, {
            status: deleted ? 'none' : status,
            subscriptionId: deleted ? null : o.id,
            periodEnd: o.current_period_end ? new Date(o.current_period_end * 1000) : null,
          });
        }
      }
      res.json({ received: true });
    } catch (e) {
      console.error('[billing] webhook error', sanitiseError(e));
      res.status(500).json({ error: 'Webhook handling failed.' });
    }
  },
];
