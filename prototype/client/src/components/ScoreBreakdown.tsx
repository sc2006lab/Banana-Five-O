// Itemised, reproducible score explanation (FR-DEC-02, FR-DEC-03, NFR-TRANS-01).
import { useState } from 'react';
import { CRITERION_ICONS, CRITERION_LABELS, type FamilyScoreDto } from '@famplan/shared';
import { Bar, Icon, scoreTone } from './ui';

export function ScoreBreakdown({ score, compact = false }: { score: FamilyScoreDto; compact?: boolean }) {
  const [showMath, setShowMath] = useState(false);
  return (
    <div>
      <ul className="space-y-2">
        {score.breakdown.map((b) => {
          const pct = b.normalisedValue === null ? 0 : b.normalisedValue;
          const tone = scoreTone(pct * 100);
          return (
            <li key={b.criterion} className={`rounded-lg border px-3 py-2.5 ${b.missing ? 'border-dashed border-line bg-white' : 'border-burgundy/10 bg-blush/50'}`}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 font-semibold text-burgundy">
                  <Icon name={CRITERION_ICONS[b.criterion]} className="!text-[18px]" />
                  {CRITERION_LABELS[b.criterion]}
                </span>
                {b.missing ? (
                  <span className="text-xs font-semibold text-fair">Missing data</span>
                ) : (
                  <span className={`text-xs font-bold ${tone.text}`}>{Math.round(pct * 100)}%</span>
                )}
              </div>
              {!b.missing && <div className="mt-1.5"><Bar value={pct} className={tone.bar} label={`${CRITERION_LABELS[b.criterion]} normalised value`} /></div>}
              {!compact && (
                <p className="mt-1.5 text-xs text-muted">
                  {b.missing ? (
                    <>
                      {b.missingReason} Weight {b.weight} excluded and redistributed.
                    </>
                  ) : (
                    <>
                      {b.rawLabel} · weight {b.weight}/5 ({b.effectiveWeight.toFixed(1)}% share) · contributes <strong>{b.contribution.toFixed(1)}</strong> pts
                    </>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {!compact && (
        <div className="mt-3 text-xs text-muted">
          <button className="font-semibold text-cinnabar hover:underline" aria-expanded={showMath} onClick={() => setShowMath((s) => !s)}>
            {showMath ? 'Hide' : 'Show'} how this score is calculated
          </button>
          {showMath && (
            <div className="mt-2 space-y-1.5 rounded border border-line-soft bg-white p-3">
              <p>{score.weightTreatment}</p>
              <p>
                Sum of contributions = <strong>{score.unroundedTotal.toFixed(2)}</strong> → rounded to <strong>{score.total}</strong> (nearest whole number; exact .5 rounds up).
              </p>
              <ul className="list-disc space-y-0.5 pl-4">
                {score.breakdown.map((b) => (
                  <li key={b.criterion}>
                    <strong>{CRITERION_LABELS[b.criterion]}:</strong> {b.rule}
                  </li>
                ))}
              </ul>
              <p>
                Configuration <code>{score.configurationVersion}</code>; datasets{' '}
                {Object.entries(score.datasetVersions)
                  .map(([k, v]) => `${k} v${v}`)
                  .join(', ')}
                .
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
