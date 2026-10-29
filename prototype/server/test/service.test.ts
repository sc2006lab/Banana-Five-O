// NFR-MAINT-02 (proximity aggregation): discovery search, filters, sorting and nearby-facility aggregation in
// neighbourhoods/service.ts (FR-DISC-01, FR-DISC-02, FR-DISC-05, FR-NBH-03, FR-NBH-06, FR-NBH-07, FR-NBH-10).
// Runs against the famplan_test fixtures; OneMap address search is replaced with fixed results.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/travel/onemap.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/travel/onemap.js')>()),
  searchLocation: vi.fn(),
}));

import { prisma } from '../src/db.js';
import { HttpError } from '../src/lib/http.js';
import {
  amenitySummaries,
  facilitiesNear,
  getNeighbourhood,
  levenshtein,
  nameMatches,
  neighbourhoodDetail,
  scoringContext,
  searchNeighbourhoods,
  type SearchParams,
} from '../src/neighbourhoods/service.js';
import { rebuildIndex } from '../src/neighbourhoods/store.js';
import { searchLocation as searchAddress } from '../src/travel/onemap.js';
import { resetDb, seedFixtures } from './fixtures.js';

// Fixtures: TVSZ01–TVSZ12 at lat 1.30, 1.31 … 1.41 (lng 103.8), each with 3 childcare centres and one clinic about
// 314 m away. TVSZ01–06 are in Testville, TVSZ07–12 in Otherton. LVSZ01 (Lonely Vale) is added here: far from the
// others, with childcare but no clinic.
beforeAll(async () => {
  await resetDb();
  await seedFixtures();
  const boundary = await prisma.datasetSnapshot.findFirstOrThrow({ where: { sourceId: 'ura-subzones', active: true } });
  const cc = await prisma.datasetSnapshot.findFirstOrThrow({ where: { sourceId: 'ecda-childcare', active: true } });
  const [lat, lng, d] = [1.45, 103.95, 0.004];
  await prisma.neighbourhood.create({
    data: {
      id: 'LVSZ01',
      name: 'Lonely Vale',
      planningArea: 'Farfield',
      region: 'East Region',
      refLat: lat,
      refLng: lng,
      boundaryBasis: 'fixture',
      boundary: { type: 'Polygon', coordinates: [[[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d]]] },
      areaSqm: 800_000,
      snapshotId: boundary.id,
    },
  });
  await prisma.facility.createMany({
    data: [0, 1, 2].map((k) => ({ snapshotId: cc.id, sourceRecordId: `LV-cc${k}`, name: `Vale Centre ${k}`, category: 'childcare', lat: lat + k * 0.001, lng, recordHash: 'h' })),
  });
  await rebuildIndex();
});
afterAll(() => prisma.$disconnect());
beforeEach(() => {
  vi.mocked(searchAddress).mockReset();
});

const params = (over: Partial<SearchParams> = {}): SearchParams => ({
  ...scoringContext({}),
  q: '',
  areas: [],
  stages: [],
  sort: 'score',
  page: 1,
  pageSize: 50,
  ...over,
});
const ids = async (over: Partial<SearchParams>) => (await searchNeighbourhoods(params(over))).results.map((r) => r.id);
const zones = (...n: number[]) => n.map((i) => `TVSZ${String(i).padStart(2, '0')}`);

describe('nameMatches() and levenshtein()', () => {
  const n = { name: 'Lonely Vale', planningArea: 'Farfield', region: 'East Region' };
  it.each([
    ['', true, 'an empty query matches everything'],
    ['farfield', true, 'substring of the planning area'],
    ['East', true, 'region without the word Region'],
    ['Vlx', false, 'short queries (< 5 characters) need an exact substring'],
    ['Farfeld', true, '7 characters tolerate 1 edit'],
    ['Lonaly', true, 'prefix of the name within 1 edit'],
    ['Lonely Vole', true, '8+ characters tolerate 2 edits'],
    ['Riverside', false, 'unrelated name'],
  ])('%j → %s (%s)', (q, expected) => {
    expect(nameMatches(n, q)).toBe(expected);
  });

  it('levenshtein counts edits and returns 0 for equal strings', () => {
    expect(levenshtein('KITTEN', 'KITTEN')).toBe(0);
    expect(levenshtein('KITTEN', 'SITTING')).toBe(3);
  });
});

describe('scoringContext()', () => {
  it('uses supplied thresholds, labels an unnamed destination and defaults the radius to 1 km', () => {
    const ctx = scoringContext({ th: { childcare: 500 }, destLat: 1.3, destLng: 103.8 });
    expect(ctx.thresholds).toEqual({ childcare: 500 });
    expect(ctx.destination).toEqual({ lat: 1.3, lng: 103.8, label: 'destination' });
    expect(ctx.radius).toBe(1000);
  });
});

describe('searchNeighbourhoods(): name and address matching (FR-DISC-01)', () => {
  it('matches by planning area name without calling address search', async () => {
    const r = await searchNeighbourhoods(params({ q: 'testville' }));
    expect(r.matchedBy).toBe('name');
    expect(r.total).toBe(6);
    expect(searchAddress).not.toHaveBeenCalled();
  });

  it('analyses the exact address using its containing neighbourhood as context', async () => {
    vi.mocked(searchAddress).mockResolvedValue([{ label: '1 Test Road', address: '1 Test Road', postal: '100001', lat: 1.3, lng: 103.8 }]);
    const r = await searchNeighbourhoods(params({ q: '1 Test Road' }));
    expect(r.matchedBy).toBe('address');
    expect(r.addressMatch).toMatchObject({ address: '1 Test Road', neighbourhoodId: 'TVSZ01' });
    expect(r.results.map((x) => x.id)).toEqual(zones(1));
  });

  it('keeps an address outside all boundaries rather than snapping it to the closest reference point', async () => {
    vi.mocked(searchAddress).mockResolvedValue([{ label: 'Gap', address: 'Gap', postal: '100002', lat: 1.3149, lng: 103.8 }]);
    const r = await searchNeighbourhoods(params({ q: '2 Gap Lane' }));
    expect(r.addressMatch?.neighbourhoodId).toBeNull();
    expect(r.results.map((x) => x.id)).toEqual(zones(2));
    expect(r.results[0].lat).toBe(1.3149);
  });

  it('re-sorts address results when another sort is requested', async () => {
    vi.mocked(searchAddress).mockResolvedValue([{ label: '1 Test Road', address: '1 Test Road', postal: '100001', lat: 1.3, lng: 103.8 }]);
    expect(await ids({ q: '1 Test Road', sort: 'score', order: 'asc' })).toHaveLength(1);
  });

  it('returns no results when neither name nor address matches', async () => {
    vi.mocked(searchAddress).mockResolvedValue([]);
    const r = await searchNeighbourhoods(params({ q: 'Nowhereville' }));
    expect(r).toMatchObject({ matchedBy: 'name', total: 0 });
  });

  it('falls back to name matches when address search fails', async () => {
    vi.mocked(searchAddress).mockRejectedValue(new Error('OneMap down'));
    const r = await searchNeighbourhoods(params({ q: 'Lonely Vale 1' })); // contains a digit, so address search is tried first
    expect(r.matchedBy).toBe('name');
    expect(r.results.map((x) => x.id)).toEqual(['LVSZ01']);
  });

  it('reports 503 when address search fails and nothing matches by name', async () => {
    vi.mocked(searchAddress).mockRejectedValue(new Error('OneMap down'));
    await expect(searchNeighbourhoods(params({ q: '999999' }))).rejects.toMatchObject({ status: 503 });
  });
});

describe('searchNeighbourhoods(): filters (FR-DISC-02)', () => {
  it('filters by preferred area, ignoring case', async () => {
    expect((await ids({ areas: ['OTHERTON'] })).sort()).toEqual(zones(7, 8, 9, 10, 11, 12));
  });

  it('keeps only neighbourhoods with a facility for each selected family stage', async () => {
    expect(await ids({ stages: ['expecting_child'] })).not.toContain('LVSZ01'); // no clinic
    expect(await ids({ stages: ['infant_care'] })).toHaveLength(13);
  });

  it('applies minimum facility count at the boundary (childcare within 1 km)', async () => {
    // TVSZ01 and LVSZ01 have their own 3 centres; TVSZ02–12 also reach one centre of the zone below (about 890 m).
    expect(await ids({ category: 'childcare', minCount: 3 })).toHaveLength(13);
    expect((await ids({ category: 'childcare', minCount: 4 })).sort()).toEqual(zones(2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12));
    expect(await ids({ category: 'childcare', minCount: 5 })).toHaveLength(0);
  });

  it('applies maximum nearest-facility distance (clinic about 314 m away)', async () => {
    expect(await ids({ category: 'clinic', maxNearest: 400 })).toHaveLength(12);
    expect(await ids({ category: 'clinic', maxNearest: 300 })).toHaveLength(0);
  });

  it('applies the commute-time threshold to the chosen destination', async () => {
    const dest = { destination: { lat: 1.3, lng: 103.8, label: 'Work' } };
    expect(await ids({ ...dest, maxCommute: 10 })).toEqual(zones(1)); // next zone is about 12 minutes away
    expect(await ids({ maxCommute: 10 })).toEqual([]); // no destination, so no commute time
  });
});

describe('searchNeighbourhoods(): sorting and pagination (FR-DISC-05)', () => {
  it('sorts by nearest selected amenity in either direction, breaking ties by name', async () => {
    // Every TVSZ zone's nearest clinic is 314 m away; LVSZ01's is about 17 km away.
    const asc = await ids({ category: 'clinic', sort: 'nearest' });
    const desc = await ids({ category: 'clinic', sort: 'nearest', order: 'desc' });
    expect(asc.slice(0, 3)).toEqual(zones(1, 10, 11)); // tie at 314 m → name order: Test Zone 1, 10, 11 …
    expect(asc.at(-1)).toBe('LVSZ01');
    expect(desc[0]).toBe('LVSZ01');
  });

  it('sorts by commute time ascending by default', async () => {
    const r = await ids({ destination: { lat: 1.41, lng: 103.8, label: 'Work' }, sort: 'commute' });
    expect(r.slice(0, 3)).toEqual(zones(12, 11, 10));
  });

  it('sorts by coverage, breaking ties by name for stable pages', async () => {
    const page1 = await searchNeighbourhoods(params({ sort: 'coverage', pageSize: 5 }));
    const page2 = await searchNeighbourhoods(params({ sort: 'coverage', pageSize: 5, page: 2 }));
    expect(page1.total).toBe(13);
    expect(page1.results.at(-1)!.coverage).toBeGreaterThanOrEqual(page2.results[0].coverage);
    expect(new Set([...page1.results, ...page2.results].map((x) => x.id)).size).toBe(10);
  });
});

describe('profile aggregation (FR-NBH-03, FR-NBH-06, FR-NBH-07, FR-NBH-10)', () => {
  it('getNeighbourhood() returns 404 for an unknown id', () => {
    expect(() => getNeighbourhood('NOPE')).toThrow(HttpError);
  });

  it('amenitySummaries() distinguishes available, no match, incomplete and unavailable categories', () => {
    const near = Object.fromEntries(amenitySummaries(getNeighbourhood('TVSZ01'), 500).map((a) => [a.category, a]));
    expect(near.clinic).toMatchObject({ state: 'AVAILABLE', matchedCount: 1, nearest: { name: 'Clinic 0' } });
    expect(near.childcare).toMatchObject({ state: 'INCOMPLETE', matchedCount: 3 }); // ecda-preschools never loaded
    expect(near.supermarket).toMatchObject({ state: 'UNAVAILABLE', matchedCount: 0, nearest: null });

    const lonely = Object.fromEntries(amenitySummaries(getNeighbourhood('LVSZ01'), 500).map((a) => [a.category, a]));
    expect(lonely.clinic).toMatchObject({ state: 'NO_MATCH', matchedCount: 0, stateReason: 'No clinic found within 500 m of the reference point.' });
  });

  it('facilitiesNear() lists facilities within the radius, nearest first, skipping unavailable categories', () => {
    const all = facilitiesNear(getNeighbourhood('TVSZ01'), 500);
    expect(all.map((f) => f.category)).toEqual(['childcare', 'childcare', 'childcare', 'clinic']);
    expect(all.map((f) => f.distanceM)).toEqual([...all.map((f) => f.distanceM)].sort((a, b) => a - b));
    expect(facilitiesNear(getNeighbourhood('TVSZ01'), 500, 'clinic').map((f) => f.name)).toEqual(['Clinic 0']);
    expect(facilitiesNear(getNeighbourhood('TVSZ01'), 500, 'supermarket')).toEqual([]);
  });

  it('neighbourhoodDetail() includes the boundary provenance and limitation statements', () => {
    const d = neighbourhoodDetail(getNeighbourhood('TVSZ01'), scoringContext({}));
    expect(d.provenance).toHaveLength(1);
    expect(d.limitations).toHaveLength(3);
  });
});
