// FR-DEC-01 – FR-DEC-03, NFR-DATA-03, NFR-TRANS-01
import { describe, expect, it } from 'vitest';
import { CRITERIA, type CriterionWeights } from '@famplan/shared';
import { calculateScore, normalise, roundHalfUp, type ScoringEvidence } from '../src/scoring/score.js';
import { SCORING_CONFIG, estimateMinutes } from '../src/scoring/config.js';

const ev = (over: Partial<Record<keyof ScoringEvidence, number | null>> = {}): ScoringEvidence =>
  Object.fromEntries(
    CRITERIA.map((c) => {
      const defaults: Record<string, number> = {
        childcare: 15, // 0.5
        schools: 3, // 0.5
        groceries: 675, // (1200-675)/1050 = 0.5
        healthcare: 675,
        green_spaces: 4, // 0.5
        public_transport: 875, // (1500-875)/1250 = 0.5
        commute: 47.5, // (75-47.5)/55 = 0.5
        accessibility: 6, // 0.5
      };
      const v = c in over ? over[c]! : defaults[c];
      return [c, { value: v, label: `${v}`, missingReason: v === null ? 'missing' : undefined }];
    }),
  ) as ScoringEvidence;

const w = (v: number | Partial<CriterionWeights>): CriterionWeights =>
  Object.fromEntries(CRITERIA.map((c) => [c, typeof v === 'number' ? v : (v[c] ?? 0)])) as CriterionWeights;

describe('roundHalfUp', () => {
  it('rounds exact .5 upward and others to nearest', () => {
    expect(roundHalfUp(72.5)).toBe(73);
    expect(roundHalfUp(72.49)).toBe(72);
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(99.5)).toBe(100);
    expect(roundHalfUp(72.49999999999)).toBe(73); // float noise tolerated
  });
});

describe('normalise', () => {
  it('clamps count, distance and minute rules to 0..1 with linear interpolation', () => {
    const cc = SCORING_CONFIG.criteria.childcare;
    expect(normalise(cc, 0)).toBe(0);
    expect(normalise(cc, 30)).toBe(1);
    expect(normalise(cc, 60)).toBe(1);
    const g = SCORING_CONFIG.criteria.groceries;
    expect(normalise(g, 150)).toBe(1);
    expect(normalise(g, 100)).toBe(1);
    expect(normalise(g, 1200)).toBe(0);
    expect(normalise(g, 5000)).toBe(0);
    expect(normalise(g, 675)).toBeCloseTo(0.5);
    const m = SCORING_CONFIG.criteria.commute;
    expect(normalise(m, 20)).toBe(1);
    expect(normalise(m, 75)).toBe(0);
  });
});

describe('calculateScore', () => {
  it('equal weights and 0.5 everywhere gives 50, and contributions reconcile with the total', () => {
    const s = calculateScore(ev(), w(3), { a: 1 });
    expect(s.total).toBe(50);
    const sum = s.breakdown.reduce((t, b) => t + b.contribution, 0);
    expect(sum).toBeCloseTo(s.unroundedTotal, 9);
    expect(roundHalfUp(sum)).toBe(s.total);
    expect(s.configurationVersion).toBe(SCORING_CONFIG.version);
    expect(s.datasetVersions).toEqual({ a: 1 });
  });

  it('weights change the result proportionally', () => {
    const e = ev({ childcare: 30, schools: 0 }); // 1.0 and 0.0
    expect(calculateScore(e, w({ childcare: 5, schools: 0 }), {}).total).toBe(100);
    expect(calculateScore(e, w({ childcare: 0, schools: 5 }), {}).total).toBe(0);
    expect(calculateScore(e, w({ childcare: 1, schools: 1 }), {}).total).toBe(50);
  });

  it('excludes missing criteria and redistributes their weight (FR-DEC-03)', () => {
    const e = ev({ childcare: 30, commute: null }); // commute missing
    const s = calculateScore(e, w({ childcare: 5, commute: 5 }), {});
    const commute = s.breakdown.find((b) => b.criterion === 'commute')!;
    expect(commute.missing).toBe(true);
    expect(commute.effectiveWeight).toBe(0);
    expect(s.total).toBe(100); // all remaining weight on childcare (1.0)
    expect(s.weightTreatment).toContain('redistributed');
  });

  it('removing each criterion in turn keeps totals deterministic', () => {
    for (const c of CRITERIA) {
      const a = calculateScore(ev({ [c]: null }), w(3), {}, SCORING_CONFIG, new Date(0));
      const b = calculateScore(ev({ [c]: null }), w(3), {}, SCORING_CONFIG, new Date(0));
      expect(a).toEqual(b);
      expect(a.total).toBe(50);
    }
  });

  it('all-zero weights fall back to equal weighting (documented)', () => {
    const s = calculateScore(ev({ childcare: 30 }), w(0), {});
    expect(s.weightTreatment).toContain('weighted equally');
    // 7 criteria at 0.5 and one at 1.0, equally weighted
    expect(s.unroundedTotal).toBeCloseTo(((7 * 0.5 + 1) / 8) * 100);
  });

  it('returns 0 with explanation when no criterion has data', () => {
    const none = Object.fromEntries(CRITERIA.map((c) => [c, null])) as Record<string, null>;
    const s = calculateScore(ev(none), w(3), {});
    expect(s.total).toBe(0);
    expect(s.weightTreatment).toMatch(/No criterion/);
  });

  it('exposes raw, normalised, weight and contribution for each criterion (NFR-TRANS-01)', () => {
    const s = calculateScore(ev(), w({ ...w(3), groceries: 5 }), {});
    const g = s.breakdown.find((b) => b.criterion === 'groceries')!;
    expect(g.rawValue).toBe(675);
    expect(g.normalisedValue).toBeCloseTo(0.5);
    expect(g.weight).toBe(5);
    expect(g.effectiveWeight).toBeCloseTo((5 / 26) * 100);
    expect(g.contribution).toBeCloseTo((5 / 26) * 0.5 * 100);
  });
});

describe('estimateMinutes', () => {
  it('is monotonic in distance and mode-specific', () => {
    expect(estimateMinutes(0, 'pt')).toBe(8);
    expect(estimateMinutes(10_000, 'pt')).toBeGreaterThan(estimateMinutes(5_000, 'pt'));
    expect(estimateMinutes(2_000, 'walk')).toBeGreaterThan(estimateMinutes(2_000, 'drive'));
  });
});
