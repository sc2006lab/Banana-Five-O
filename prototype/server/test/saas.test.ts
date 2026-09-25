// SaaS layer: workspaces, invites, plan limits, exports, billing and webhook verification.
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { testOutbox } from '../src/account/mailer.js';
import { verifyWebhook } from '../src/billing/stripe.js';
import { resetDb, seedFixtures } from './fixtures.js';

const app = createApp();
const PW = 'correct-horse-9';

async function register(email: string, displayName = email.split('@')[0]) {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/register').send({ displayName, email, password: PW, consent: true });
  expect(r.status).toBe(201);
  return agent;
}
const me = async (a: request.Agent) => (await a.get('/api/auth/me')).body;
const upgrade = (a: request.Agent, plan: string) => a.post('/api/billing/demo/confirm').send({ plan });
const tokenFrom = (text: string) => /token=([A-Za-z0-9_-]+)/.exec(text)![1];

beforeAll(async () => {
  await resetDb();
  await seedFixtures();
});
afterAll(() => prisma.$disconnect());
beforeEach(async () => {
  await prisma.userAccount.deleteMany();
  testOutbox.length = 0;
});

describe('workspaces', () => {
  it('creates a personal Household workspace at registration', async () => {
    const a = await register('owner@example.com', 'Tan');
    const m = await me(a);
    expect(m.plan).toBe('household');
    expect(m.workspace).toMatchObject({ name: "Tan's household", personal: true, role: 'OWNER', memberLimit: 1, shortlistLimit: 10 });
  });

  it('limits owned workspaces by plan and lets advisors manage client workspaces', async () => {
    const a = await register('advisor@example.com');
    expect((await a.post('/api/workspaces').send({ name: 'Client A' })).status).toBe(402);
    await upgrade(a, 'advisor');
    const r = await a.post('/api/workspaces').send({ name: 'Client A' });
    expect(r.status).toBe(201);
    expect((await me(a)).workspace.name).toBe('Client A'); // switched automatically
    const list = (await a.get('/api/workspaces')).body;
    expect(list.ownedCount).toBe(2);
    expect(list.ownedLimit).toBe(25);
    // shortlists are isolated per workspace
    await a.post('/api/shortlist').send({ neighbourhoodId: 'TVSZ01' });
    const personal = list.workspaces.find((w: any) => w.personal);
    await a.post(`/api/workspaces/${personal.id}/switch`).send({});
    expect((await a.get('/api/shortlist')).body.entries).toHaveLength(0);
  });

  it('cannot see, switch to, or modify workspaces it is not a member of', async () => {
    const a = await register('a@example.com');
    const b = await register('b@example.com');
    const wsA = (await me(a)).workspace.id;
    expect((await b.post(`/api/workspaces/${wsA}/switch`).send({})).status).toBe(404);
    expect((await b.get(`/api/workspaces/${wsA}/members`)).status).toBe(404);
    expect((await b.patch(`/api/workspaces/${wsA}`).send({ name: 'pwned' })).status).toBe(404);
    expect((await b.get(`/api/workspaces/${wsA}/export.csv`)).status).toBe(404);
  });

  it('refuses to delete a personal workspace', async () => {
    const a = await register('a@example.com');
    const ws = (await me(a)).workspace.id;
    expect((await a.delete(`/api/workspaces/${ws}`).send({})).status).toBe(400);
  });
});

describe('invitations and shared shortlists', () => {
  it('blocks invites on Household, then shares a workspace on Family', async () => {
    const owner = await register('owner@example.com', 'Owner');
    const ws = (await me(owner)).workspace.id;
    expect((await owner.post(`/api/workspaces/${ws}/invites`).send({ email: 'partner@example.com' })).status).toBe(402);

    await upgrade(owner, 'family');
    expect((await me(owner)).workspace.memberLimit).toBe(4);
    const inv = await owner.post(`/api/workspaces/${ws}/invites`).send({ email: 'partner@example.com' });
    expect(inv.status).toBe(201);
    expect(testOutbox.at(-1)!.to).toBe('partner@example.com');
    const token = tokenFrom(inv.body.link);

    // public preview
    const preview = await request(app).get(`/api/invites/${token}`);
    expect(preview.body.workspaceName).toBe("Owner's household");

    // wrong account cannot accept
    const stranger = await register('stranger@example.com');
    expect((await stranger.post('/api/invites/accept').send({ token })).status).toBe(403);

    const partner = await register('partner@example.com', 'Partner');
    expect((await partner.post('/api/invites/accept').send({ token })).status).toBe(200);
    expect((await partner.post('/api/invites/accept').send({ token })).status).toBe(404); // single use
    expect((await me(partner)).workspace.id).toBe(ws);

    // shared shortlist and notes
    await owner.post('/api/shortlist').send({ neighbourhoodId: 'TVSZ02' });
    await partner.put('/api/shortlist/TVSZ02/note').send({ text: 'Near my office' });
    const seen = (await owner.get('/api/shortlist')).body;
    expect(seen.entries[0].note).toBe('Near my office');
    expect(seen.workspace.memberCount).toBe(2);

    // members cannot invite; owner can remove; member can leave
    expect((await partner.post(`/api/workspaces/${ws}/invites`).send({ email: 'x@example.com' })).status).toBe(403);
    const partnerId = (await me(partner)).id;
    expect((await owner.delete(`/api/workspaces/${ws}/members/${partnerId}`).send({})).status).toBe(200);
    expect((await partner.get('/api/shortlist')).body.workspace.personal ?? (await me(partner)).workspace.personal).toBeTruthy();
  });

  it('counts pending invites toward the member limit', async () => {
    const owner = await register('owner@example.com');
    await upgrade(owner, 'family');
    const ws = (await me(owner)).workspace.id;
    for (const e of ['p1', 'p2', 'p3']) expect((await owner.post(`/api/workspaces/${ws}/invites`).send({ email: `${e}@example.com` })).status).toBe(201);
    const full = await owner.post(`/api/workspaces/${ws}/invites`).send({ email: 'p4@example.com' });
    expect(full.status).toBe(402);
    expect(full.body.error).toMatch(/full/);
  });

  it('raises the shortlist limit with the plan and enforces it in the database', async () => {
    const owner = await register('owner@example.com');
    const ws = (await me(owner)).workspace.id;
    expect((await prisma.workspace.findUniqueOrThrow({ where: { id: ws } })).shortlistLimit).toBe(10);
    await upgrade(owner, 'family');
    expect((await prisma.workspace.findUniqueOrThrow({ where: { id: ws } })).shortlistLimit).toBe(25);
    for (let i = 1; i <= 12; i++) expect((await owner.post('/api/shortlist').send({ neighbourhoodId: `TVSZ${String(i).padStart(2, '0')}` })).status).toBe(201);
    // Downgrading with 12 saved is blocked with a clear reason
    const down = await owner.post('/api/billing/checkout').send({ plan: 'household' });
    expect(down.status).toBe(409);
    expect(down.body.error).toMatch(/12 shortlisted/);
  });
});

describe('exports', () => {
  it('is a paid feature and neutralises spreadsheet formulas', async () => {
    const owner = await register('owner@example.com');
    const ws = (await me(owner)).workspace.id;
    expect((await owner.get(`/api/workspaces/${ws}/export.csv`)).status).toBe(402);
    await upgrade(owner, 'family');
    await owner.post('/api/shortlist').send({ neighbourhoodId: 'TVSZ03' });
    await owner.put('/api/shortlist/TVSZ03/note').send({ text: '=HYPERLINK("http://evil")' });
    const csv = await owner.get(`/api/workspaces/${ws}/export.csv`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv.text).toContain('Test Zone 3');
  });
});

describe('billing', () => {
  it('reports demo mode and changes plans without payment', async () => {
    const a = await register('a@example.com');
    const b = (await a.get('/api/billing')).body;
    expect(b).toMatchObject({ plan: 'household', provider: 'demo' });
    expect((await a.post('/api/billing/checkout').send({ plan: 'family' })).body).toEqual({ mode: 'demo', plan: 'family' });
    expect((await a.post('/api/billing/checkout').send({ plan: 'household' })).status).toBe(400); // already on it
    expect((await a.post('/api/billing/checkout').send({ plan: 'platinum' })).status).toBe(400);
  });

  const sign = (payload: string, secret = 'whsec_test_secret', t = Math.floor(Date.now() / 1000)) =>
    `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;

  it('verifies Stripe webhook signatures', () => {
    const body = Buffer.from('{"a":1}');
    expect(verifyWebhook(body, sign('{"a":1}'), 'whsec_test_secret')).toBe(true);
    expect(verifyWebhook(body, sign('{"a":1}', 'wrong'), 'whsec_test_secret')).toBe(false);
    expect(verifyWebhook(body, sign('{"a":2}'), 'whsec_test_secret')).toBe(false);
    expect(verifyWebhook(body, sign('{"a":1}', 'whsec_test_secret', Math.floor(Date.now() / 1000) - 600), 'whsec_test_secret')).toBe(false);
    expect(verifyWebhook(body, undefined, 'whsec_test_secret')).toBe(false);
  });

  it('activates and cancels subscriptions from signed webhook events only', async () => {
    const a = await register('payer@example.com');
    const id = (await me(a)).id;
    const completed = JSON.stringify({
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: id, customer: 'cus_123', subscription: 'sub_123', metadata: { plan: 'family' } } },
    });
    expect((await request(app).post('/api/billing/webhook').set('Content-Type', 'application/json').set('stripe-signature', 'bogus').send(completed)).status).toBe(400);
    const ok = await request(app).post('/api/billing/webhook').set('Content-Type', 'application/json').set('stripe-signature', sign(completed)).send(completed);
    expect(ok.status).toBe(200);
    let acc = await prisma.userAccount.findUniqueOrThrow({ where: { id } });
    expect(acc).toMatchObject({ plan: 'family', subscriptionStatus: 'active', stripeCustomerId: 'cus_123', stripeSubscriptionId: 'sub_123' });

    const deleted = JSON.stringify({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_123', customer: 'cus_123', status: 'canceled' } } });
    await request(app).post('/api/billing/webhook').set('Content-Type', 'application/json').set('stripe-signature', sign(deleted)).send(deleted);
    acc = await prisma.userAccount.findUniqueOrThrow({ where: { id } });
    expect(acc.plan).toBe('household');
    expect((await prisma.workspace.findFirstOrThrow({ where: { ownerId: id } })).memberLimit).toBe(1);
  });
});
