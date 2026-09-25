// Automatic synchronisation pipeline (FR-ADM-03, FR-ADM-04, FR-RES-01).
// download → transform → validate → activate atomically; on any failure the last validated snapshot stays active.
import type { SyncTrigger } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { referencePoint } from '../lib/geo.js';
import { sanitiseError } from '../lib/http.js';
import { SOURCES, type BoundaryRecord, type FacilityRecord, type SourceDefinition } from './sources.js';
import { datasetChecksum, diffCounts, recordHash, validateBoundaries, validateFacilities } from './validate.js';

type Listener = () => Promise<void> | void;
const listeners: Listener[] = [];
/** Called after any run that activated new data (used to rebuild the in-memory neighbourhood index). */
export function onDatasetsChanged(fn: Listener) {
  listeners.push(fn);
}

let running: Promise<void> | null = null;
export const syncState = { runningSourceId: null as string | null };

export async function ensureRegistry() {
  for (const s of SOURCES)
    await prisma.dataSourceRegistry.upsert({
      where: { id: s.id },
      create: { id: s.id, name: s.name, provider: s.provider, schedule: config.sync.cron, freshnessThresholdDays: s.freshnessThresholdDays },
      update: { name: s.name, provider: s.provider, schedule: config.sync.cron, freshnessThresholdDays: s.freshnessThresholdDays },
    });
}

async function activeSnapshot(sourceId: string) {
  return prisma.datasetSnapshot.findFirst({ where: { sourceId, active: true } });
}

export async function syncSource(def: SourceDefinition, trigger: SyncTrigger): Promise<'SUCCESS' | 'NO_CHANGES' | 'FAILED'> {
  const history = await prisma.syncHistoryRecord.create({ data: { sourceId: def.id, trigger, outcome: 'RUNNING' } });
  await prisma.dataSourceRegistry.update({ where: { id: def.id }, data: { lastAttemptAt: history.startedAt, status: 'RUNNING' } });
  syncState.runningSourceId = def.id;
  try {
    if (config.sync.failSources.includes(def.id)) throw new Error('Injected failure for testing (SYNC_FAIL_SOURCES).');
    const current = await activeSnapshot(def.id);
    const fetched = await def.fetch();
    const rules = { minRecords: def.minRecords, categories: def.categories, previousCount: current?.recordCount ?? null };
    const records =
      def.kind === 'facility'
        ? validateFacilities(fetched.records as FacilityRecord[], rules)
        : validateBoundaries(fetched.records as BoundaryRecord[], rules);
    const checksum = datasetChecksum(records);

    if (current && current.checksum === checksum) {
      // Same data re-validated: refresh its validation time (data age) without creating a new version.
      await prisma.$transaction([
        prisma.datasetSnapshot.update({ where: { id: current.id }, data: { validatedAt: new Date(), coverageNote: fetched.coverageNote ?? null } }),
        prisma.syncHistoryRecord.update({ where: { id: history.id }, data: { endedAt: new Date(), outcome: 'NO_CHANGES' } }),
        prisma.dataSourceRegistry.update({
          where: { id: def.id },
          data: { lastSuccessAt: new Date(), status: 'OK', lastError: null, publisherUpdatedAt: fetched.publisherUpdatedAt },
        }),
      ]);
      return 'NO_CHANGES';
    }

    // Diff against the active dataset for the history record.
    const prevHashes = new Map<string, string>();
    if (current) {
      if (def.kind === 'facility') {
        const prev = await prisma.facility.findMany({ where: { snapshotId: current.id }, select: { sourceRecordId: true, recordHash: true } });
        prev.forEach((p) => prevHashes.set(p.sourceRecordId, p.recordHash));
      } else {
        const prev = await prisma.neighbourhood.findMany({ select: { id: true, name: true, planningArea: true, region: true, areaSqm: true } });
        prev.forEach((p) => prevHashes.set(p.id, recordHash({ ...p, geometry: { type: 'Polygon', coordinates: [] } } as BoundaryRecord)));
      }
    }
    const nextHashes = new Map(records.map((r) => ['sourceRecordId' in r ? r.sourceRecordId : r.id, recordHash(r)] as const));
    const diff = diffCounts(prevHashes, nextHashes);

    const refPoints = new Map(
      def.kind === 'boundary' ? (records as BoundaryRecord[]).map((b) => [b.id, referencePoint(b.geometry)] as const) : [],
    );
    const version = (current?.version ?? (await prisma.datasetSnapshot.count({ where: { sourceId: def.id } }))) + 1;
    await prisma.$transaction(
      async (tx) => {
        const snap = await tx.datasetSnapshot.create({
          data: { sourceId: def.id, version, recordCount: records.length, checksum, coverageNote: fetched.coverageNote ?? null, active: false },
        });
        if (def.kind === 'facility') {
          const rows = (records as FacilityRecord[]).map((r) => ({
            snapshotId: snap.id,
            sourceRecordId: r.sourceRecordId,
            name: r.name,
            category: r.category,
            address: r.address,
            postalCode: r.postalCode,
            lat: r.lat,
            lng: r.lng,
            details: r.details,
            recordHash: recordHash(r),
          }));
          for (let i = 0; i < rows.length; i += 2000) await tx.facility.createMany({ data: rows.slice(i, i + 2000) });
        } else {
          for (const b of records as BoundaryRecord[]) {
            const rp = refPoints.get(b.id)!;
            const data = {
              name: b.name,
              planningArea: b.planningArea,
              region: b.region,
              boundary: b.geometry as object,
              areaSqm: b.areaSqm,
              snapshotId: snap.id,
              refLat: rp.lat,
              refLng: rp.lng,
              boundaryBasis: rp.basis,
            };
            await tx.neighbourhood.upsert({ where: { id: b.id }, create: { id: b.id, ...data }, update: data });
          }
        }
        // Activate: deactivate the previous snapshot first (partial unique index allows one active per source).
        if (current) await tx.datasetSnapshot.update({ where: { id: current.id }, data: { active: false } });
        await tx.datasetSnapshot.update({ where: { id: snap.id }, data: { active: true } });
        // Retain the new and the immediately previous snapshot; prune older ones.
        await tx.datasetSnapshot.deleteMany({ where: { sourceId: def.id, version: { lt: version - 1 } } });
        await tx.syncHistoryRecord.update({
          where: { id: history.id },
          data: { endedAt: new Date(), outcome: 'SUCCESS', recordsAdded: diff.added, recordsChanged: diff.changed, recordsRemoved: diff.removed },
        });
        await tx.dataSourceRegistry.update({
          where: { id: def.id },
          data: { lastSuccessAt: new Date(), status: 'OK', lastError: null, publisherUpdatedAt: fetched.publisherUpdatedAt },
        });
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    return 'SUCCESS';
  } catch (err) {
    const msg = sanitiseError(err);
    console.warn(`[sync] ${def.id} failed: ${msg}`);
    await prisma.syncHistoryRecord.update({ where: { id: history.id }, data: { endedAt: new Date(), outcome: 'FAILED', sanitisedError: msg } });
    await prisma.dataSourceRegistry.update({ where: { id: def.id }, data: { status: 'FAILED', lastError: msg } });
    return 'FAILED';
  } finally {
    syncState.runningSourceId = null;
  }
}

/** Run every configured source sequentially. Concurrent calls share the in-flight run. */
export function syncAll(trigger: SyncTrigger, only?: string[]): Promise<void> {
  if (running) return running;
  running = (async () => {
    await ensureRegistry();
    let changed = false;
    for (const def of SOURCES) {
      if (only && !only.includes(def.id)) continue;
      const started = Date.now();
      const outcome = await syncSource(def, trigger);
      console.log(`[sync] ${def.id}: ${outcome} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
      if (outcome === 'SUCCESS') changed = true;
    }
    if (changed) for (const fn of listeners) await fn();
  })().finally(() => {
    running = null;
  });
  return running;
}

export function isSyncRunning() {
  return running !== null;
}

/** True when any source has never succeeded or its last success is older than 24 hours. */
export async function needsStartupSync(): Promise<boolean> {
  await ensureRegistry();
  const cutoff = new Date(Date.now() - 24 * 3600_000);
  const due = await prisma.dataSourceRegistry.count({
    where: { id: { in: SOURCES.map((s) => s.id) }, OR: [{ lastSuccessAt: null }, { lastSuccessAt: { lt: cutoff } }] },
  });
  return due > 0;
}
