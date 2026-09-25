// Developer CLI: run the same automatic synchronisation pipeline once (e.g. first-time data load).
// Usage: npm run sync [-- source-id ...]
import { prisma } from '../db.js';
import { syncAll } from '../synchronisation/pipeline.js';

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
await syncAll('CLI', only.length ? only : undefined);
const sources = await prisma.dataSourceRegistry.findMany({ orderBy: { id: 'asc' } });
console.table(sources.map((s) => ({ id: s.id, status: s.status, lastSuccessAt: s.lastSuccessAt?.toISOString() ?? '-', error: s.lastError ?? '' })));
await prisma.$disconnect();
