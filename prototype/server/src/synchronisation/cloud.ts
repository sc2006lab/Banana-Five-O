import { randomUUID, timingSafeEqual } from 'node:crypto';
import { prisma } from '../db.js';
import { ensureRegistry, syncSource } from './pipeline.js';
import { sourceById } from './sources.js';
import { withSyncBudget } from './budget.js';

export function validCronAuthorization(header: string | undefined, secret = process.env.CRON_SECRET): boolean {
  if (!secret || !header) return false;
  const actual = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function syncCloudSource(sourceId: string) {
  const def = sourceById(sourceId);
  if (!def) return { status: 404, outcome: 'UNKNOWN_SOURCE' };
  const owner = randomUUID();
  // Parameterised atomic lease, shared across all Vercel instances.
  const leases = await prisma.$queryRaw<{ sourceId: string }[]>`
    INSERT INTO "SyncLease" ("sourceId", "owner", "expiresAt")
    VALUES (${sourceId}, ${owner}::uuid, NOW() + INTERVAL '6 minutes')
    ON CONFLICT ("sourceId") DO UPDATE SET "owner" = EXCLUDED."owner", "expiresAt" = EXCLUDED."expiresAt"
    WHERE "SyncLease"."expiresAt" < NOW()
    RETURNING "sourceId"
  `;
  if (!leases.length) return { status: 200, outcome: 'ALREADY_RUNNING' };
  try {
    await ensureRegistry();
    // Fetch budget reserves time for the existing 120s activation transaction and error recording.
    const outcome = await withSyncBudget(150_000, () => syncSource(def, 'SCHEDULE'));
    return { status: outcome === 'FAILED' ? 503 : 200, outcome };
  } finally {
    await prisma.syncLease.deleteMany({ where: { sourceId, owner } });
  }
}
