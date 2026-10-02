// OneMap (Singapore Land Authority) adapter: address search/geocoding and routing.
// OneMap documents token authentication for search and routing. Public search responses
// are accepted when the provider serves them; configured credentials authenticate both.
import type { GeocodeResult } from '@famplan/shared';
import { config } from '../config.js';
import { fetchWithTimeout } from '../synchronisation/datagovsg.js';
import { prisma } from '../db.js';
import { isInSingapore } from '../lib/geo.js';
import { postalCode } from './postal.js';

const BASE = 'https://www.onemap.gov.sg';

export class OneMapAuthenticationError extends Error {
  constructor() {
    super('OneMap authentication is required. Configure valid OneMap credentials.');
    this.name = 'OneMapAuthenticationError';
  }
}

/** Health of the live dependency, surfaced on the administration page. */
export const onemapHealth = {
  lastOkAt: null as Date | null,
  lastErrorAt: null as Date | null,
  lastError: null as string | null,
};

function markOk() {
  onemapHealth.lastOkAt = new Date();
}
function markError(msg: string) {
  onemapHealth.lastErrorAt = new Date();
  onemapHealth.lastError = msg.slice(0, 200);
}

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(Mrt|Lrt|Hdb|Moe|Pcf|Cc)\b/g, (m) => m.toUpperCase())
    .replace(/\b([A-Z][a-z]{1,2})(\d{1,2})\b/g, (_m, a: string, n: string) => a.toUpperCase() + n);

let lastCall = 0;
async function throttle(minGapMs = 260) {
  const wait = lastCall + minGapMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

export async function searchAddress(q: string, limit = 6): Promise<GeocodeResult[]> {
  const postal = postalCode(q);
  if (postal) q = postal;
  const url = `${BASE}/api/common/elastic/search?searchVal=${encodeURIComponent(q)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    await throttle(attempt === 0 ? 260 : 1500 * attempt);
    try {
      const headers: Record<string, string> = routingConfigured() ? { Authorization: await getToken() } : {};
      const res = await fetchWithTimeout(url, { headers }, 8_000);
      if (res.status === 401 || res.status === 403) throw new OneMapAuthenticationError();
      if (!res.ok) throw new Error(`OneMap search HTTP ${res.status}`);
      const body = (await res.json()) as { results?: any[]; error?: unknown };
      if (body.error && /token|auth|forbidden/i.test(String(body.error))) throw new OneMapAuthenticationError();
      if (body.error || !Array.isArray(body.results))
        throw new Error('OneMap search did not return valid results. Configure valid OneMap credentials if authentication is required.');
      markOk();
      return (body.results ?? [])
        .map((r) => ({
          label: titleCase(r.SEARCHVAL ?? r.ADDRESS ?? ''),
          address: titleCase(r.ADDRESS ?? ''),
          postal: r.POSTAL && r.POSTAL !== 'NIL' ? r.POSTAL : null,
          lat: Number(r.LATITUDE),
          lng: Number(r.LONGITUDE),
        }))
        .filter((r) => isInSingapore(r.lat, r.lng) && (!postal || r.postal === postal))
        .slice(0, limit);
    } catch (e) {
      if (e instanceof OneMapAuthenticationError) {
        token = null;
        markError(e.message);
        throw e; // Retrying without different credentials cannot fix an authentication rejection.
      }
      lastErr = (e as Error).message;
    }
  }
  markError(lastErr);
  throw new Error(`OneMap address search is unavailable right now (${lastErr}).`);
}

/** Residential postal search uses the same expiring cache as school geocoding. */
export async function searchLocation(q: string, limit = 6): Promise<GeocodeResult[]> {
  const postal = postalCode(q);
  if (!postal) return searchAddress(q, limit);
  const hit = await geocodeCached(`postal:${postal}`, postal);
  return hit ? [{ ...hit, postal, label: hit.address }] : [];
}

/** Positive matches are refreshed weekly; empty results daily, so relocations can be picked up. */
export async function geocodeCached(key: string, query: string): Promise<{ lat: number; lng: number; address: string } | null> {
  const hit = await prisma.geocodeCache.findUnique({ where: { key } });
  const maxAge = hit?.lat !== null && hit?.lng !== null ? 7 * 86_400_000 : 86_400_000;
  if (hit && Date.now() - hit.retrievedAt.getTime() < maxAge)
    return hit.lat !== null && hit.lng !== null ? { lat: hit.lat, lng: hit.lng, address: hit.address ?? '' } : null;
  const results = await searchAddress(query, 1);
  const r = results[0] ?? null;
  await prisma.geocodeCache.upsert({
    where: { key },
    create: { key, lat: r?.lat ?? null, lng: r?.lng ?? null, address: r?.address ?? null },
    update: { lat: r?.lat ?? null, lng: r?.lng ?? null, address: r?.address ?? null, retrievedAt: new Date() },
  });
  return r ? { lat: r.lat, lng: r.lng, address: r.address } : null;
}

// ───────────── Routing ─────────────

let token: { value: string; expiresAt: number } | null = null;

export function routingConfigured(): boolean {
  return Boolean(config.onemap.accessToken || (config.onemap.email && config.onemap.password));
}

async function getToken(): Promise<string> {
  if (config.onemap.accessToken) return config.onemap.accessToken;
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const res = await fetchWithTimeout(
    `${BASE}/api/auth/post/getToken`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: config.onemap.email, password: config.onemap.password }) },
    8_000,
  );
  if (res.status === 401 || res.status === 403) throw new OneMapAuthenticationError();
  if (!res.ok) throw new Error(`OneMap authentication failed (HTTP ${res.status})`);
  const body = (await res.json()) as { access_token: string; expiry_timestamp: string };
  if (!body.access_token || !Number.isFinite(Number(body.expiry_timestamp)))
    throw new Error('OneMap authentication returned an invalid token response.');
  token = { value: body.access_token, expiresAt: Number(body.expiry_timestamp) * 1000 };
  return token.value;
}

export interface OneMapRoute {
  distanceM: number;
  durationS: number;
  legs: { mode: string; durationS: number; distanceM: number; label: string }[];
  geometry: [number, number][];
}

/** Google encoded polyline decoder (OneMap returns encoded route geometry). */
export function decodePolyline(str: string): [number, number][] {
  let index = 0, lat = 0, lng = 0;
  const out: [number, number][] = [];
  while (index < str.length) {
    for (const which of [0, 1]) {
      let result = 0, shift = 0, b: number;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += d; else lng += d;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

export async function onemapRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: 'pt' | 'walk' | 'drive' | 'cycle',
): Promise<OneMapRoute | null> {
  const t = await getToken();
  const now = new Date(Date.now() + 8 * 3600_000); // SGT
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const date = `${mm}-${dd}-${now.getUTCFullYear()}`;
  const params = new URLSearchParams({
    start: `${from.lat},${from.lng}`,
    end: `${to.lat},${to.lng}`,
    routeType: mode,
  });
  if (mode === 'pt') {
    params.set('date', date);
    params.set('time', '08:30:00');
    params.set('mode', 'TRANSIT');
    params.set('maxWalkDistance', '1000');
    params.set('numItineraries', '1');
  }
  try {
    const res = await fetchWithTimeout(`${BASE}/api/public/routingsvc/route?${params}`, { headers: { Authorization: t } }, 10_000);
    if (!res.ok) throw new Error(`OneMap routing HTTP ${res.status}`);
    const body = (await res.json()) as any;
    markOk();
    if (mode === 'pt') {
      const it = body?.plan?.itineraries?.[0];
      if (!it) return null;
      const legs = (it.legs ?? []).map((l: any) => ({
        mode: l.mode,
        durationS: Math.round(l.duration),
        distanceM: Math.round(l.distance),
        label: l.mode === 'WALK' ? 'Walk' : `${l.mode === 'SUBWAY' ? 'MRT' : l.mode === 'BUS' ? 'Bus' : l.mode} ${l.route ?? ''}`.trim(),
      }));
      const geometry = (it.legs ?? []).flatMap((l: any) => (l.legGeometry?.points ? decodePolyline(l.legGeometry.points) : []));
      return {
        durationS: Math.round(it.duration),
        distanceM: legs.reduce((s: number, l: { distanceM: number }) => s + l.distanceM, 0),
        legs,
        geometry,
      };
    }
    const summary = body?.route_summary;
    if (!summary) return null;
    return {
      durationS: Math.round(summary.total_time),
      distanceM: Math.round(summary.total_distance),
      legs: [{ mode, durationS: Math.round(summary.total_time), distanceM: Math.round(summary.total_distance), label: mode }],
      geometry: body.route_geometry ? decodePolyline(body.route_geometry) : [],
    };
  } catch (e) {
    markError((e as Error).message);
    throw e;
  }
}
