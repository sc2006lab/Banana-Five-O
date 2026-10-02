import { prisma } from './db.js';
import { rebuildIndex } from './neighbourhoods/store.js';

let refreshedAt = 0;
let fingerprint = '';
let pending: Promise<void> | null = null;

/** Hydrate each cold instance and notice persisted cron updates on warm instances. */
export function refreshServerlessIndex(): Promise<void> {
  if (pending) return pending;
  if (refreshedAt && Date.now() - refreshedAt < 30_000) return Promise.resolve();
  pending = (async () => {
    const states = await prisma.dataSourceRegistry.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, status: true, lastSuccessAt: true, lastAttemptAt: true, lastError: true },
    });
    const next = JSON.stringify(states);
    if (!refreshedAt || next !== fingerprint) await rebuildIndex();
    fingerprint = next;
    refreshedAt = Date.now();
  })().finally(() => { pending = null; });
  return pending;
}
