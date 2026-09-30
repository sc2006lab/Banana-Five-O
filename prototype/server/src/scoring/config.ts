// Versioned Scoring Configuration (SRS §6, NFR-MAINT-01). Changing any constant here requires a new version string
// so identical inputs + configuration version + dataset versions always reproduce the same score (NFR-DATA-03).
import type { AmenityCategory, Criterion } from '@famplan/shared';

export type NormalisationRule =
  | { kind: 'count'; categories: AmenityCategory[]; defaultRadiusM: number; target: number }
  | { kind: 'nearest'; categories: AmenityCategory[]; bestM: number; worstM: number }
  | { kind: 'minutes'; bestMin: number; worstMin: number };

export interface ScoringConfiguration {
  version: string;
  effectiveDate: string;
  criteria: Record<Criterion, NormalisationRule & { description: string }>;
  missingDataTreatment: string;
  allZeroFallback: string;
  rounding: string;
}

export const SCORING_CONFIG: ScoringConfiguration = {
  version: 'famplan-score-v1.0',
  effectiveDate: '2026-09-25',
  criteria: {
    childcare: {
      kind: 'count',
      categories: ['childcare', 'kindergarten'],
      defaultRadiusM: 1000,
      target: 30,
      description: 'Childcare centres and kindergartens within the radius; 30 or more scores 1.0, scaled linearly below.',
    },
    schools: {
      kind: 'count',
      categories: ['primary_school', 'secondary_school'],
      defaultRadiusM: 1000,
      target: 6,
      description: 'Primary and secondary schools within the radius; 6 or more scores 1.0, scaled linearly below.',
    },
    groceries: {
      kind: 'nearest',
      categories: ['supermarket'],
      bestM: 150,
      worstM: 1200,
      description: 'Nearest supermarket: 150 m or closer scores 1.0, 1.2 km or further scores 0, linear in between.',
    },
    healthcare: {
      kind: 'nearest',
      categories: ['clinic'],
      bestM: 150,
      worstM: 1200,
      description: 'Nearest CHAS clinic: 150 m or closer scores 1.0, 1.2 km or further scores 0, linear in between.',
    },
    green_spaces: {
      kind: 'count',
      categories: ['park_playground'],
      defaultRadiusM: 1000,
      target: 8,
      description: 'Parks and playgrounds within the radius; 8 or more scores 1.0, scaled linearly below.',
    },
    public_transport: {
      kind: 'nearest',
      categories: ['mrt'],
      bestM: 250,
      worstM: 1500,
      description: 'Nearest MRT/LRT station: 250 m or closer scores 1.0, 1.5 km or further scores 0, linear in between.',
    },
    commute: {
      kind: 'minutes',
      bestMin: 20,
      worstMin: 75,
      description:
        'Estimated public-transport minutes to the first priority destination: 20 min or less scores 1.0, 75 min or more scores 0.',
    },
    accessibility: {
      kind: 'count',
      categories: ['bus_stop'],
      defaultRadiusM: 400,
      target: 12,
      description:
        'Bus stops within 400 m of the reference point (transport-access proxy, not verified step-free access); 12 or more scores 1.0.',
    },
  },
  missingDataTreatment:
    'A criterion without sufficient data is excluded and its weight is redistributed proportionally across the remaining weighted criteria.',
  allZeroFallback: 'If every available criterion has weight 0, all available criteria are weighted equally.',
  rounding: 'Total rounded to the nearest whole number; an exact 0.5 rounds upward.',
};

/** Straight-line travel-time model used for search, sorting and when live routing is unavailable. */
export const COMMUTE_MODEL = {
  version: 'famplan-commute-estimate-v1',
  detourFactor: 1.3,
  pt: { fixedMin: 8, minPerKm: 2.5 },
  walk: { fixedMin: 0, minPerKm: 12 },
  cycle: { fixedMin: 2, minPerKm: 4 },
  drive: { fixedMin: 5, minPerKm: 1.6 },
  basis:
    'FamPlan estimate: straight-line distance × 1.3 detour factor, converted at a mode-specific average speed plus fixed access/wait time. Not a live route.',
} as const;

export function estimateMinutes(distanceM: number, mode: 'pt' | 'walk' | 'cycle' | 'drive' = 'pt'): number {
  const m = COMMUTE_MODEL[mode];
  const km = (distanceM / 1000) * COMMUTE_MODEL.detourFactor;
  return Math.round(m.fixedMin + km * m.minPerKm);
}
