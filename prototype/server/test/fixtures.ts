// Controlled fixtures for API tests (runs against the famplan_test database).
import { prisma } from '../src/db.js';
import { rebuildIndex } from '../src/neighbourhoods/store.js';
import { ensureRegistry } from '../src/synchronisation/pipeline.js';

export async function resetDb() {
  const target = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.NODE_ENV !== 'test' || !target.pathname.endsWith('_test'))
    throw new Error('Refusing to clear a database without a _test name in test mode.');
  await prisma.$executeRawUnsafe(
    'TRUNCATE "ShortlistEntry","PriorityDestination","FamilyPreferenceProfile","Session","PasswordResetToken","PasswordCredential","UserAccount","Facility","Neighbourhood","DatasetSnapshot","SyncHistoryRecord","DataSourceRegistry","GeocodeCache" CASCADE',
  );
}

const square = (lat: number, lng: number, d = 0.004): GeoJSON.Polygon => ({
  type: 'Polygon',
  coordinates: [[[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d]]],
});

/** 12 neighbourhoods in "Testville", each with 3 childcare centres inside its boundary and one clinic. */
export async function seedFixtures() {
  await ensureRegistry();
  const boundary = await prisma.datasetSnapshot.create({ data: { sourceId: 'ura-subzones', version: 1, recordCount: 12, checksum: 'b', active: true } });
  const cc = await prisma.datasetSnapshot.create({ data: { sourceId: 'ecda-childcare', version: 1, recordCount: 36, checksum: 'c', active: true } });
  const cl = await prisma.datasetSnapshot.create({ data: { sourceId: 'moh-chas-clinics', version: 1, recordCount: 12, checksum: 'd', active: true } });
  const facilities = [];
  for (let i = 0; i < 12; i++) {
    const lat = 1.3 + i * 0.01;
    const lng = 103.8;
    const id = `TVSZ${String(i + 1).padStart(2, '0')}`;
    await prisma.neighbourhood.create({
      data: {
        id,
        name: `Test Zone ${i + 1}`,
        planningArea: i < 6 ? 'Testville' : 'Otherton',
        region: 'Central Region',
        refLat: lat,
        refLng: lng,
        boundaryBasis: 'fixture',
        boundary: square(lat, lng) as object,
        areaSqm: 800_000,
        snapshotId: boundary.id,
      },
    });
    for (let k = 0; k < 3; k++)
      facilities.push({ snapshotId: cc.id, sourceRecordId: `${id}-cc${k}`, name: `Centre ${i}-${k}`, category: 'childcare', lat: lat + k * 0.001, lng, recordHash: 'h' });
    facilities.push({ snapshotId: cl.id, sourceRecordId: `${id}-cl`, name: `Clinic ${i}`, category: 'clinic', lat: lat + 0.002, lng: lng + 0.002, recordHash: 'h' });
  }
  await prisma.facility.createMany({ data: facilities });
  await rebuildIndex();
}
