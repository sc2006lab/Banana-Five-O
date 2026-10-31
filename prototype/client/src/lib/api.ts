import {
  CRITERIA,
  type AmenityCategory,
  type CommuteDestination,
  type CriterionWeights,
  type PreferencesDto,
  type ProximityRadius,
} from '@famplan/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: 'same-origin',
      signal: init.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'Cannot reach FamPlan. Check your connection and try again.');
  }
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(res.status, 'FamPlan returned an unexpected response. Please try again shortly.');
  }
  if (!res.ok) throw new ApiError(res.status, body?.error ?? `Request failed (${res.status}).`, body?.fields ?? {});
  return body as T;
}

export interface ScoringState {
  weights: CriterionWeights;
  thresholds: Partial<Record<AmenityCategory, ProximityRadius>>;
  destinations: ScoringDestination[];
}

export type ScoringDestination = CommuteDestination & { address?: string };

/** The saved destinations in the form the scoring context uses. */
export const scoringDestinations = (saved: PreferencesDto['destinations']): ScoringDestination[] =>
  saved.map(({ lat, lng, label, address, mode }) => ({ lat, lng, label, address, mode }));

/** "Work", or "Work, School and Gym" when commute time covers several destinations. */
export const destinationNames = (destinations: ScoringDestination[]): string =>
  new Intl.ListFormat('en-SG').format(destinations.map((d) => d.label));

/** Encode the active scoring context as query parameters understood by the API. */
export function scoringParams(s: ScoringState, extra: Record<string, string | number | undefined | null> = {}): URLSearchParams {
  const p = new URLSearchParams();
  for (const c of CRITERIA) p.set(`w_${c}`, String(s.weights[c]));
  const th = Object.entries(s.thresholds)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}:${v}`)
    .join(',');
  if (th) p.set('th', th);
  if (s.destinations.length) {
    p.set(
      'destinations',
      JSON.stringify(s.destinations.map((d) => ({ lat: Number(d.lat.toFixed(6)), lng: Number(d.lng.toFixed(6)), label: d.label.slice(0, 40), mode: d.mode }))),
    );
  }
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  return p;
}

export const fmtDistance = (m: number | null | undefined) =>
  m === null || m === undefined ? '—' : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;

export const fmtDate = (iso: string | null | undefined, withTime = false) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: 'Asia/Singapore',
  });
};

export const fmtRelative = (iso: string | null | undefined) => {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} days ago`;
};
