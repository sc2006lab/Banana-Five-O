import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { AMENITY_CATEGORIES, singaporePostalInput, type AmenityCategory } from '@famplan/shared';
vi.mock('../src/travel/onemap.js', async (original) => ({ ...await original<typeof import('../src/travel/onemap.js')>(), searchLocation: vi.fn() }));
import { searchLocation } from '../src/travel/onemap.js';
import { createApp } from '../src/app.js';
import { index, type IndexedNeighbourhood } from '../src/neighbourhoods/store.js';
import { facilitiesNear, neighbourhoodDetail, scoringContext, searchNeighbourhoods, type SearchParams } from '../src/neighbourhoods/service.js';
import { haversineM } from '../src/lib/geo.js';

const metresPerDegree = Math.PI / 180 * 6_371_008.8;
const origin = { lat: 1.32, lng: 103.82, address: '12 Test Road Singapore 012345', postal: '012345' };
const n: IndexedNeighbourhood = {
  id: 'TESZ01', name: 'Test Estate', planningArea: 'Test Town', region: 'Central Region',
  lat: 1.3, lng: 103.82, boundaryBasis: 'Test boundary', searchable: true,
  boundary: { type: 'Polygon', coordinates: [[[103.8, 1.29], [103.84, 1.29], [103.84, 1.34], [103.8, 1.34], [103.8, 1.29]]] },
  near: Object.fromEntries(AMENITY_CATEGORIES.map((c) => [c, []])) as unknown as IndexedNeighbourhood['near'],
  nearest: Object.fromEntries(AMENITY_CATEGORIES.map((c) => [c, null])) as IndexedNeighbourhood['nearest'],
};
function params(over: Partial<SearchParams> = {}): SearchParams {
  return { ...scoringContext({}), q: '', areas: [], stages: [], sort: 'score', page: 1, pageSize: 12, ...over };
}
const app = createApp();
beforeEach(() => {
  vi.mocked(searchLocation).mockReset();
  index.neighbourhoods = [n]; index.byId = new Map([[n.id, n]]); index.facilities = []; index.sources.clear();
  for (const cat of AMENITY_CATEGORIES) index.sources.set(cat, {
    def: { kind: 'facility', categories: [cat] }, active: true, version: 1, coverageNote: null,
    provenance: { sourceId: cat, provider: 'Fixture', datasetName: cat, publisherUpdatedAt: null, retrievedAt: new Date().toISOString(), datasetVersion: 1, ageDays: 0, stale: false, licence: 'Fixture' },
  } as never);
});
afterEach(() => vi.restoreAllMocks());
function facility(id: string, metres: number, category: AmenityCategory = 'childcare') {
  return { id, name: id, category, address: null, lat: origin.lat + metres / metresPerDegree, lng: origin.lng, sourceIds: [category], details: {} };
}

describe('exact address radius', () => {
  it('keeps default scoring evidence consistent with a 1 km profile rather than an obsolete 400 m rule', async () => {
    index.facilities = [facility('bus stop 600 m away', 600, 'bus_stop')];
    const point = index.atPoint(n, origin);
    const evidence = index.evidence(point, {}, []);
    const profile = await searchNeighbourhoods(params({ origin, radius: 1000 }));
    expect(evidence.accessibility.value).toBe(1);
    expect(profile.results[0].score.breakdown.find((b) => b.criterion === 'accessibility')?.rawValue).toBe(1);
  });
  it.each([500, 1000, 2000] as const)('uses unrounded distances at the %i m boundary, without moving the address', async (radius) => {
    index.facilities = [facility('inside', radius - 0.2), facility('boundary', radius), facility('outside', radius + 0.2)];
    vi.mocked(searchLocation).mockResolvedValue([{ ...origin, label: origin.address }]);
    const r = await searchNeighbourhoods(params({ q: origin.postal, radius }));
    expect(r.results).toHaveLength(1);
    expect(r.results[0]).toMatchObject({ lat: origin.lat, lng: origin.lng, origin });
    expect(r.results[0].highlights.find((h) => h.category === 'childcare')?.count).toBe(2);
    const point = index.atPoint(n, origin);
    expect(facilitiesNear(point, radius).map((f) => f.id)).toEqual(['inside', 'boundary']);
    expect(haversineM(origin.lat, origin.lng, index.facilities[2].lat, index.facilities[2].lng)).toBeGreaterThan(radius);
    expect(n.lat).toBe(1.3); // analysing one address must not corrupt the shared index.
  });

  it('keeps counts, score evidence and profile at the same origin and selected radius', async () => {
    index.facilities = [facility('near', 300), facility('further', 800)];
    const small = await searchNeighbourhoods(params({ q: 'Test', origin, radius: 500 }));
    const large = await searchNeighbourhoods(params({ q: 'Test', origin, radius: 1000 }));
    const score = (r: typeof small) => r.results[0].score.breakdown.find((b) => b.criterion === 'childcare')!;
    expect(score(small).rawValue).toBe(1); expect(score(large).rawValue).toBe(2);
    const detail = neighbourhoodDetail(n, { ...scoringContext({}), origin, radius: 500 });
    expect(detail).toMatchObject({ lat: origin.lat, lng: origin.lng, origin });
    expect(detail.score.total).toBe(small.results[0].score.total);
    expect(searchLocation).not.toHaveBeenCalled();
  });

  it('includes the actual containing zone even if recommendation filtering excludes it', async () => {
    index.neighbourhoods = [{ ...n, searchable: false }];
    const r = await searchNeighbourhoods(params({ origin }));
    expect(r.results.map((x) => x.id)).toEqual([n.id]);
    expect(r.addressMatch?.neighbourhoodId).toBe(n.id);
  });

  it('uses nearest zone as context outside boundaries but keeps the original coordinate', async () => {
    const point = { ...origin, lat: 1.4 };
    const r = await searchNeighbourhoods(params({ origin: point }));
    expect(r.addressMatch?.neighbourhoodId).toBeNull();
    expect(r.results[0].lat).toBe(1.4);
  });

  it('does not report missing source data as genuine amenities', async () => {
    index.facilities = [facility('offline source', 100)];
    index.sources.get('childcare')!.active = false;
    const r = await searchNeighbourhoods(params({ origin }));
    expect(r.results[0].highlights.find((h) => h.category === 'childcare')).toMatchObject({ count: 0, nearestM: null, state: 'UNAVAILABLE' });
    expect((await searchNeighbourhoods(params({ origin, category: 'childcare', minCount: 1 }))).total).toBe(0);
  });
});

describe('postal and place search', () => {
  it('does not interpret punctuation as a match for every neighbourhood', async () => {
    await expect(searchNeighbourhoods(params({ q: '!!!' }))).rejects.toMatchObject({ status: 400 });
    expect(searchLocation).not.toHaveBeenCalled();
  });
  it.each(['012345',' Singapore 012345 ','S012345','S(012345)','s ( 012345 )'])('preserves leading zero: %s', (query) => {
    expect(singaporePostalInput(query)).toEqual({ postal: '012345', malformed: false });
  });
  it.each(['12345','1234567','S(012345','012345)','012 345'])('rejects malformed postal-only input %s', async (q) => {
    await expect(searchNeighbourhoods(params({ q }))).rejects.toMatchObject({ status: 400 });
    expect(searchLocation).not.toHaveBeenCalled();
  });
  it('asks users to select ambiguous places without producing centroid results', async () => {
    vi.mocked(searchLocation).mockResolvedValue([{ ...origin, label: 'One Place' }, { ...origin, lat: 1.33, postal: '112345', label: 'Other Place' }]);
    expect(await searchNeighbourhoods(params({ q: 'Example Mall' }))).toMatchObject({ matchedBy: 'ambiguous', total: 0, results: [], locationChoices: expect.any(Array) });
  });
  it('keeps named town search working without the provider', async () => {
    expect((await searchNeighbourhoods(params({ q: 'Test Town' }))).matchedBy).toBe('name');
    expect(searchLocation).not.toHaveBeenCalled();
  });
  it('distinguishes a missing postal address from an unavailable provider', async () => {
    vi.mocked(searchLocation).mockResolvedValue([]);
    await expect(searchNeighbourhoods(params({ q: '000000' }))).rejects.toMatchObject({ status: 404 });
    vi.mocked(searchLocation).mockRejectedValue(new Error('Provider offline'));
    await expect(searchNeighbourhoods(params({ q: '000000' }))).rejects.toMatchObject({ status: 503 });
  });
});

describe('public API coordinate validation and consistent facility/profile endpoints', () => {
  it.each([{ originLat: '1.32' }, { originLat: 'NaN', originLng: '103.82', originAddress: 'Place' }, { originLat: '51', originLng: '103.82', originAddress: 'Place' }, { originLat: '1.32', originLng: '103.82' }])('rejects incomplete/invalid origins %j', async (q) => {
    for (const path of ['/api/neighbourhoods', `/api/neighbourhoods/${n.id}`, `/api/neighbourhoods/${n.id}/facilities`]) expect((await request(app).get(path).query(q)).status).toBe(400);
  });
  it('returns the same exact origin and in-radius facilities from the HTTP endpoints', async () => {
    index.facilities = [facility('inside', 499.8), facility('outside', 500.2)];
    const q = { originLat: origin.lat, originLng: origin.lng, originAddress: origin.address, originPostal: origin.postal, radius: 500 };
    const [profile, facilities] = await Promise.all([request(app).get(`/api/neighbourhoods/${n.id}`).query(q), request(app).get(`/api/neighbourhoods/${n.id}/facilities`).query(q)]);
    expect(profile.status).toBe(200); expect(facilities.status).toBe(200);
    expect(profile.body.origin).toEqual(origin);
    expect(facilities.body.map((f: {id: string}) => f.id)).toEqual(['inside']);
  });
});
