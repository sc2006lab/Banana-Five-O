// UC-5.2 Check Commute Route (FR-TRV-02 – FR-TRV-05). Live OneMap routing when configured; otherwise a
// clearly labelled FamPlan estimate so the rest of the page keeps working (FR-RES-02).
import type { RouteEstimateDto, TravelMode } from '@famplan/shared';
import { distanceM } from '../lib/geo.js';
import { COMMUTE_MODEL, estimateMinutes } from '../scoring/config.js';
import { onemapRoute, routingConfigured } from './onemap.js';

const BARRIER_FREE_UNAVAILABLE =
  'Barrier-free routing coverage is unavailable: the configured provider (OneMap) does not supply step-free route information. Check lift and ramp availability with LTA or the station operator.';

function estimate(from: { lat: number; lng: number }, to: { lat: number; lng: number }, mode: TravelMode, barrierFree: boolean, reason: string): RouteEstimateDto {
  const straight = distanceM(from, to);
  return {
    state: 'UNAVAILABLE',
    mode,
    provider: `FamPlan estimate (${COMMUTE_MODEL.version})`,
    retrievedAt: new Date().toISOString(),
    distanceM: Math.round(straight * COMMUTE_MODEL.detourFactor),
    durationS: estimateMinutes(straight, mode) * 60,
    legs: [],
    geometry: [
      [from.lat, from.lng],
      [to.lat, to.lng],
    ],
    barrierFree: { requested: barrierFree, covered: false, message: BARRIER_FREE_UNAVAILABLE },
    message: reason,
    estimateBasis: COMMUTE_MODEL.basis,
  };
}

export async function routeEstimate(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: TravelMode,
  barrierFree: boolean,
): Promise<RouteEstimateDto> {
  if (!routingConfigured())
    return estimate(from, to, mode, barrierFree, 'Live routing is not configured (OneMap API credentials not set). Showing a straight-line estimate instead.');
  try {
    const r = await onemapRoute(from, to, mode);
    if (!r)
      return { ...estimate(from, to, mode, barrierFree, 'OneMap found no route for this trip and mode.'), state: 'NO_ROUTE', provider: 'OneMap (Singapore Land Authority)' };
    return {
      state: 'OK',
      mode,
      provider: 'OneMap (Singapore Land Authority)',
      retrievedAt: new Date().toISOString(),
      distanceM: r.distanceM,
      durationS: r.durationS,
      legs: r.legs,
      geometry: r.geometry,
      barrierFree: { requested: barrierFree, covered: false, message: BARRIER_FREE_UNAVAILABLE },
    };
  } catch {
    return estimate(from, to, mode, barrierFree, 'OneMap routing is temporarily unavailable. Showing a straight-line estimate instead.');
  }
}
