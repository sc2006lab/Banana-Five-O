// Discovery, profile and comparison logic (UC-3.1, UC-4.1, UC-4.2, UC-6.1, UC-6.2).
import {
  AMENITY_CATEGORIES,
  CRITERIA,
  DEFAULT_WEIGHTS,
  LIMITATION_EDUCATION,
  LIMITATION_PROFILE,
  LIMITATION_SCORE,
  STAGE_CATEGORIES,
  type AmenityCategory,
  type AmenitySummaryDto,
  type CriterionWeights,
  type FacilityDto,
  type FamilyStage,
  type NeighbourhoodDetail,
  type NeighbourhoodSummary,
  type ProximityRadius,
  type SearchResponse,
} from '@famplan/shared';
import { DISTANCE_BASIS, pointInBoundary } from '../lib/geo.js';
import { HttpError } from '../lib/http.js';
import { calculateScore } from '../scoring/score.js';
import { searchAddress } from '../travel/onemap.js';
import { index, type IndexedNeighbourhood } from './store.js';

export interface ScoringContext {
  weights: CriterionWeights;
  thresholds: Partial<Record<AmenityCategory, ProximityRadius>>;
  destination: { lat: number; lng: number; label: string } | null;
  radius: ProximityRadius;
}

export function scoringContext(q: Record<string, unknown>): ScoringContext {
  const weights = Object.fromEntries(
    CRITERIA.map((c) => [c, typeof q[`w_${c}`] === 'number' ? (q[`w_${c}`] as number) : DEFAULT_WEIGHTS[c]]),
  ) as CriterionWeights;
  return {
    weights,
    thresholds: (q.th as ScoringContext['thresholds']) ?? {},
    destination:
      typeof q.destLat === 'number' && typeof q.destLng === 'number'
        ? { lat: q.destLat, lng: q.destLng, label: (q.destLabel as string) || 'destination' }
        : null,
    radius: ((q.radius as number) ?? 1000) as ProximityRadius,
  };
}

export function summarise(n: IndexedNeighbourhood, ctx: ScoringContext, category?: AmenityCategory): NeighbourhoodSummary {
  const score = calculateScore(index.evidence(n, ctx.thresholds, ctx.destination), ctx.weights, index.datasetVersions());
  const highlights = AMENITY_CATEGORIES.map((c) => ({
    category: c,
    count: index.countWithin(n, [c], ctx.radius),
    nearestM: n.nearest[c]?.d ?? null,
  }));
  return {
    id: n.id,
    name: n.name,
    planningArea: n.planningArea,
    region: n.region,
    lat: n.lat,
    lng: n.lng,
    score,
    coverage: highlights.filter((h) => h.count > 0).length,
    highlights,
    commuteMin: index.commuteMinutes(n, ctx.destination),
    nearestSelectedM: category ? (n.nearest[category]?.d ?? null) : null,
  };
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Town / planning-area / subzone-name match with tolerance for small spelling variants (FR-DISC-01). */
export function nameMatches(n: { name: string; planningArea: string; region: string }, q: string): boolean {
  const nq = norm(q);
  if (!nq) return true;
  const fields = [n.name, n.planningArea, n.region.replace(/ Region$/, '')].map(norm);
  if (fields.some((f) => f.includes(nq))) return true;
  if (nq.length < 5) return false;
  const tol = nq.length >= 8 ? 2 : 1;
  return fields.some((f) => levenshtein(f, nq) <= tol || (f.length > nq.length && levenshtein(f.slice(0, nq.length), nq) <= tol));
}

export interface SearchParams extends ScoringContext {
  q: string;
  areas: string[];
  stages: FamilyStage[];
  category?: AmenityCategory;
  minCount?: number;
  maxNearest?: number;
  maxCommute?: number;
  sort: 'score' | 'nearest' | 'commute' | 'coverage';
  order?: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export async function searchNeighbourhoods(p: SearchParams): Promise<SearchResponse> {
  let pool = index.searchable;
  let matchedBy: SearchResponse['matchedBy'] = 'all';
  let addressMatch: SearchResponse['addressMatch'];

  if (p.q) {
    const byName = pool.filter((n) => nameMatches(n, p.q));
    const looksLikeAddress = /\d/.test(p.q);
    if (byName.length && !looksLikeAddress) {
      pool = byName;
      matchedBy = 'name';
    } else {
      // Address or postal code: geocode with OneMap, then rank neighbourhoods around the point.
      let hits;
      try {
        hits = await searchAddress(p.q, 1);
      } catch {
        if (byName.length) {
          pool = byName;
          matchedBy = 'name';
          hits = null;
        } else
          throw new HttpError(503, 'Address search is temporarily unavailable. Search by town or area name instead.', {
            q: 'Try a town, planning area or estate name.',
          });
      }
      if (hits) {
        const hit = hits[0];
        if (!hit) {
          pool = byName;
          matchedBy = 'name';
        } else {
          const containing = index.neighbourhoods.find((n) => pointInBoundary(hit.lat, hit.lng, n.boundary)) ?? null;
          addressMatch = { address: hit.address, lat: hit.lat, lng: hit.lng, neighbourhoodId: containing?.id ?? null };
          pool = pool
            .map((n) => ({ n, d: Math.hypot(n.lat - hit.lat, (n.lng - hit.lng) * Math.cos((hit.lat * Math.PI) / 180)) * 111_320 }))
            .filter((x) => x.d <= 3000 || x.n.id === containing?.id)
            .sort((a, b) => a.d - b.d)
            .map((x) => x.n);
          if (containing) pool = [containing, ...pool.filter((n) => n !== containing)];
          matchedBy = 'address';
        }
      }
    }
  }

  if (p.areas.length) {
    const set = new Set(p.areas.map((a) => a.toUpperCase()));
    pool = pool.filter((n) => set.has(n.planningArea.toUpperCase()));
  }
  for (const stage of p.stages) {
    const cats = STAGE_CATEGORIES[stage];
    pool = pool.filter((n) => index.countWithin(n, cats, p.radius) > 0);
  }
  if (p.category && p.minCount !== undefined) pool = pool.filter((n) => index.countWithin(n, [p.category!], p.radius) >= p.minCount!);
  if (p.category && p.maxNearest !== undefined) pool = pool.filter((n) => (n.nearest[p.category!]?.d ?? Infinity) <= p.maxNearest!);
  if (p.maxCommute !== undefined) pool = pool.filter((n) => (index.commuteMinutes(n, p.destination) ?? Infinity) <= p.maxCommute!);

  let results = pool.map((n) => summarise(n, p, p.category));
  if (matchedBy !== 'address' || p.sort !== 'score' || p.order) {
    const dir = p.order ?? (p.sort === 'score' || p.sort === 'coverage' ? 'desc' : 'asc');
    const key = (r: NeighbourhoodSummary): number | null =>
      p.sort === 'score' ? r.score.total : p.sort === 'coverage' ? r.coverage : p.sort === 'commute' ? r.commuteMin : r.nearestSelectedM;
    // Unavailable values placed last regardless of direction; ties broken by name then id (stable pagination).
    results = results.sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (ka === null && kb !== null) return 1;
      if (kb === null && ka !== null) return -1;
      if (ka !== null && kb !== null && ka !== kb) return dir === 'asc' ? ka - kb : kb - ka;
      return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });
  }
  const total = results.length;
  const start = (p.page - 1) * p.pageSize;
  return {
    total,
    page: p.page,
    pageSize: p.pageSize,
    radius: p.radius,
    results: results.slice(start, start + p.pageSize),
    matchedBy,
    addressMatch,
    limitation: LIMITATION_PROFILE,
  };
}

export function getNeighbourhood(id: string): IndexedNeighbourhood {
  const n = index.byId.get(id);
  if (!n) throw new HttpError(404, 'We could not find that neighbourhood. It may have been removed in a data update.');
  return n;
}

export function amenitySummaries(n: IndexedNeighbourhood, radius: ProximityRadius): AmenitySummaryDto[] {
  return AMENITY_CATEGORIES.map((c) => {
    const st = index.categoryState(c);
    const within = n.near[c].filter((x) => x.d <= radius);
    const nearest = within[0] ? index.facilities[within[0].f] : null;
    const state = st.state === 'UNAVAILABLE' ? 'UNAVAILABLE' : within.length === 0 ? (st.state === 'AVAILABLE' ? 'NO_MATCH' : st.state) : st.state;
    return {
      category: c,
      matchedCount: st.state === 'UNAVAILABLE' ? 0 : within.length,
      nearest: nearest ? { id: nearest.id, name: nearest.name, distanceM: within[0].d } : null,
      state,
      stateReason:
        state === 'NO_MATCH'
          ? `No ${c.replace('_', ' ')} found within ${radius} m of the reference point.`
          : st.reason,
      provenance: st.provenance,
    };
  });
}

export function facilitiesNear(n: IndexedNeighbourhood, radius: ProximityRadius, category?: AmenityCategory): FacilityDto[] {
  const cats = category ? [category] : AMENITY_CATEGORIES;
  const out: FacilityDto[] = [];
  for (const c of cats) {
    if (index.categoryState(c).state === 'UNAVAILABLE') continue;
    for (const x of n.near[c]) {
      if (x.d > radius) break;
      const f = index.facilities[x.f];
      out.push({ id: f.id, name: f.name, category: f.category, address: f.address, lat: f.lat, lng: f.lng, distanceM: x.d, sourceId: f.sourceIds.join(', '), details: f.details });
    }
  }
  return out.sort((a, b) => a.distanceM - b.distanceM || a.name.localeCompare(b.name));
}

export function neighbourhoodDetail(n: IndexedNeighbourhood, ctx: ScoringContext): NeighbourhoodDetail {
  const boundarySource = index.sources.get('ura-subzones');
  return {
    id: n.id,
    name: n.name,
    planningArea: n.planningArea,
    region: n.region,
    lat: n.lat,
    lng: n.lng,
    boundaryBasis: `URA Master Plan 2019 subzone ${n.id} (${n.name}, ${n.planningArea} planning area).`,
    referencePointBasis: `${n.boundaryBasis} ${DISTANCE_BASIS}`,
    boundary: n.boundary,
    radius: ctx.radius,
    amenities: amenitySummaries(n, ctx.radius),
    score: calculateScore(index.evidence(n, ctx.thresholds, ctx.destination), ctx.weights, index.datasetVersions()),
    provenance: boundarySource ? [boundarySource.provenance] : [],
    limitations: [LIMITATION_PROFILE, LIMITATION_EDUCATION, LIMITATION_SCORE],
  };
}
