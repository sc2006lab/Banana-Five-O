import { z } from 'zod';
import { budgetSleep, checkSyncBudget, SyncBudgetError } from './budget.js';
import { fetchWithTimeout } from './datagovsg.js';

// Fixed public mirrors: never accept an endpoint or query from an incoming request.
// https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
] as const;
const QUERY = '[out:json][timeout:30];(node["shop"="supermarket"](1.15,103.59,1.48,104.1);way["shop"="supermarket"](1.15,103.59,1.48,104.1););out center tags;';

const coordinates = z.object({ lat: z.number().finite(), lon: z.number().finite() });
const responseSchema = z.object({
  remark: z.string().optional(),
  osm3s: z.object({ timestamp_osm_base: z.string().optional() }).optional(),
  elements: z.array(z.object({
    type: z.enum(['node', 'way']),
    id: z.number().int().positive(),
    lat: z.number().finite().optional(),
    lon: z.number().finite().optional(),
    center: coordinates.optional(),
    tags: z.record(z.string(), z.string()).optional(),
  })),
});

class PermanentOverpassError extends Error {}

/** Sequential failover stays well inside the cloud fetch budget; incomplete results never activate. */
export async function fetchSupermarketData(): Promise<z.infer<typeof responseSchema>> {
  const failures: string[] = [];
  let retryDelayMs = 1000;
  for (let attempt = 0; attempt < ENDPOINTS.length; attempt++) {
    checkSyncBudget();
    if (attempt > 0) await budgetSleep(retryDelayMs);
    const endpoint = ENDPOINTS[attempt];
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ data: QUERY }).toString(),
      }, 45_000);
      if (!response.ok) {
        // Release the response stream before trying another server.
        await response.body?.cancel();
        const message = `Overpass API responded ${response.status}`;
        // The primary operator asks clients to pause 30s after rate-limit / policy responses.
        if (response.status === 429 || response.status === 406) retryDelayMs = 30_000;
        if (response.status < 500 && ![406, 408, 429].includes(response.status))
          throw new PermanentOverpassError(message);
        throw new Error(message);
      }
      const parsed = responseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error('Overpass returned an invalid dataset response');
      // Overpass may return HTTP 200 with partial elements and a runtime error in "remark".
      if (parsed.data.remark?.trim()) throw new Error('Overpass returned an incomplete dataset (runtime error)');
      const timestamp = parsed.data.osm3s?.timestamp_osm_base;
      if (timestamp && !Number.isFinite(Date.parse(timestamp))) throw new Error('Overpass returned an invalid publisher timestamp');
      return parsed.data;
    } catch (error) {
      if (error instanceof SyncBudgetError || error instanceof PermanentOverpassError) throw error;
      // Keep diagnostics bounded, without echoing provider HTML, query content or arbitrary exceptions.
      const known = error instanceof Error && error.message.startsWith('Overpass ');
      failures.push(`${new URL(endpoint).hostname}: ${known ? error.message : 'network, timeout or JSON failure'}`);
    }
  }
  throw new Error(`Supermarket refresh failed after ${ENDPOINTS.length} attempts: ${failures.join('; ')}`);
}
