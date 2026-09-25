// Stage-based starting weights (FR-PREF-07). Suggestions never overwrite weights the user has confirmed.
import { CRITERIA, type Criterion, type CriterionWeights, type FamilyStage } from '@famplan/shared';

const BASE: CriterionWeights = {
  childcare: 2,
  schools: 2,
  groceries: 3,
  healthcare: 3,
  green_spaces: 2,
  public_transport: 3,
  commute: 3,
  accessibility: 2,
};

export const STAGE_PRESETS: Record<FamilyStage, Partial<CriterionWeights>> = {
  expecting_child: { healthcare: 5, childcare: 4, groceries: 4, accessibility: 4 },
  infant_care: { childcare: 5, healthcare: 4, accessibility: 4, green_spaces: 3 },
  preschool: { childcare: 5, green_spaces: 4, healthcare: 3 },
  primary_school: { schools: 5, green_spaces: 4, childcare: 3 },
  secondary_school: { schools: 5, public_transport: 5, commute: 4 },
};

/** Highest suggested weight across the selected stages, starting from the neutral base. */
export function presetWeights(stages: FamilyStage[]): CriterionWeights {
  const w = { ...BASE };
  for (const s of stages) for (const [c, v] of Object.entries(STAGE_PRESETS[s]) as [Criterion, number][]) w[c] = Math.max(w[c], v);
  return w;
}

export function suggestWeights(stages: FamilyStage[], current: CriterionWeights, confirmed: Criterion[]) {
  const preset = presetWeights(stages);
  const weights = Object.fromEntries(CRITERIA.map((c) => [c, confirmed.includes(c) ? current[c] : preset[c]])) as CriterionWeights;
  const kept = confirmed.filter((c) => current[c] !== preset[c]);
  return { weights, preset, kept };
}
