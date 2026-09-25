// Facility deduplication across sources (NFR-DATA-04).
// Rule: two records are the same facility when they share a supported category, their normalised names match,
// and they are within DEDUPE_DISTANCE_M of each other. Distinct facilities that happen to be co-located
// (different names) are kept separately.
import { haversineM } from '../lib/geo.js';

export const DEDUPE_DISTANCE_M = 60;

export interface MergeInput {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  sourceId: string;
}

const STOPWORDS = /\b(PTE|PRIVATE|LTD|LIMITED|LLP|THE|CO|INC|CENTRE|CENTER)\b/g;

export function normaliseName(name: string): string {
  return name
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(STOPWORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Returns groups of input records; each group is one real-world facility. Deterministic given input order. */
export function dedupeFacilities<T extends MergeInput>(records: T[]): T[][] {
  const sorted = [...records].sort((a, b) => a.category.localeCompare(b.category) || a.sourceId.localeCompare(b.sourceId) || a.id.localeCompare(b.id));
  const buckets = new Map<string, T[][]>(); // key: category|normalisedName
  const groups: T[][] = [];
  for (const r of sorted) {
    const key = `${r.category}|${normaliseName(r.name)}`;
    const candidates = buckets.get(key) ?? [];
    const match = candidates.find((g) => haversineM(g[0].lat, g[0].lng, r.lat, r.lng) <= DEDUPE_DISTANCE_M);
    if (match) match.push(r);
    else {
      const g = [r];
      candidates.push(g);
      buckets.set(key, candidates);
      groups.push(g);
    }
  }
  return groups;
}
