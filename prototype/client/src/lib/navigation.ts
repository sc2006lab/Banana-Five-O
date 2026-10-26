import type { NavigateFunction } from 'react-router-dom';

export function malformedPostalQuery(query: string): boolean {
  const candidate = query.trim();
  return /^(?:Singapore\s*|S\s*\(?)?\d+\s*\)?$/i.test(candidate)
    && !/^(?:Singapore\s*|S\s*\(?)?\d{6}\s*\)?$/i.test(candidate);
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
