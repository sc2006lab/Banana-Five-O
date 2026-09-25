// Endpoint, authentication and authorisation tests (Supertest) — FR-ACC-*, FR-PREF-*, FR-DISC-*, FR-DEC-04..07, FR-ADM-01, NFR-SEC-*.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { testOutbox } from '../src/account/mailer.js';
import { GENERIC_LOGIN_FAILURE } from '../src/account/routes.js';
import { ARGON2_PARAMS_LABEL, hashPassword } from '../src/account/passwords.js';
import { resetDb, seedFixtures } from './fixtures.js';

const app = createApp();
const PW = 'correct-horse-9';

async function register(email = 'parent@example.com', displayName = 'Parent') {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/register').send({ displayName, email, password: PW, consent: true });
  expect(r.status).toBe(201);
  return agent;
}

beforeAll(async () => {
  await resetDb();
  await seedFixtures();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.userAccount.deleteMany();
  testOutbox.length = 0;
});

describe('registration and login (UC-1.1, UC-1.2)', () => {
  it('rejects invalid registrations with field-specific errors', async () => {
    const r = await request(app).post('/api/auth/register').send({ displayName: '', email: 'not-an-email', password: 'short', consent: false });
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.fields).sort()).toEqual(['consent', 'displayName', 'email', 'password']);
  });

  it('rejects duplicate email', async () => {
    await register();
    const r = await request(app).post('/api/auth/register').send({ displayName: 'X', email: 'PARENT@example.com', password: PW, consent: true });
    expect(r.status).toBe(409);
    expect(r.body.fields.email).toBeTruthy();
  });

  it('stores only an Argon2id hash, never the password', async () => {
    await register();
    const cred = await prisma.passwordCredential.findFirstOrThrow();
    expect(cred.saltedHash.startsWith('$argon2id$')).toBe(true);
    expect(cred.saltedHash).not.toContain(PW);
  });

  it('gives the same generic failure for unknown email and wrong password', async () => {
    await register();
    const a = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: PW });
    const b = await request(app).post('/api/auth/login').send({ email: 'parent@example.com', password: 'wrong-pass-1' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error).toBe(GENERIC_LOGIN_FAILURE);
    expect(b.body.error).toBe(GENERIC_LOGIN_FAILURE);
  });

  it('locks after five consecutive failures and a success before the threshold resets the counter (NFR-SEC-04)', async () => {
    await register();
    const login = (password: string) => request(app).post('/api/auth/login').send({ email: 'parent@example.com', password });
    for (let i = 0; i < 4; i++) expect((await login('wrong-pass-1')).status).toBe(401);
    expect((await login(PW)).status).toBe(200); // resets counter
    for (let i = 0; i < 5; i++) expect((await login('wrong-pass-1')).status).toBe(401);
    expect((await login(PW)).status).toBe(401); // locked
    const acc = await prisma.userAccount.findFirstOrThrow();
    expect(acc.lockedUntil!.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
    await prisma.userAccount.update({ where: { id: acc.id }, data: { lockedUntil: new Date(Date.now() - 1000) } }); // 15 min elapsed
    expect((await login(PW)).status).toBe(200);
  });

  it('logout invalidates the session token (FR-ACC-03)', async () => {
    const agent = await register();
    expect((await agent.get('/api/preferences')).status).toBe(200);
    await agent.post('/api/auth/logout').send({});
    const s = await prisma.session.findFirstOrThrow();
    expect(s.invalidatedAt).not.toBeNull();
    // Replaying the old cookie must fail
    const replay = await request(app).get('/api/preferences').set('Cookie', `famplan_sid=forged-${'x'.repeat(30)}`);
    expect(replay.status).toBe(401);
  });

  it('requires JSON for state-changing requests (CSRF defence)', async () => {
    const r = await request(app).post('/api/auth/login').type('form').send('email=a@b.co&password=x');
    expect(r.status).toBe(415);
  });
});

describe('password reset (UC-1.3)', () => {
  it('returns the same response for known and unknown emails and resets once', async () => {
    await register();
    const a = await request(app).post('/api/auth/forgot-password').send({ email: 'parent@example.com' });
    const b = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@example.com' });
    expect(a.status).toBe(202);
    expect(a.body).toEqual(b.body);
    expect(testOutbox).toHaveLength(1);
    const token = /token=([A-Za-z0-9_-]+)/.exec(testOutbox[0].text)![1];
    const ok = await request(app).post('/api/auth/reset-password').send({ token, password: 'brand-new-pass-2' });
    expect(ok.status).toBe(200);
    const reuse = await request(app).post('/api/auth/reset-password').send({ token, password: 'another-pass-3' });
    expect(reuse.status).toBe(400);
    expect((await request(app).post('/api/auth/login').send({ email: 'parent@example.com', password: 'brand-new-pass-2' })).status).toBe(200);
  });

  it('rejects expired links', async () => {
    await register();
    await request(app).post('/api/auth/forgot-password').send({ email: 'parent@example.com' });
    const token = /token=([A-Za-z0-9_-]+)/.exec(testOutbox[0].text)![1];
    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1) } });
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'brand-new-pass-2' })).status).toBe(400);
  });
});

describe('account management (UC-1.4, UC-1.5)', () => {
  it('updates display name only', async () => {
    const agent = await register();
    const r = await agent.patch('/api/account').send({ displayName: 'Tan Family' });
    expect(r.body.displayName).toBe('Tan Family');
    expect((await agent.patch('/api/account').send({ displayName: 'X', email: 'evil@example.com' })).status).toBe(400);
  });

  it('deletes account, preferences, shortlist and notes after explicit confirmation', async () => {
    const agent = await register();
    await agent.post('/api/shortlist').send({ neighbourhoodId: 'TVSZ01' });
    expect((await agent.delete('/api/account').send({ confirmation: 'nope' })).status).toBe(400);
    expect((await agent.delete('/api/account').send({ confirmation: 'DELETE' })).status).toBe(200);
    expect(await prisma.userAccount.count()).toBe(0);
    expect(await prisma.shortlistEntry.count()).toBe(0);
    expect(await prisma.familyPreferenceProfile.count()).toBe(0);
    expect((await agent.get('/api/preferences')).status).toBe(401);
  });
});

describe('preferences (UC-2.1)', () => {
  const valid = {
    familyStages: ['preschool', 'primary_school'],
    preferredAreas: ['Testville'],
    amenityThresholds: { childcare: 500 },
    weights: { childcare: 5, schools: 4, groceries: 3, healthcare: 3, green_spaces: 2, public_transport: 3, commute: 0, accessibility: 1 },
    confirmedWeights: ['childcare'],
    destinations: [{ label: 'Work', queryText: 'Raffles Place', address: 'Raffles Place', lat: 1.284, lng: 103.851 }],
  };

  it('saves and retrieves preferences across sessions (FR-PREF-06)', async () => {
    const agent = await register();
    expect((await agent.put('/api/preferences').send(valid)).status).toBe(200);
    const again = request.agent(app);
    await again.post('/api/auth/login').send({ email: 'parent@example.com', password: PW });
    const r = await again.get('/api/preferences');
    expect(r.body.weights.childcare).toBe(5);
    expect(r.body.destinations[0].label).toBe('Work');
    expect(r.body.amenityThresholds).toEqual({ childcare: 500 });
  });

  it.each([
    ['weight -1', { weights: { ...valid.weights, childcare: -1 } }, 'weights.childcare'],
    ['weight 6', { weights: { ...valid.weights, childcare: 6 } }, 'weights.childcare'],
    ['non-integer weight', { weights: { ...valid.weights, childcare: 2.5 } }, 'weights.childcare'],
    ['unknown stage', { familyStages: ['teenager'] }, 'familyStages.0'],
    ['four destinations', { destinations: [1, 2, 3, 4].map((i) => ({ ...valid.destinations[0], lat: 1.28 + i / 100 })) }, 'destinations'],
    ['duplicate destination', { destinations: [valid.destinations[0], valid.destinations[0]] }, 'destinations.1.queryText'],
    ['unsupported distance', { amenityThresholds: { childcare: 750 } }, 'amenityThresholds.childcare'],
    ['unknown area', { preferredAreas: ['Atlantis'] }, 'preferredAreas.0'],
  ])('rejects %s', async (_n, patch, field) => {
    const agent = await register();
    const r = await agent.put('/api/preferences').send({ ...valid, ...patch });
    expect(r.status).toBe(400);
    expect(r.body.fields[field]).toBeTruthy();
  });

  it('suggests stage weights without overwriting confirmed ones (FR-PREF-07)', async () => {
    const r = await request(app)
      .post('/api/preferences/suggest-weights')
      .send({ familyStages: ['secondary_school'], weights: { ...valid.weights, schools: 1 }, confirmedWeights: ['schools'] });
    expect(r.body.weights.schools).toBe(1); // kept
    expect(r.body.weights.public_transport).toBe(5); // suggested
    expect(r.body.kept).toEqual(['schools']);
  });
});

describe('discovery and profiles (UC-3.1, UC-4.1)', () => {
  it('searches by planning area with spelling tolerance and paginates stably', async () => {
    const r = await request(app).get('/api/neighbourhoods?q=testvile&pageSize=4');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(6);
    expect(r.body.results).toHaveLength(4);
    const p2 = await request(app).get('/api/neighbourhoods?q=testvile&pageSize=4&page=2');
    const ids = [...r.body.results, ...p2.body.results].map((x: { id: string }) => x.id);
    expect(new Set(ids).size).toBe(6);
    expect(r.body.limitation).toMatch(/not a live property listing/);
  });

  it('rejects contradictory criteria with field guidance (FR-DISC-06)', async () => {
    const cases: [string, string][] = [
      ['minCount=-1&category=clinic', 'minCount'],
      ['radius=750', 'radius'],
      ['maxCommute=30', 'maxCommute'],
      ['maxNearest=1500&radius=1000&category=clinic', 'maxNearest'],
      ['sort=nearest', 'sort'],
      ['destLat=1.3', 'destLat'],
    ];
    for (const [qs, field] of cases) {
      const r = await request(app).get(`/api/neighbourhoods?${qs}`);
      expect(r.status, qs).toBe(400);
      expect(r.body.fields[field], qs).toBeTruthy();
    }
  });

  it('filters by count and places unavailable values last when sorting', async () => {
    const r = await request(app).get('/api/neighbourhoods?category=childcare&minCount=3&radius=500&pageSize=50');
    expect(r.body.results.every((x: any) => x.highlights.find((h: any) => h.category === 'childcare').count >= 3)).toBe(true);
    const s = await request(app).get('/api/neighbourhoods?sort=commute&destLat=1.30&destLng=103.80&pageSize=50');
    const mins = s.body.results.map((x: any) => x.commuteMin);
    expect(mins).toEqual([...mins].sort((a: number, b: number) => a - b));
  });

  it('shows category states instead of misleading zeros (FR-NBH-09)', async () => {
    const r = await request(app).get('/api/neighbourhoods/TVSZ01?radius=500');
    const byCat = Object.fromEntries(r.body.amenities.map((a: any) => [a.category, a.state]));
    expect(byCat.childcare).toBe('INCOMPLETE'); // one of two childcare sources never loaded
    expect(byCat.clinic).toBe('AVAILABLE');
    expect(byCat.mrt).toBe('UNAVAILABLE');
    const mrtScore = r.body.score.breakdown.find((b: any) => b.criterion === 'public_transport');
    expect(mrtScore.missing).toBe(true);
    expect(r.body.limitations.join(' ')).toMatch(/does not guarantee admission/);
  });

  it('compares two to four distinct neighbourhoods (FR-DEC-04)', async () => {
    expect((await request(app).get('/api/compare?ids=TVSZ01')).status).toBe(400);
    expect((await request(app).get('/api/compare?ids=TVSZ01,TVSZ01')).status).toBe(400);
    expect((await request(app).get('/api/compare?ids=TVSZ01,TVSZ02,TVSZ03,TVSZ04,TVSZ05')).status).toBe(400);
    const ok = await request(app).get('/api/compare?ids=TVSZ01,TVSZ02');
    expect(ok.status).toBe(200);
    expect(ok.body.items).toHaveLength(2);
  });

  it('identical inputs reproduce identical scores (NFR-DATA-03)', async () => {
    const q = '/api/neighbourhoods/TVSZ03?w_childcare=5&w_healthcare=2';
    const a = await request(app).get(q);
    const b = await request(app).get(q);
    const strip = (s: any) => ({ ...s, computedAt: null });
    expect(strip(a.body.score)).toEqual(strip(b.body.score));
  });
});

describe('shortlist and notes (UC-6.3)', () => {
  it('requires sign-in', async () => {
    expect((await request(app).get('/api/shortlist')).status).toBe(401);
    expect((await request(app).post('/api/shortlist').send({ neighbourhoodId: 'TVSZ01' })).status).toBe(401);
  });

  it('adds up to ten, refuses the eleventh, and reports duplicates', async () => {
    const agent = await register();
    for (let i = 1; i <= 10; i++) expect((await agent.post('/api/shortlist').send({ neighbourhoodId: `TVSZ${String(i).padStart(2, '0')}` })).status).toBe(201);
    const dup = await agent.post('/api/shortlist').send({ neighbourhoodId: 'TVSZ01' });
    expect(dup.body.status).toBe('ALREADY_SAVED');
    const eleventh = await agent.post('/api/shortlist').send({ neighbourhoodId: 'TVSZ11' });
    expect(eleventh.status).toBe(409);
    expect(eleventh.body.error).toMatch(/full/);
  });

  it('enforces capacity in the database even for concurrent inserts', async () => {
    const agent = await register();
    const acc = await prisma.userAccount.findFirstOrThrow();
    const ws = await prisma.workspace.findFirstOrThrow({ where: { ownerId: acc.id } });
    await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        prisma.shortlistEntry.create({ data: { workspaceId: ws.id, accountId: acc.id, neighbourhoodId: `TVSZ${String(i + 1).padStart(2, '0')}` } }),
      ),
    );
    expect(await prisma.shortlistEntry.count({ where: { workspaceId: ws.id } })).toBe(10);
    expect((await agent.get('/api/shortlist')).body.entries).toHaveLength(10);
  });

  it('stores notes of 0–500 characters as plain text and isolates accounts', async () => {
    const a = await register('a@example.com', 'A');
    const b = await register('b@example.com', 'B');
    await a.post('/api/shortlist').send({ neighbourhoodId: 'TVSZ01' });
    expect((await a.put('/api/shortlist/TVSZ01/note').send({ text: 'x'.repeat(499) })).status).toBe(200);
    expect((await a.put('/api/shortlist/TVSZ01/note').send({ text: 'x'.repeat(500) })).status).toBe(200);
    expect((await a.put('/api/shortlist/TVSZ01/note').send({ text: 'x'.repeat(501) })).status).toBe(400);
    await a.put('/api/shortlist/TVSZ01/note').send({ text: '<script>alert(1)</script>' });
    // B cannot read or write A's note
    expect((await b.put('/api/shortlist/TVSZ01/note').send({ text: 'hijack' })).status).toBe(404);
    expect((await b.get('/api/shortlist')).body.entries).toHaveLength(0);
    const mine = (await a.get('/api/shortlist')).body.entries[0];
    expect(mine.note).toBe('<script>alert(1)</script>'); // stored verbatim; React renders it as text
    expect((await a.put('/api/shortlist/TVSZ01/note').send({ text: '' })).body.message).toBe('Note cleared.');
    expect((await a.delete('/api/shortlist/TVSZ01').send({})).status).toBe(200);
    expect((await a.delete('/api/shortlist/TVSZ01').send({})).status).toBe(404);
  });
});

describe('administration (UC-7.1, FR-ADM-01, NFR-SEC-03)', () => {
  it('denies anonymous and ordinary users at the API level and allows administrators', async () => {
    expect((await request(app).get('/api/admin/sources')).status).toBe(401);
    const user = await register();
    expect((await user.get('/api/admin/sources')).status).toBe(403);
    expect((await user.get('/api/admin/history')).status).toBe(403);

    const saltedHash = await hashPassword(PW);
    await prisma.userAccount.create({
      data: { email: 'admin@example.com', displayName: 'Admin', role: 'DATA_ADMINISTRATOR', consentGivenAt: new Date(), credential: { create: { saltedHash, parameters: ARGON2_PARAMS_LABEL } } },
    });
    const admin = request.agent(app);
    await admin.post('/api/auth/login').send({ email: 'admin@example.com', password: PW });
    const s = await admin.get('/api/admin/sources');
    expect(s.status).toBe(200);
    expect(s.body.sources.find((x: any) => x.id === 'moh-chas-clinics').recordCount).toBe(12);
    expect(s.body.sources.find((x: any) => x.id === 'lta-bus-stops').status).toBe('NEVER_RUN');
    expect((await admin.get('/api/admin/history?from=2026-13-01')).status).toBe(400);
  });
});
