// UC-7.1 Monitor Automatic Data Synchronisation (FR-ADM-01, FR-ADM-02, FR-ADM-04). Read-only: no manual trigger.
import { Router } from 'express';
import { historyQuerySchema, type DataSourceStatusDto, type SyncHistoryDto } from '@famplan/shared';
import { prisma } from '../db.js';
import { parse } from '../lib/http.js';
import { requireAdmin } from '../account/sessions.js';
import { onemapHealth, routingConfigured } from '../travel/onemap.js';
import { SOURCES } from './sources.js';
import { syncState } from './pipeline.js';
import { nextRunAt } from './scheduler.js';

export const adminRouter = Router();
adminRouter.use('/admin', requireAdmin);

/** Status rules, most urgent first. */
export function sourceStatus(
  s: { lastAttemptAt: Date | null; lastSuccessAt: Date | null; status: string; freshnessThresholdDays: number },
  activeValidatedAt: Date | null,
  running: boolean,
  now = new Date(),
): DataSourceStatusDto['status'] {
  if (running) return 'RUNNING';
  if (s.status === 'RUNNING')
    return s.lastAttemptAt && now.getTime() - s.lastAttemptAt.getTime() < 6 * 60_000 ? 'RUNNING' : 'DELAYED';
  if (!s.lastAttemptAt) return 'NEVER_RUN';
  if (s.status === 'FAILED') return 'FAILED';
  if (activeValidatedAt && (now.getTime() - activeValidatedAt.getTime()) / 86_400_000 > s.freshnessThresholdDays) return 'STALE';
  if (s.lastSuccessAt && now.getTime() - s.lastSuccessAt.getTime() > 26 * 3600_000) return 'DELAYED';
  return 'OK';
}

adminRouter.get('/admin/sources', async (_req, res) => {
  const [regs, snaps] = await Promise.all([
    prisma.dataSourceRegistry.findMany(),
    prisma.datasetSnapshot.findMany({ where: { active: true } }),
  ]);
  const next = nextRunAt();
  const out: DataSourceStatusDto[] = SOURCES.map((def) => {
    const r = regs.find((x) => x.id === def.id);
    const snap = snaps.find((x) => x.sourceId === def.id);
    return {
      id: def.id,
      name: def.name,
      provider: def.provider,
      categories: def.categories,
      status: r ? sourceStatus(r, snap?.validatedAt ?? null, syncState.runningSourceId === def.id) : 'NEVER_RUN',
      lastAttemptAt: r?.lastAttemptAt?.toISOString() ?? null,
      lastSuccessAt: r?.lastSuccessAt?.toISOString() ?? null,
      recordCount: snap?.recordCount ?? null,
      activeVersion: snap?.version ?? null,
      publisherUpdatedAt: r?.publisherUpdatedAt?.toISOString() ?? null,
      freshnessThresholdDays: def.freshnessThresholdDays,
      schedule: r?.schedule ?? '',
      nextRunAt: next?.toISOString() ?? null,
      lastError: r?.status === 'FAILED' ? r.lastError : (snap?.coverageNote ?? null),
    };
  });
  res.json({
    sources: out,
    live: {
      id: 'onemap',
      name: 'OneMap API',
      provider: 'Singapore Land Authority',
      use: 'Address search, geocoding, basemap tiles' + (routingConfigured() ? ', routing' : ' (routing not configured)'),
      lastOkAt: onemapHealth.lastOkAt?.toISOString() ?? null,
      lastErrorAt: onemapHealth.lastErrorAt?.toISOString() ?? null,
      lastError: onemapHealth.lastError,
    },
  });
});

adminRouter.get('/admin/history', async (req, res) => {
  const q = parse(historyQuerySchema, req.query);
  const rows = await prisma.syncHistoryRecord.findMany({
    where: {
      ...(q.source ? { sourceId: q.source } : {}),
      startedAt: {
        ...(q.from ? { gte: new Date(`${q.from}T00:00:00+08:00`) } : {}),
        ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999+08:00`) } : {}),
      },
    },
    orderBy: { startedAt: 'desc' },
    take: q.limit,
    include: { source: { select: { name: true } } },
  });
  const out: SyncHistoryDto[] = rows.map((r) => ({
    id: r.id,
    sourceId: r.sourceId,
    sourceName: r.source.name,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt?.toISOString() ?? null,
    outcome: r.outcome,
    recordsAdded: r.recordsAdded,
    recordsChanged: r.recordsChanged,
    recordsRemoved: r.recordsRemoved,
    sanitisedError: r.sanitisedError,
    trigger: r.trigger,
  }));
  res.json(out);
});
