// Lab 4 §3.2.1: black-box tests for ScoringController (scoring/score.ts) using equivalence class
// partitioning and boundary value analysis. Test IDs (BB-*) match the Lab 4 test case document.
// Traces to FR-PREF-05, FR-DEC-01, FR-DEC-02, FR-DEC-03. Every expected value is worked out by hand from SRS §6 rules.
import { describe, expect, it } from 'vitest';
import { CRITERIA, type Criterion, type CriterionWeights } from '@famplan/shared';
import { calculateScore, ScoringInputError, type ScoringEvidence } from '../src/scoring/score.js';

// Nominal evidence: every criterion normalises to exactly 0.5.
const NOMINAL: Record<Criterion, number> = {
  childcare: 15,
  schools: 3,
  groceries: 675,
  healthcare: 675,
  green_spaces: 4,
  public_transport: 875,
  commute: 47.5,
  accessibility: 6,
};

const evidence = (over: Partial<Record<Criterion, number | null>> = {}): ScoringEvidence =>
  Object.fromEntries(
    CRITERIA.map((c) => {
      const v = c in over ? over[c]! : NOMINAL[c];
      return [c, { value: v, label: String(v) }];
    }),
  ) as ScoringEvidence;

const weights = (set: Partial<CriterionWeights>): CriterionWeights =>
  Object.fromEntries(CRITERIA.map((c) => [c, set[c] ?? 0])) as CriterionWeights;

// Only one criterion carries weight, so total = normalised value × 100.
const only = (c: Criterion) => weights({ [c]: 5 });

const score = (ev: ScoringEvidence, w: CriterionWeights) => calculateScore(ev, w, {});
const normalisedOf = (ev: ScoringEvidence, w: CriterionWeights, c: Criterion) =>
  score(ev, w).breakdown.find((b) => b.criterion === c)!.normalisedValue;

describe('ScoringController: distance criterion (groceries; best 150 m, worst 1200 m)', () => {
  it.each([
    ['BB-D2', 0, 100],
    ['BB-D3', 149, 100],
    ['BB-D4', 150, 100],
    ['BB-D5', 151, 100],
    ['BB-D6', 675, 50],
    ['BB-D7', 1199, 0],
    ['BB-D8', 1200, 0],
    ['BB-D9', 1201, 0],
  ])('%s: %d m gives total %d', (_id, d, total) => {
    expect(score(evidence({ groceries: d }), only('groceries')).total).toBe(total);
  });

  it('BB-D5/D7: values just inside the linear range are not clamped', () => {
    expect(normalisedOf(evidence({ groceries: 151 }), only('groceries'), 'groceries')).toBeCloseTo(0.999048, 6);
    expect(normalisedOf(evidence({ groceries: 1199 }), only('groceries'), 'groceries')).toBeCloseTo(0.000952, 6);
  });

  it.each([
    ['BB-D1', -1],
    ['BB-D10', Number.NaN],
  ])('%s: distance %d is rejected', (_id, d) => {
    expect(() => score(evidence({ groceries: d }), only('groceries'))).toThrow(ScoringInputError);
  });
});

describe('ScoringController: count criterion (childcare; target 30)', () => {
  it.each([
    ['BB-C2', 0, 0],
    ['BB-C3', 1, 3],
    ['BB-C4', 15, 50],
    ['BB-C5', 29, 97],
    ['BB-C6', 30, 100],
    ['BB-C7', 31, 100],
  ])('%s: %d facilities gives total %d', (_id, n, total) => {
    expect(score(evidence({ childcare: n }), only('childcare')).total).toBe(total);
  });

  it('BB-C1: a negative count is rejected', () => {
    expect(() => score(evidence({ childcare: -1 }), only('childcare'))).toThrow(ScoringInputError);
  });

  it('BB-C8: a fractional count is rejected (facilities are whole numbers)', () => {
    expect(() => score(evidence({ childcare: 2.5 }), only('childcare'))).toThrow(ScoringInputError);
  });
});

describe('ScoringController: commute minutes (best 20 min, worst 75 min)', () => {
  it.each([
    ['BB-M2', 19, 100],
    ['BB-M3', 20, 100],
    ['BB-M4', 21, 98],
    ['BB-M5', 47.5, 50],
    ['BB-M6', 74, 2],
    ['BB-M7', 75, 0],
    ['BB-M8', 76, 0],
  ])('%s: %d min gives total %d', (_id, m, total) => {
    expect(score(evidence({ commute: m }), only('commute')).total).toBe(total);
  });

  it('BB-M1: negative minutes are rejected', () => {
    expect(() => score(evidence({ commute: -1 }), only('commute'))).toThrow(ScoringInputError);
  });
});

describe('ScoringController: criterion weight (integer 0 to 5, FR-PREF-05)', () => {
  // childcare normalises to 1.0 and schools to 0.0, so total = w ÷ (w + 5) × 100.
  const ev = evidence({ childcare: 30, schools: 0 });

  it.each([
    ['BB-W2', 0, 0],
    ['BB-W3', 1, 17],
    ['BB-W4', 4, 44],
    ['BB-W5', 5, 50],
  ])('%s: weight %d gives total %d', (_id, w, total) => {
    expect(score(ev, weights({ childcare: w, schools: 5 })).total).toBe(total);
  });

  it.each([
    ['BB-W1', -1],
    ['BB-W6', 6],
    ['BB-W7', 2.5],
  ])('%s: weight %d is rejected', (_id, w) => {
    expect(() => score(ev, weights({ childcare: w, schools: 5 }))).toThrow(ScoringInputError);
  });

  it('BB-W8: a partial weight set (one criterion missing) is rejected', () => {
    const partial = weights({ childcare: 3 }) as Partial<CriterionWeights>;
    delete partial.schools;
    expect(() => score(ev, partial as CriterionWeights)).toThrow(ScoringInputError);
  });
});

describe('ScoringController: invalid-input reporting (FR-DISC-06 field-specific guidance)', () => {
  it('BB-E1: every invalid field is reported in one error, each naming its criterion', () => {
    const run = () => score(evidence({ groceries: -1 }), weights({ childcare: 6, schools: 2.5 }));
    expect(run).toThrow(ScoringInputError);
    expect(run).toThrow(/childcare/);
    expect(run).toThrow(/schools/);
    expect(run).toThrow(/groceries/);
  });
});

describe('ScoringController: data availability and weight set (FR-DEC-03)', () => {
  it('BB-A1: all data present with equal weights gives 50 and the standard explanation', () => {
    const s = score(evidence(), weights(Object.fromEntries(CRITERIA.map((c) => [c, 3]))));
    expect(s.total).toBe(50);
    expect(s.weightTreatment).toMatch(/weight ÷ total weight/);
  });

  it('BB-A2: a missing weighted criterion is excluded and its weight redistributed', () => {
    const s = score(evidence({ childcare: 30, commute: null }), weights({ childcare: 5, commute: 5 }));
    expect(s.total).toBe(100);
    expect(s.breakdown.find((b) => b.criterion === 'commute')!.missing).toBe(true);
    expect(s.weightTreatment).toMatch(/redistributed/);
  });

  it('BB-A3: no data for any criterion gives 0 with an explanation', () => {
    const none = Object.fromEntries(CRITERIA.map((c) => [c, null])) as Record<Criterion, null>;
    const s = score(evidence(none), weights({ childcare: 3 }));
    expect(s.total).toBe(0);
    expect(s.weightTreatment).toMatch(/No criterion/);
  });

  it('BB-A4: all-zero weights fall back to equal weighting', () => {
    // (1.0 + 7 × 0.5) ÷ 8 × 100 = 56.25
    const s = score(evidence({ childcare: 30 }), weights({}));
    expect(s.total).toBe(56);
    expect(s.weightTreatment).toMatch(/weighted equally/);
  });
});

describe('ScoringController: total rounding (FR-DEC-02)', () => {
  it.each([
    ['BB-R1', 'accessibility', 1, 8], // 1 ÷ 12 × 100 = 8.33, below .5
    ['BB-R2', 'green_spaces', 1, 13], // 1 ÷ 8 × 100 = 12.5, exact .5 rounds up
    ['BB-R3', 'accessibility', 2, 17], // 2 ÷ 12 × 100 = 16.67, above .5
  ] as const)('%s: %s = %d gives total %d', (_id, c, v, total) => {
    expect(score(evidence({ [c]: v }), only(c)).total).toBe(total);
  });
});
