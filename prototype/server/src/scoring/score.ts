// Family Suitability Score (FR-DEC-01 – FR-DEC-03, NFR-TRANS-01). Pure and deterministic.
import { CRITERIA, type Criterion, type CriterionBreakdown, type CriterionWeights, type FamilyScoreDto } from '@famplan/shared';
import { SCORING_CONFIG, type NormalisationRule, type ScoringConfiguration } from './config.js';

export interface CriterionEvidence {
  /** Raw measured value (count, metres, or minutes); null when the criterion lacks sufficient data. */
  value: number | null;
  label: string;
  missingReason?: string;
}

export type ScoringEvidence = Record<Criterion, CriterionEvidence>;

/** Round to nearest whole number with exact .5 rounding upward (FR-DEC-02). Tolerates float noise. */
export function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5 + 1e-9);
}

export function normalise(rule: NormalisationRule, value: number): number {
  let n: number;
  switch (rule.kind) {
    case 'count':
      n = value / rule.target;
      break;
    case 'nearest':
      n = (rule.worstM - value) / (rule.worstM - rule.bestM);
      break;
    case 'minutes':
      n = (rule.worstMin - value) / (rule.worstMin - rule.bestMin);
      break;
  }
  return Math.min(1, Math.max(0, n));
}

export function calculateScore(
  evidence: ScoringEvidence,
  weights: CriterionWeights,
  datasetVersions: Record<string, number>,
  config: ScoringConfiguration = SCORING_CONFIG,
  now: Date = new Date(),
): FamilyScoreDto {
  const available = CRITERIA.filter((c) => evidence[c].value !== null);
  let weightSum = available.reduce((s, c) => s + weights[c], 0);
  let effective: Record<Criterion, number> = Object.fromEntries(CRITERIA.map((c) => [c, weights[c]])) as Record<Criterion, number>;
  const notes: string[] = [];

  if (available.length > 0 && weightSum === 0) {
    effective = Object.fromEntries(CRITERIA.map((c) => [c, available.includes(c) ? 1 : 0])) as Record<Criterion, number>;
    weightSum = available.length;
    notes.push(config.allZeroFallback);
  }
  const missing = CRITERIA.filter((c) => evidence[c].value === null);
  const missingWeighted = missing.filter((c) => weights[c] > 0);
  if (missingWeighted.length > 0) notes.push(config.missingDataTreatment);

  const breakdown: CriterionBreakdown[] = CRITERIA.map((c) => {
    const ev = evidence[c];
    const rule = config.criteria[c];
    if (ev.value === null) {
      return {
        criterion: c,
        rawValue: null,
        rawLabel: ev.label,
        normalisedValue: null,
        weight: weights[c],
        effectiveWeight: 0,
        contribution: 0,
        missing: true,
        missingReason: ev.missingReason ?? 'Insufficient data',
        rule: rule.description,
      };
    }
    const n = normalise(rule, ev.value);
    const share = weightSum > 0 ? effective[c] / weightSum : 0;
    return {
      criterion: c,
      rawValue: ev.value,
      rawLabel: ev.label,
      normalisedValue: n,
      weight: weights[c],
      effectiveWeight: share * 100,
      contribution: share * n * 100,
      missing: false,
      rule: rule.description,
    };
  });

  const unrounded = breakdown.reduce((s, b) => s + b.contribution, 0);
  return {
    total: available.length === 0 ? 0 : roundHalfUp(unrounded),
    unroundedTotal: unrounded,
    configurationVersion: config.version,
    datasetVersions,
    breakdown,
    weightTreatment:
      available.length === 0
        ? 'No criterion has sufficient data, so no score can be calculated.'
        : notes.length > 0
          ? notes.join(' ')
          : 'Each criterion contributes weight ÷ total weight × normalised value × 100.',
    computedAt: now.toISOString(),
  };
}
