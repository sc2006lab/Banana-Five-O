import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { rebuildIndex } from './neighbourhoods/store.js';
import { ensureRegistry, onDatasetsChanged } from './synchronisation/pipeline.js';
import { startScheduler } from './synchronisation/scheduler.js';

await prisma.$connect();
await ensureRegistry();
// Recovery after restart (NFR-REL-02): rebuild the in-memory index from the persisted validated snapshots.
await rebuildIndex();
onDatasetsChanged(rebuildIndex);
startScheduler();

const server = createApp().listen(config.port, () => {
  console.log(`[famplan] API listening on http://localhost:${config.port}`);
});

const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
