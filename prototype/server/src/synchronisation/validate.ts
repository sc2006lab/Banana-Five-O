// Candidate-dataset validation. A candidate only becomes active if it passes every rule (FR-RES-01, C-6).
import { createHash } from 'node:crypto';
import { AMENITY_CATEGORIES } from '@famplan/shared';
import { isInSingapore } from '../lib/geo.js';
import type { BoundaryRecord, FacilityRecord } from './sources.js';

export const MAX_INVALID_RATIO = 0.05;
export const MIN_RETAINED_RATIO = 0.5;

export class ValidationError extends Error {}

export interface ValidationRules {
  minRecords: number;
  categories: readonly string[];
  previousCount: number | null;
}

function checkVolume(valid: number, total: number, rules: ValidationRules) {
  const invalid = total - valid;
  if (total > 0 && invalid / total > MAX_INVALID_RATIO)
    throw new ValidationError(`${invalid} of ${total} records failed validation (limit ${MAX_INVALID_RATIO * 100}%).`);
  if (valid < rules.minRecords) throw new ValidationError(`Only ${valid} valid records; at least ${rules.minRecords} are required.`);
  if (rules.previousCount && valid < rules.previousCount * MIN_RETAINED_RATIO)
    throw new ValidationError(
      `Record count fell from ${rules.previousCount} to ${valid} (more than ${(1 - MIN_RETAINED_RATIO) * 100}% drop); keeping the previous dataset.`,
    );
}

export function validateFacilities(records: FacilityRecord[], rules: ValidationRules): FacilityRecord[] {
  const seen = new Set<string>();
  const valid: FacilityRecord[] = [];
  for (const r of records) {
    const ok =
      typeof r.sourceRecordId === 'string' &&
      r.sourceRecordId.length > 0 &&
      !seen.has(r.sourceRecordId) &&
      typeof r.name === 'string' &&
      r.name.trim().length > 0 &&
      r.name.length <= 200 &&
      (AMENITY_CATEGORIES as readonly string[]).includes(r.category) &&
      rules.categories.includes(r.category) &&
      isInSingapore(r.lat, r.lng);
    if (!ok) continue;
    seen.add(r.sourceRecordId);
    valid.push(r);
  }
  checkVolume(valid.length, records.length, rules);
  return valid;
}

export function validateBoundaries(records: BoundaryRecord[], rules: ValidationRules): BoundaryRecord[] {
  const seen = new Set<string>();
  const valid = records.filter((r) => {
    const ok =
      /^[A-Z0-9]{2,12}$/.test(r.id) &&
      !seen.has(r.id) &&
      r.name.length > 0 &&
      r.planningArea.length > 0 &&
      (r.geometry.type === 'Polygon' || r.geometry.type === 'MultiPolygon') &&
      r.areaSqm > 0;
    if (ok) seen.add(r.id);
    return ok;
  });
  checkVolume(valid.length, records.length, rules);
  return valid;
}

export function recordHash(r: FacilityRecord | BoundaryRecord): string {
  const json =
    'sourceRecordId' in r
      ? JSON.stringify([r.name, r.category, r.address, r.lat.toFixed(6), r.lng.toFixed(6), r.details])
      : JSON.stringify([r.name, r.planningArea, r.region, r.areaSqm.toFixed(0)]);
  return createHash('sha1').update(json).digest('hex');
}

export function datasetChecksum(records: (FacilityRecord | BoundaryRecord)[]): string {
  const keys = records.map((r) => ('sourceRecordId' in r ? r.sourceRecordId : r.id) + ':' + recordHash(r)).sort();
  return createHash('sha256').update(keys.join('\n')).digest('hex');
}

export function diffCounts(prev: Map<string, string>, next: Map<string, string>) {
  let added = 0;
  let changed = 0;
  for (const [k, h] of next) {
    const p = prev.get(k);
    if (p === undefined) added++;
    else if (p !== h) changed++;
  }
  let removed = 0;
  for (const k of prev.keys()) if (!next.has(k)) removed++;
  return { added, changed, removed };
}
