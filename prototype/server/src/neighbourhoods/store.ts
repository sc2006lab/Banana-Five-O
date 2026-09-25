// In-memory neighbourhood index built from the active validated snapshots in PostgreSQL.
// Searches read validated local data only — never live public APIs (tech-stack recommendation, NFR-REL-03).
import {
  AMENITY_CATEGORIES,
  CRITERIA,
  STALE_AFTER_DAYS,
  type AmenityCategory,
  type AvailabilityState,
  type Criterion,
  type ProximityRadius,
  type Provenance,
} from '@famplan/shared';
import { prisma } from '../db.js';
import { distanceM, haversineM, pointInBoundary } from '../lib/geo.js';
import { COMMUTE_MODEL, SCORING_CONFIG, estimateMinutes } from '../scoring/config.js';
import type { ScoringEvidence } from '../scoring/score.js';
import { SOURCES, type FacilitySource } from '../synchronisation/sources.js';
import { dedupeFacilities } from './dedupe.js';

export const MAX_RADIUS = 2000;

/** Planning areas without meaningful family housing (water catchments, industrial estates, islands, airport/port). */
export const NON_RESIDENTIAL_AREAS = new Set(
  [
    'Central Water Catchment', 'Western Water Catchment', 'Changi Bay', 'Lim Chu Kang', 'Mandai', 'Marina East', 'Marina South',
    'North-Eastern Islands', 'Pioneer', 'Seletar', 'Simpang', 'Southern Islands', 'Straits View', 'Sungei Kadut', 'Tuas',
    'Western Islands', 'Paya Lebar', 'Changi', 'Boon Lay', 'Museum', 'Singapore River', 'Downtown Core', 'Outram', 'Orchard',
    'Rochor', 'Newton', 'Tanglin',
  ].map((s) => s.toUpperCase()),
);
/** A subzone is treated as a family neighbourhood when at least this many early-childhood centres lie inside it. */
export const MIN_EARLY_CHILDHOOD_IN_BOUNDARY = 3;

export interface IndexedFacility {
  id: string;
  name: string;
  category: AmenityCategory;
  address: string | null;
  lat: number;
  lng: number;
  sourceIds: string[];
  details: Record<string, string>;
}

interface Near {
  f: number;
  d: number;
}

export interface IndexedNeighbourhood {
  id: string;
  name: string;
  planningArea: string;
  region: string;
  lat: number;
  lng: number;
  boundaryBasis: string;
  boundary: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  searchable: boolean;
  near: Record<AmenityCategory, Near[]>; // within MAX_RADIUS, ascending distance
  nearest: Record<AmenityCategory, Near | null>; // regardless of radius
}

interface SourceState {
  def: FacilitySource | (typeof SOURCES)[number];
  provenance: Provenance;
  active: boolean;
  coverageNote: string | null;
  version: number | null;
}

export class NeighbourhoodIndex {
  facilities: IndexedFacility[] = [];
  neighbourhoods: IndexedNeighbourhood[] = [];
  byId = new Map<string, IndexedNeighbourhood>();
  sources = new Map<string, SourceState>();
  builtAt = new Date();

  get searchable() {
    return this.neighbourhoods.filter((n) => n.searchable);
  }

  datasetVersions(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, s] of this.sources) if (s.version !== null) out[id] = s.version;
    return out;
  }

  sourcesForCategory(cat: AmenityCategory): SourceState[] {
    return [...this.sources.values()].filter((s) => s.def.kind === 'facility' && (s.def.categories as string[]).includes(cat));
  }

  /** Category-level availability (FR-NBH-09): distinguishes unavailable, incomplete and stale from a real zero. */
  categoryState(cat: AmenityCategory): { state: AvailabilityState; reason?: string; provenance: Provenance[] } {
    const srcs = this.sourcesForCategory(cat);
    const provenance = srcs.map((s) => s.provenance);
    const active = srcs.filter((s) => s.active);
    if (active.length === 0) return { state: 'UNAVAILABLE', reason: 'Source data is unavailable; no validated dataset has been loaded yet.', provenance };
    if (active.length < srcs.length)
      return { state: 'INCOMPLETE', reason: `${srcs.length - active.length} of ${srcs.length} sources for this category are unavailable.`, provenance };
    const note = active.map((s) => s.coverageNote).find(Boolean);
    if (note) return { state: 'INCOMPLETE', reason: note, provenance };
    if (active.some((s) => s.provenance.stale))
      return { state: 'STALE', reason: `Cached data is older than ${STALE_AFTER_DAYS} days and awaiting a newer validated dataset.`, provenance };
    return { state: 'AVAILABLE', provenance };
  }

  countWithin(n: IndexedNeighbourhood, cats: AmenityCategory[], radius: number): number {
    return cats.reduce((s, c) => s + n.near[c].filter((x) => x.d <= radius).length, 0);
  }

  nearestOf(n: IndexedNeighbourhood, cats: AmenityCategory[]): Near | null {
    let best: Near | null = null;
    for (const c of cats) {
      const x = n.nearest[c];
      if (x && (!best || x.d < best.d)) best = x;
    }
    return best;
  }

  /** Build raw criterion evidence for the scoring module (FR-DEC-01, FR-DEC-03). */
  evidence(
    n: IndexedNeighbourhood,
    thresholds: Partial<Record<AmenityCategory, ProximityRadius>>,
    destination: { lat: number; lng: number; label: string } | null,
  ): ScoringEvidence {
    const out = {} as ScoringEvidence;
    for (const c of CRITERIA as readonly Criterion[]) {
      const rule = SCORING_CONFIG.criteria[c];
      if (rule.kind === 'minutes') {
        if (!destination) {
          out[c] = { value: null, label: 'No priority destination set', missingReason: 'Add a priority destination to include commute time.' };
        } else {
          const min = estimateMinutes(distanceM(n, destination), 'pt');
          out[c] = { value: min, label: `~${min} min to ${destination.label} (estimate)` };
        }
        continue;
      }
      const states = rule.categories.map((cat) => this.categoryState(cat));
      if (states.every((s) => s.state === 'UNAVAILABLE')) {
        out[c] = { value: null, label: 'Source unavailable', missingReason: states[0].reason };
        continue;
      }
      if (rule.kind === 'count') {
        const radius = (rule.categories.map((cat) => thresholds[cat]).find(Boolean) as number | undefined) ?? rule.defaultRadiusM;
        const count = this.countWithin(n, rule.categories, radius);
        out[c] = { value: count, label: `${count} within ${radius >= 1000 ? `${radius / 1000} km` : `${radius} m`}` };
      } else {
        const near = this.nearestOf(n, rule.categories);
        out[c] = near
          ? { value: near.d, label: `Nearest ${near.d >= 1000 ? `${(near.d / 1000).toFixed(1)} km` : `${near.d} m`}` }
          : { value: null, label: 'No facility found', missingReason: 'No facility with coordinates was found.' };
      }
    }
    return out;
  }

  commuteMinutes(n: IndexedNeighbourhood, dest: { lat: number; lng: number } | null): number | null {
    return dest ? estimateMinutes(distanceM(n, dest), 'pt') : null;
  }
}

export let index = new NeighbourhoodIndex();

function provenanceFor(
  def: (typeof SOURCES)[number],
  reg: { publisherUpdatedAt: Date | null } | undefined,
  snap: { validatedAt: Date; version: number } | null,
  now: Date,
): Provenance {
  const ageDays = snap ? Math.floor((now.getTime() - snap.validatedAt.getTime()) / 86_400_000) : null;
  return {
    sourceId: def.id,
    provider: def.provider,
    datasetName: def.datasetName,
    publisherUpdatedAt: reg?.publisherUpdatedAt?.toISOString() ?? null,
    retrievedAt: snap?.validatedAt.toISOString() ?? null,
    datasetVersion: snap?.version ?? null,
    ageDays,
    stale: ageDays !== null && ageDays > STALE_AFTER_DAYS,
    licence: def.licence,
  };
}

export async function buildIndex(now = new Date()): Promise<NeighbourhoodIndex> {
  const started = Date.now();
  const idx = new NeighbourhoodIndex();
  const [regs, snaps] = await Promise.all([
    prisma.dataSourceRegistry.findMany(),
    prisma.datasetSnapshot.findMany({ where: { active: true } }),
  ]);
  for (const def of SOURCES) {
    const snap = snaps.find((s) => s.sourceId === def.id) ?? null;
    idx.sources.set(def.id, {
      def,
      provenance: provenanceFor(def, regs.find((r) => r.id === def.id), snap, now),
      active: Boolean(snap),
      coverageNote: snap?.coverageNote ?? null,
      version: snap?.version ?? null,
    });
  }

  const facilitySnapIds = snaps.filter((s) => SOURCES.find((d) => d.id === s.sourceId)?.kind === 'facility').map((s) => s.id);
  const snapSource = new Map(snaps.map((s) => [s.id, s.sourceId]));
  const rows = await prisma.facility.findMany({
    where: { snapshotId: { in: facilitySnapIds } },
    select: { id: true, name: true, category: true, address: true, lat: true, lng: true, details: true, snapshotId: true },
  });
  const groups = dedupeFacilities(rows.map((r) => ({ ...r, sourceId: snapSource.get(r.snapshotId)! })));
  idx.facilities = groups.map((g) => {
    const primary = g.find((r) => r.address) ?? g[0];
    return {
      id: g[0].id,
      name: primary.name,
      category: primary.category as AmenityCategory,
      address: primary.address,
      lat: g[0].lat,
      lng: g[0].lng,
      sourceIds: [...new Set(g.map((r) => r.sourceId))],
      details: Object.assign({}, ...g.map((r) => r.details as Record<string, string>)),
    };
  });

  // Coarse spatial grid (~0.02° ≈ 2.2 km cells) to limit distance calculations.
  const cell = 0.02;
  const grid = new Map<string, number[]>();
  idx.facilities.forEach((f, i) => {
    const k = `${Math.floor(f.lat / cell)}:${Math.floor(f.lng / cell)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
  });
  const nearestByCat = new Map<AmenityCategory, number[]>();
  for (const c of AMENITY_CATEGORIES) nearestByCat.set(c, []);
  idx.facilities.forEach((f, i) => nearestByCat.get(f.category)!.push(i));

  const nbhds = await prisma.neighbourhood.findMany({ orderBy: { name: 'asc' } });
  for (const n of nbhds) {
    const near = Object.fromEntries(AMENITY_CATEGORIES.map((c) => [c, [] as Near[]])) as Record<AmenityCategory, Near[]>;
    const gy = Math.floor(n.refLat / cell);
    const gx = Math.floor(n.refLng / cell);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        for (const i of grid.get(`${gy + dy}:${gx + dx}`) ?? []) {
          const f = idx.facilities[i];
          const d = Math.round(haversineM(n.refLat, n.refLng, f.lat, f.lng));
          if (d <= MAX_RADIUS) near[f.category].push({ f: i, d });
        }
    for (const c of AMENITY_CATEGORIES) near[c].sort((a, b) => a.d - b.d || idx.facilities[a.f].name.localeCompare(idx.facilities[b.f].name));
    const nearest = Object.fromEntries(
      AMENITY_CATEGORIES.map((c) => {
        if (near[c].length) return [c, near[c][0]];
        let best: Near | null = null;
        for (const i of nearestByCat.get(c)!) {
          const f = idx.facilities[i];
          const d = Math.round(haversineM(n.refLat, n.refLng, f.lat, f.lng));
          if (!best || d < best.d) best = { f: i, d };
        }
        return [c, best];
      }),
    ) as Record<AmenityCategory, Near | null>;

    const boundary = n.boundary as unknown as GeoJSON.Polygon | GeoJSON.MultiPolygon;
    const earlyChildhoodInside = [...near.childcare, ...near.kindergarten].filter((x) =>
      pointInBoundary(idx.facilities[x.f].lat, idx.facilities[x.f].lng, boundary),
    ).length;
    const entry: IndexedNeighbourhood = {
      id: n.id,
      name: n.name,
      planningArea: n.planningArea,
      region: n.region,
      lat: n.refLat,
      lng: n.refLng,
      boundaryBasis: n.boundaryBasis,
      boundary,
      searchable: !NON_RESIDENTIAL_AREAS.has(n.planningArea.toUpperCase()) && earlyChildhoodInside >= MIN_EARLY_CHILDHOOD_IN_BOUNDARY,
      near,
      nearest,
    };
    idx.neighbourhoods.push(entry);
    idx.byId.set(entry.id, entry);
  }
  idx.builtAt = now;
  console.log(
    `[index] ${idx.facilities.length} facilities (${rows.length} source records), ${idx.searchable.length}/${idx.neighbourhoods.length} family neighbourhoods in ${Date.now() - started} ms`,
  );
  return idx;
}

export async function rebuildIndex() {
  index = await buildIndex();
}

export { COMMUTE_MODEL };
