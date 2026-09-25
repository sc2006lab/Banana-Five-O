// Pre-projected, simplified geometry for the landing-page map ("Tender Survey" plate). Cached per index build.
import { CRITERIA, DEFAULT_WEIGHTS } from '@famplan/shared';
import { calculateScore } from '../scoring/score.js';
import { index, type NeighbourhoodIndex } from './store.js';

export interface ShowcaseZone {
  id: string;
  name: string;
  planningArea: string;
  family: boolean;
  score: number | null;
  path: string;
  cx: number;
  cy: number;
  petals: (number | null)[] | null;
}

export interface Showcase {
  width: number;
  height: number;
  zones: ShowcaseZone[];
  points: [number, number][];
  best: { id: string; name: string; x: number; y: number; ringsPx: { 500: number; 1000: number; 2000: number } };
  stats: { subzones: number; neighbourhoods: number; facilities: number; earlyCare: number; datasets: number };
  criteria: readonly string[];
}

const LNG0 = 103.6;
const LNG1 = 104.045;
const LAT0 = 1.195;
const LAT1 = 1.475;
const KX = Math.cos((1.35 * Math.PI) / 180);
const WIDTH = 1000;
const SCALE = WIDTH / ((LNG1 - LNG0) * KX);
const HEIGHT = Math.round((LAT1 - LAT0) * SCALE);
const M_PER_DEG = (Math.PI / 180) * 6_371_008.8;

const project = (lng: number, lat: number): [number, number] => [(lng - LNG0) * KX * SCALE, (LAT1 - lat) * SCALE];

/** Douglas–Peucker simplification in projected pixel space. */
export function simplify(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      // Closed rings start and end on the same point: fall back to distance from that point.
      const d =
        len < 1e-9 ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay) : Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function pathFor(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): string {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const parts: string[] = [];
  for (const poly of polys) {
    const ring = simplify(poly[0].map(([x, y]) => project(x, y)), 0.45);
    if (ring.length < 3) continue;
    parts.push('M' + ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z');
  }
  return parts.join('');
}

let cache: { builtAt: Date; value: Showcase } | null = null;

export function buildShowcase(idx: NeighbourhoodIndex = index): Showcase {
  if (cache && cache.builtAt === idx.builtAt) return cache.value;
  const zones: ShowcaseZone[] = idx.neighbourhoods.map((n) => {
    const s = n.searchable ? calculateScore(idx.evidence(n, {}, null), DEFAULT_WEIGHTS, idx.datasetVersions()) : null;
    const [cx, cy] = project(n.lng, n.lat);
    return {
      id: n.id,
      name: n.name,
      planningArea: n.planningArea,
      family: n.searchable,
      score: s?.total ?? null,
      path: pathFor(n.boundary),
      cx: Number(cx.toFixed(1)),
      cy: Number(cy.toFixed(1)),
      petals: s ? s.breakdown.map((b) => (b.normalisedValue === null ? null : Number(b.normalisedValue.toFixed(3)))) : null,
    };
  });
  const early = idx.facilities.filter((f) => f.category === 'childcare' || f.category === 'kindergarten');
  const points = early.map((f) => project(f.lng, f.lat).map((v) => Number(v.toFixed(1))) as [number, number]);
  const fam = zones.filter((z) => z.family && z.score !== null);
  const bestZone = fam.reduce((a, b) => ((b.score ?? 0) > (a.score ?? 0) ? b : a), fam[0]);
  const px = (m: number) => Number(((m / M_PER_DEG) * SCALE).toFixed(2));
  const value: Showcase = {
    width: WIDTH,
    height: HEIGHT,
    zones,
    points,
    best: bestZone
      ? { id: bestZone.id, name: bestZone.name, x: bestZone.cx, y: bestZone.cy, ringsPx: { 500: px(500), 1000: px(1000), 2000: px(2000) } }
      : { id: '', name: '', x: WIDTH / 2, y: HEIGHT / 2, ringsPx: { 500: px(500), 1000: px(1000), 2000: px(2000) } },
    stats: {
      subzones: zones.length,
      neighbourhoods: fam.length,
      facilities: idx.facilities.length,
      earlyCare: early.length,
      datasets: [...idx.sources.values()].filter((s) => s.active).length,
    },
    criteria: CRITERIA,
  };
  cache = { builtAt: idx.builtAt, value };
  return value;
}
