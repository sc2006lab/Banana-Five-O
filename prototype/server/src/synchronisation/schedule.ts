import { SOURCES } from './sources.js';

/** Same ordering as vercel.json: each source runs once daily, UTC hours 16..23, 0. */
export function cloudSchedule(sourceId: string): string | null {
  if (!process.env.VERCEL) return null;
  const i = SOURCES.findIndex((source) => source.id === sourceId);
  return i >= 0 ? `0 ${(16 + i) % 24} * * * (UTC; Vercel daily window)` : null;
}
