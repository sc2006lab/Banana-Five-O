// Lab 4 §3.2.2: white-box (basis path) tests. Test IDs match the control flow graphs and path tables in the
// Lab 4 test case document. Only feasible basis paths have tests; the document explains each infeasible one.
import { describe, expect, it } from 'vitest';
import { CRITERIA, type Criterion, type CriterionWeights } from '@famplan/shared';
import { calculateScore, type ScoringEvidence } from '../src/scoring/score.js';
import { dedupeFacilities, type MergeInput } from '../src/neighbourhoods/dedupe.js';

// WB1: calculateScore() — V(G) = 9; feasible paths P1–P5, infeasible P6–P9.
describe('WB1 calculateScore() basis paths', () => {
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
  const allWeights = (w: number) => weights(Object.fromEntries(CRITERIA.map((c) => [c, w])));
  const entry = (s: ReturnType<typeof calculateScore>, c: Criterion) => s.breakdown.find((b) => b.criterion === c)!;

  it('WB1-P1: all data present, non-zero weights → standard explanation', () => {
    const s = calculateScore(evidence(), allWeights(3), {});
    expect(s.total).toBe(50);
    expect(s.weightTreatment).toBe('Each criterion contributes weight ÷ total weight × normalised value × 100.');
  });

  it('WB1-P2: all data present, every weight 0 → equal-weight fallback', () => {
    const s = calculateScore(evidence(), allWeights(0), {});
    expect(s.total).toBe(50);
    expect(entry(s, 'childcare').effectiveWeight).toBeCloseTo(12.5); // 1 ÷ 8 × 100
    expect(s.weightTreatment).toMatch(/weighted equally/);
  });

  it('WB1-P3: a weighted criterion is missing → excluded and weight redistributed', () => {
    const s = calculateScore(evidence({ childcare: 30, commute: null }), weights({ childcare: 5, commute: 5 }), {});
    expect(s.total).toBe(100);
    expect(entry(s, 'commute')).toMatchObject({ missing: true, contribution: 0, effectiveWeight: 0 });
    expect(s.weightTreatment).toMatch(/redistributed/);
  });

  it('WB1-P4: an unweighted criterion is missing → marked missing, no redistribution note', () => {
    const s = calculateScore(evidence({ childcare: 30, schools: 0, commute: null }), weights({ childcare: 5, schools: 5 }), {});
    expect(s.total).toBe(50);
    expect(entry(s, 'commute').missing).toBe(true);
    expect(s.weightTreatment).toBe('Each criterion contributes weight ÷ total weight × normalised value × 100.');
  });

  it('WB1-P5: no criterion has data → total 0 with explanation', () => {
    const none = Object.fromEntries(CRITERIA.map((c) => [c, null])) as Record<Criterion, null>;
    const s = calculateScore(evidence(none), weights({ childcare: 3 }), {});
    expect(s.total).toBe(0);
    expect(s.unroundedTotal).toBe(0);
    expect(s.breakdown.every((b) => b.missing)).toBe(true);
    expect(s.weightTreatment).toBe('No criterion has sufficient data, so no score can be calculated.');
  });
});

// WB2: dedupeFacilities() — V(G) = 5; feasible paths P1–P4, infeasible P5.
describe('WB2 dedupeFacilities() basis paths', () => {
  const rec = (id: string, name: string, lat: number, sourceId = 'src-a'): MergeInput => ({
    id,
    name,
    category: 'supermarket',
    lat,
    lng: 103.8,
    sourceId,
  });
  const ids = (groups: MergeInput[][]) => groups.map((g) => g.map((r) => r.id));

  it('WB2-P1: no records → no groups (loop body never runs)', () => {
    expect(dedupeFacilities([])).toEqual([]);
  });

  it('WB2-P2: one record → one new group', () => {
    expect(ids(dedupeFacilities([rec('A', 'Sheng Siong', 1.35)]))).toEqual([['A']]);
  });

  it('WB2-P3: same normalised name about 22 m apart → merged into one group', () => {
    // 'Sheng Siong Pte Ltd' and 'SHENG SIONG' both normalise to 'SHENG SIONG'; 0.0002° latitude ≈ 22 m ≤ 60 m.
    const out = dedupeFacilities([rec('A', 'Sheng Siong Pte Ltd', 1.35, 'src-a'), rec('B', 'SHENG SIONG', 1.3502, 'src-b')]);
    expect(ids(out)).toEqual([['A', 'B']]);
  });

  it('WB2-P4: same normalised name about 556 m apart → kept as two groups', () => {
    // 0.005° latitude ≈ 556 m > 60 m, so the only candidate group fails the distance test.
    const out = dedupeFacilities([rec('A', 'Sheng Siong', 1.35, 'src-a'), rec('B', 'Sheng Siong', 1.355, 'src-b')]);
    expect(ids(out)).toEqual([['A'], ['B']]);
  });
});
