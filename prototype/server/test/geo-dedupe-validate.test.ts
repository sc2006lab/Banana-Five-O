// FR-NBH-03, FR-NBH-04, NFR-DATA-04, FR-RES-01 (validation), data transformation
import { describe, expect, it } from 'vitest';
import { distanceM, haversineM, isInSingapore, pointInBoundary, polygonCentroid, referencePoint, withinRadius } from '../src/lib/geo.js';
import { dedupeFacilities, normaliseName } from '../src/neighbourhoods/dedupe.js';
import { MAX_INVALID_RATIO, ValidationError, datasetChecksum, diffCounts, validateBoundaries, validateFacilities } from '../src/synchronisation/validate.js';
import { parseCsv, parseKmlDescription } from '../src/synchronisation/datagovsg.js';
import { sanitiseError } from '../src/lib/http.js';
import type { FacilityRecord } from '../src/synchronisation/sources.js';

// 1° latitude ≈ 111.195 km on the mean-radius sphere
const M_PER_DEG_LAT = (Math.PI / 180) * 6_371_008.8;

describe('distance', () => {
  it('matches known fixtures', () => {
    expect(haversineM(1.3, 103.8, 1.3, 103.8)).toBe(0);
    expect(distanceM({ lat: 1.3, lng: 103.8 }, { lat: 1.3 + 1000 / M_PER_DEG_LAT, lng: 103.8 })).toBe(1000);
    // Raffles Place MRT → Bishan MRT ≈ 8.8 km
    expect(distanceM({ lat: 1.28393, lng: 103.85143 }, { lat: 1.35092, lng: 103.84825 })).toBeGreaterThan(7400);
  });

  it('radius is inclusive: inside, exactly on, and just outside every supported radius', () => {
    for (const r of [500, 1000, 2000]) {
      expect(withinRadius(r - 1, r)).toBe(true);
      expect(withinRadius(r, r)).toBe(true);
      expect(withinRadius(r + 1, r)).toBe(false);
    }
  });

  it('recognises Singapore coordinates', () => {
    expect(isInSingapore(1.35, 103.82)).toBe(true);
    expect(isInSingapore(0, 0)).toBe(false);
    expect(isInSingapore(NaN, 103.8)).toBe(false);
  });
});

describe('polygon helpers', () => {
  const square: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[103.8, 1.3], [103.81, 1.3], [103.81, 1.31], [103.8, 1.31], [103.8, 1.3]]] };
  it('computes centroid and point-in-polygon', () => {
    const c = polygonCentroid(square);
    expect(c.lat).toBeCloseTo(1.305);
    expect(c.lng).toBeCloseTo(103.805);
    expect(pointInBoundary(1.305, 103.805, square)).toBe(true);
    expect(pointInBoundary(1.32, 103.805, square)).toBe(false);
  });
  it('keeps the reference point inside a crescent-shaped boundary', () => {
    const u: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [[[0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3], [0, 0]].map(([x, y]) => [103.8 + x * 0.001, 1.3 + y * 0.001])],
    };
    const rp = referencePoint(u);
    expect(pointInBoundary(rp.lat, rp.lng, u)).toBe(true);
  });
});

describe('facility deduplication (NFR-DATA-04)', () => {
  const base = { category: 'childcare', lat: 1.3, lng: 103.8 };
  it('normalises names', () => {
    expect(normaliseName('My First Skool @ Blk 123 Pte. Ltd.')).toBe(normaliseName('MY FIRST SKOOL BLK 123'));
  });
  it('merges exact and near duplicates across sources', () => {
    const g = dedupeFacilities([
      { ...base, id: '1', name: 'Little Seeds Preschool Pte Ltd', sourceId: 'a' },
      { ...base, id: '2', name: 'LITTLE SEEDS PRESCHOOL', sourceId: 'b', lat: 1.3002 }, // ~22 m away
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].map((x) => x.id).sort()).toEqual(['1', '2']);
  });
  it('keeps distinct co-located facilities, renamed facilities far apart, and different categories', () => {
    const g = dedupeFacilities([
      { ...base, id: '1', name: 'Alpha Childcare', sourceId: 'a' },
      { ...base, id: '2', name: 'Beta Childcare', sourceId: 'b' }, // co-located, different name
      { ...base, id: '3', name: 'Alpha Childcare', sourceId: 'b', lat: 1.31 }, // same name, 1.1 km away
      { ...base, id: '4', name: 'Alpha Childcare', sourceId: 'b', category: 'kindergarten' },
    ]);
    expect(g).toHaveLength(4);
  });
});

const rec = (i: number, over: Partial<FacilityRecord> = {}): FacilityRecord => ({
  sourceRecordId: `r${i}`,
  name: `Facility ${i}`,
  category: 'clinic',
  address: null,
  postalCode: null,
  lat: 1.3 + i * 1e-5,
  lng: 103.8,
  details: {},
  ...over,
});

describe('candidate validation', () => {
  const rules = { minRecords: 10, categories: ['clinic'], previousCount: null };
  it('accepts a clean dataset', () => {
    expect(validateFacilities(Array.from({ length: 20 }, (_, i) => rec(i)), rules)).toHaveLength(20);
  });
  it('rejects too few records', () => {
    expect(() => validateFacilities([rec(1)], rules)).toThrow(ValidationError);
  });
  it('rejects when invalid rows exceed the limit and drops them otherwise', () => {
    const good = Array.from({ length: 100 }, (_, i) => rec(i));
    const bad = Array.from({ length: 10 }, (_, i) => rec(1000 + i, { lat: 0 }));
    expect(() => validateFacilities([...good, ...bad], rules)).toThrow(/failed validation/);
    const few = Array.from({ length: Math.floor(100 * MAX_INVALID_RATIO) - 1 }, (_, i) => rec(2000 + i, { category: 'mrt' }));
    expect(validateFacilities([...good, ...few], rules)).toHaveLength(100);
  });
  it('rejects a suspicious drop against the active dataset', () => {
    const recs = Array.from({ length: 40 }, (_, i) => rec(i));
    expect(() => validateFacilities(recs, { ...rules, previousCount: 100 })).toThrow(/keeping the previous dataset/);
  });
  it('drops duplicate source ids', () => {
    const recs = [...Array.from({ length: 20 }, (_, i) => rec(i)), rec(1)];
    expect(validateFacilities(recs, rules)).toHaveLength(20);
  });
  it('validates boundaries', () => {
    const b = { id: 'AB1', name: 'A', planningArea: 'P', region: 'R', geometry: { type: 'Polygon' as const, coordinates: [] }, areaSqm: 5 };
    expect(validateBoundaries([b], { minRecords: 1, categories: [], previousCount: null })).toHaveLength(1);
    expect(() => validateBoundaries([{ ...b, id: 'bad id' }], { minRecords: 1, categories: [], previousCount: null })).toThrow();
  });
  it('checksums are order independent and diffs count added/changed/removed', () => {
    const a = [rec(1), rec(2)];
    expect(datasetChecksum(a)).toBe(datasetChecksum([rec(2), rec(1)]));
    expect(datasetChecksum(a)).not.toBe(datasetChecksum([rec(1), rec(2, { name: 'x' })]));
    const d = diffCounts(new Map([['a', '1'], ['b', '2'], ['c', '3']]), new Map([['a', '1'], ['b', 'X'], ['d', '4']]));
    expect(d).toEqual({ added: 1, changed: 1, removed: 1 });
  });
});

describe('transformation helpers', () => {
  it('parses KML attribute tables', () => {
    const html = "<table><tr><th>CENTRE_NAME</th> <td>LITTLE &amp; BIG</td></tr><tr><th>CENTRE_CODE</th> <td>PT1</td></tr></table>";
    expect(parseKmlDescription(html)).toEqual({ CENTRE_NAME: 'LITTLE & BIG', CENTRE_CODE: 'PT1' });
    expect(parseKmlDescription(undefined)).toEqual({});
  });
  it('parses quoted CSV with embedded commas and newlines', () => {
    const rows = parseCsv('a,b,c\n1,"x, y",3\r\n4,"multi\nline","q""uote"\n');
    expect(rows).toEqual([
      { a: '1', b: 'x, y', c: '3' },
      { a: '4', b: 'multi\nline', c: 'q"uote' },
    ]);
  });
  it('sanitises secrets from error messages', () => {
    const s = sanitiseError(new Error('GET https://s3.example.com/x.geojson?X-Amz-Security-Token=abc&sig=1 failed; password=hunter2; Bearer abc.def'));
    expect(s).not.toContain('abc&sig');
    expect(s).not.toContain('hunter2');
    expect(s).not.toContain('abc.def');
  });
});
