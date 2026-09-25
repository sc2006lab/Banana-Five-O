// Distance and geometry helpers. Distances are great-circle (haversine) metres between WGS84 points,
// rounded to the nearest metre — the documented calculation basis for FR-NBH-04.
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';

export const DISTANCE_BASIS =
  'Straight-line (great-circle) distance from the neighbourhood reference point, rounded to the nearest metre.';

const R = 6_371_008.8; // mean Earth radius (m)
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return Math.round(haversineM(a.lat, a.lng, b.lat, b.lng));
}

/** Inclusive radius check: a facility exactly on the boundary is inside (FR-NBH-03). */
export function withinRadius(distance: number, radius: number): boolean {
  return distance <= radius;
}

export const SG_BOUNDS = { minLat: 1.15, maxLat: 1.48, minLng: 103.59, maxLng: 104.1 };

export function isInSingapore(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= SG_BOUNDS.minLat &&
    lat <= SG_BOUNDS.maxLat &&
    lng >= SG_BOUNDS.minLng &&
    lng <= SG_BOUNDS.maxLng
  );
}

type Ring = number[][];
type PolygonCoords = Ring[];

function ringAreaCentroid(ring: Ring): { a: number; cx: number; cy: number } {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j];
    const [x1, y1] = ring[i];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  a /= 2;
  return { a, cx: a === 0 ? 0 : cx / (6 * a), cy: a === 0 ? 0 : cy / (6 * a) };
}

/** Area-weighted centroid of the largest polygon's outer ring (lng/lat plane — adequate at Singapore's scale). */
export function polygonCentroid(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): { lat: number; lng: number } {
  const polys: PolygonCoords[] = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let best = { a: 0, cx: 0, cy: 0 };
  for (const p of polys) {
    const r = ringAreaCentroid(p[0]);
    if (Math.abs(r.a) > Math.abs(best.a)) best = r;
  }
  return { lat: best.cy, lng: best.cx };
}

/**
 * Reference point: area centroid when it lies inside the boundary; otherwise the interior point
 * closest to the centroid on a sampling grid (keeps the point inside crescent-shaped zones).
 */
export function referencePoint(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): { lat: number; lng: number; basis: string } {
  const c = polygonCentroid(geom);
  if (booleanPointInPolygon([c.lng, c.lat], geom))
    return { ...c, basis: 'Area-weighted centroid of the URA Master Plan 2019 subzone boundary.' };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const polys: PolygonCoords[] = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const p of polys) for (const [x, y] of p[0]) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  let best: { lat: number; lng: number } | null = null;
  let bestD = Infinity;
  const N = 40;
  for (let i = 0; i <= N; i++)
    for (let j = 0; j <= N; j++) {
      const x = minX + ((maxX - minX) * i) / N;
      const y = minY + ((maxY - minY) * j) / N;
      if (!booleanPointInPolygon([x, y], geom)) continue;
      const d = haversineM(y, x, c.lat, c.lng);
      if (d < bestD) { bestD = d; best = { lat: y, lng: x }; }
    }
  return {
    ...(best ?? c),
    basis: 'Interior point nearest the area-weighted centroid of the URA Master Plan 2019 subzone boundary (centroid falls outside the boundary).',
  };
}

export function pointInBoundary(lat: number, lng: number, geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): boolean {
  return booleanPointInPolygon([lng, lat], geom);
}

/** Approximate polygon area (m²) using an equirectangular projection around Singapore. */
export function polygonAreaSqm(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): number {
  const polys: PolygonCoords[] = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const kx = 111_320 * Math.cos(toRad(1.35));
  const ky = 110_574;
  let total = 0;
  for (const p of polys)
    p.forEach((ring, idx) => {
      let a = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * kx * (ring[i][1] * ky) - ring[i][0] * kx * (ring[j][1] * ky);
      total += (idx === 0 ? 1 : -1) * Math.abs(a / 2);
    });
  return total;
}
