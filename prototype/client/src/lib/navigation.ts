import type { NavigateFunction } from 'react-router-dom';
import { singaporePostalInput, type LocationOrigin } from '@famplan/shared';

export function malformedPostalQuery(query: string): boolean {
  return singaporePostalInput(query).malformed;
}

export function originParams(origin?: LocationOrigin): Record<string, string | number> {
  return origin ? { originLat: origin.lat, originLng: origin.lng, originAddress: origin.address, ...(origin.postal ? { originPostal: origin.postal } : {}) } : {};
}

export function originFromParams(params: URLSearchParams): LocationOrigin | undefined {
  // Preserve invalid/partial parameters for server-side validation rather than silently using a centroid.
  if (!['originLat', 'originLng', 'originAddress', 'originPostal'].some((k) => params.has(k))) return undefined;
  return { lat: params.has('originLat') ? Number(params.get('originLat')) : NaN, lng: params.has('originLng') ? Number(params.get('originLng')) : NaN, address: params.get('originAddress') ?? '', postal: params.get('originPostal') || null };
}

export function profilePath(id: string, origin?: LocationOrigin, radius?: number, suffix = ''): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(originParams(origin))) p.set(k, String(v));
  if (radius) p.set('radius', String(radius));
  return `/n/${id}${suffix}${p.size ? `?${p}` : ''}`;
}

export function explorePath(query: string): string {
  return `/explore?${new URLSearchParams({ q: query.trim() })}`;
}

export function signInPath(path: string): string {
  const authPage = /^\/(?:signin|register|forgot-password|reset-password)(?:\/|\?|$)/.test(path);
  const internal = path.startsWith('/') && !path.startsWith('//') && !/[\\\r\n]/.test(path);
  const landing = /^\/(?:\?|$)/.test(path);
  return `/signin?${new URLSearchParams({ next: internal && !authPage && !landing ? path : '/explore' })}`;
}

export function backOrExplore(navigate: NavigateFunction): void {
  if (typeof window !== 'undefined' && Number(window.history.state?.idx) > 0) navigate(-1);
  else navigate('/explore');
}
