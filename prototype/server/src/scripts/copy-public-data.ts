// Bootstrap a NEW hosted database with locally validated PUBLIC datasets only.
// Never copy accounts, password hashes, sessions, preferences, destinations or private notes.
import { Prisma, PrismaClient } from '@prisma/client';

const fromUrl = process.env.SOURCE_DATABASE_URL;
const toUrl = process.env.DATABASE_URL;
if (!fromUrl || !toUrl || fromUrl === toUrl) throw new Error('Provide distinct source and target database URLs.');
const source = new PrismaClient({ datasourceUrl: fromUrl });
const target = new PrismaClient({ datasourceUrl: toUrl });
try {
  if (await target.datasetSnapshot.count() || await target.userAccount.count())
    throw new Error('Bootstrap target must have no snapshots or user accounts; refusing to overwrite existing data.');
  const [registries, snapshots, neighbourhoods, geocodes] = await Promise.all([
    source.dataSourceRegistry.findMany(),
    source.datasetSnapshot.findMany({ where: { active: true } }),
    source.neighbourhood.findMany(),
    source.geocodeCache.findMany(),
  ]);
  if (!snapshots.length || !neighbourhoods.length) throw new Error('No validated public datasets found at source.');
  await target.$transaction(async (tx) => {
    await tx.dataSourceRegistry.createMany({ data: registries });
    await tx.datasetSnapshot.createMany({ data: snapshots });
    await tx.neighbourhood.createMany({ data: neighbourhoods.map((row) => ({ ...row, boundary: row.boundary === null ? Prisma.JsonNull : row.boundary as Prisma.InputJsonValue })) });
    for (const snapshot of snapshots) {
      const rows = await source.facility.findMany({ where: { snapshotId: snapshot.id } });
      for (let i = 0; i < rows.length; i += 1000)
        await tx.facility.createMany({ data: rows.slice(i, i + 1000).map((row) => ({ ...row, details: row.details === null ? Prisma.JsonNull : row.details as Prisma.InputJsonValue })) });
    }
    if (geocodes.length) await tx.geocodeCache.createMany({ data: geocodes });
  }, { timeout: 120_000, maxWait: 10_000 });
  console.log(`Imported ${snapshots.length} validated public snapshots and ${neighbourhoods.length} neighbourhoods. No private account data copied.`);
} finally {
  await Promise.all([source.$disconnect(), target.$disconnect()]);
}
