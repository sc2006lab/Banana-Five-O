// FR-ADM-03, FR-ADM-04, FR-RES-01: validate-then-activate, and failures never replace the active snapshot.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { ensureRegistry, needsStartupSync, syncSource } from '../src/synchronisation/pipeline.js';
import { sourceStatus } from '../src/synchronisation/routes.js';
import type { FacilityRecord, FacilitySource } from '../src/synchronisation/sources.js';
import { resetDb } from './fixtures.js';

const rec = (i: number, name = `Clinic ${i}`): FacilityRecord => ({
  sourceRecordId: `c${i}`,
  name,
  category: 'clinic',
  address: null,
  postalCode: null,
  lat: 1.3 + i * 1e-4,
  lng: 103.8,
  details: {},
});

function source(fetch: FacilitySource['fetch']): FacilitySource {
  return {
    kind: 'facility',
    id: 'moh-chas-clinics',
    name: 'Test clinics',
    provider: 'test',
    datasetName: 'test',
    licence: 'test',
    freshnessThresholdDays: 31,
    minRecords: 10,
    categories: ['clinic'],
    fetch,
  };
}

const ok = (n: number, rename?: number) =>
  source(async () => ({ records: Array.from({ length: n }, (_, i) => rec(i, i === rename ? 'Renamed' : undefined)), publisherUpdatedAt: new Date('2026-09-01') }));

const active = () => prisma.datasetSnapshot.findFirst({ where: { sourceId: 'moh-chas-clinics', active: true } });

beforeEach(async () => {
  await resetDb();
  await ensureRegistry();
});
afterAll(() => prisma.$disconnect());

describe('synchronisation pipeline', () => {
  it('activates a validated candidate and records history', async () => {
    expect(await syncSource(ok(20), 'SCHEDULE')).toBe('SUCCESS');
    const a = await active();
    expect(a?.version).toBe(1);
    expect(a?.recordCount).toBe(20);
    const h = await prisma.syncHistoryRecord.findFirstOrThrow();
    expect(h).toMatchObject({ outcome: 'SUCCESS', recordsAdded: 20, recordsChanged: 0, trigger: 'SCHEDULE' });
    expect(h.endedAt).not.toBeNull();
  });

  it('keeps the previous validated dataset after download, schema and validation failures', async () => {
    await syncSource(ok(20), 'SCHEDULE');
    const failures: FacilitySource[] = [
      source(async () => {
        throw new Error('Request timed out after 60s: https://x?token=secret');
      }),
      source(async () => ({ records: [rec(1)], publisherUpdatedAt: null })), // too few
      source(async () => ({ records: Array.from({ length: 20 }, (_, i) => ({ ...rec(i), lat: 0 })), publisherUpdatedAt: null })), // invalid coords
    ];
    for (const f of failures) {
      expect(await syncSource(f, 'SCHEDULE')).toBe('FAILED');
      const a = await active();
      expect(a?.version).toBe(1);
      expect(await prisma.facility.count({ where: { snapshotId: a!.id } })).toBe(20);
    }
    const errors = await prisma.syncHistoryRecord.findMany({ where: { outcome: 'FAILED' } });
    expect(errors).toHaveLength(3);
    expect(errors.map((e) => e.sanitisedError).join(' ')).not.toContain('secret');
    const reg = await prisma.dataSourceRegistry.findUniqueOrThrow({ where: { id: 'moh-chas-clinics' } });
    expect(reg.status).toBe('FAILED');
  });

  it('records NO_CHANGES for identical data and versions changed data, retaining one previous snapshot', async () => {
    await syncSource(ok(20), 'SCHEDULE');
    expect(await syncSource(ok(20), 'SCHEDULE')).toBe('NO_CHANGES');
    expect(await syncSource(ok(21, 3), 'SCHEDULE')).toBe('SUCCESS');
    const h = await prisma.syncHistoryRecord.findFirstOrThrow({ where: { outcome: 'SUCCESS' }, orderBy: { startedAt: 'desc' } });
    expect(h).toMatchObject({ recordsAdded: 1, recordsChanged: 1, recordsRemoved: 0 });
    expect((await active())?.version).toBe(2);
    expect(await syncSource(ok(22), 'SCHEDULE')).toBe('SUCCESS');
    const versions = (await prisma.datasetSnapshot.findMany({ where: { sourceId: 'moh-chas-clinics' } })).map((s) => s.version).sort();
    expect(versions).toEqual([2, 3]);
  });

  it('flags sources that are due at startup (never run or older than 24 h)', async () => {
    expect(await needsStartupSync()).toBe(true);
    await prisma.dataSourceRegistry.updateMany({ data: { lastSuccessAt: new Date() } });
    expect(await needsStartupSync()).toBe(false);
    await prisma.dataSourceRegistry.updateMany({ where: { id: 'nparks-parks' }, data: { lastSuccessAt: new Date(Date.now() - 25 * 3600_000) } });
    expect(await needsStartupSync()).toBe(true);
  });
});

describe('administrator status rules', () => {
  const now = new Date('2026-09-25T12:00:00Z');
  const base = { lastAttemptAt: now, lastSuccessAt: now, status: 'OK', freshnessThresholdDays: 31 };
  it('classifies never-run, failed, stale (31-day boundary), delayed and ok', () => {
    expect(sourceStatus({ ...base, lastAttemptAt: null }, null, false, now)).toBe('NEVER_RUN');
    expect(sourceStatus({ ...base, status: 'FAILED' }, now, false, now)).toBe('FAILED');
    const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
    expect(sourceStatus(base, daysAgo(31), false, now)).toBe('OK');
    expect(sourceStatus(base, daysAgo(31.01), false, now)).toBe('STALE');
    expect(sourceStatus({ ...base, lastSuccessAt: daysAgo(1.2) }, now, false, now)).toBe('DELAYED');
    expect(sourceStatus(base, now, true, now)).toBe('RUNNING');
  });
});
