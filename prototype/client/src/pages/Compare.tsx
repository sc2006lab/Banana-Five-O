// UC-6.2 Compare Neighbourhoods (FR-DEC-04; includes UC-6.1).
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  COMPARE_MAX,
  COMPARE_MIN,
  LIMITATION_EDUCATION,
  LIMITATION_SCORE,
  NOTE_MAX,
  PROXIMITY_RADII,
  type AmenityCategory,
  type NeighbourhoodDetail,
  type NeighbourhoodSummary,
  type ProximityRadius,
  type ShortlistEntryDto,
} from '@famplan/shared';
import { api, ApiError, fmtDistance, scoringParams } from '../lib/api';
import { useApp } from '../state/AppState';
import { ScoreBreakdown } from '../components/ScoreBreakdown';
import { Icon, Limitation, Notice, ScorePill, Spinner, StateBadge } from '../components/ui';
import { Rosette } from '../components/Rosette';
import { toneFor } from '../components/SurveyMap';

type Item = NeighbourhoodSummary & { detail: NeighbourhoodDetail };

function Row({ icon, label, items, render, shade = false }: { icon: string; label: string; items: Item[]; render: (i: Item) => ReactNode; shade?: boolean }) {
  return (
    <tr className={`border-t border-line-soft ${shade ? 'bg-blush/50' : ''}`}>
      <th scope="row" className="w-44 px-4 py-4 text-left align-top text-sm font-semibold text-burgundy">
        <span className="flex items-center gap-2">
          <Icon name={icon} className="!text-[20px] text-muted" />
          {label}
        </span>
      </th>
      {items.map((i) => (
        <td key={i.id} className="border-l border-line-soft px-4 py-4 align-top text-sm">
          {render(i)}
        </td>
      ))}
    </tr>
  );
}

function amenity(i: Item, c: AmenityCategory) {
  return i.detail.amenities.find((a) => a.category === c)!;
}

function NoteBox({ id, initial }: { id: string; initial: string }) {
  const { toast } = useApp();
  const [text, setText] = useState(initial);
  const [err, setErr] = useState<string>();
  const save = async () => {
    if (text === initial) return;
    try {
      await api(`/shortlist/${id}/note`, { method: 'PUT', body: { text } });
      setErr(undefined);
      toast('Note saved.', 'success');
    } catch (e) {
      setErr((e as ApiError).message);
    }
  };
  return (
    <div>
      <label className="sr-only" htmlFor={`note-${id}`}>
        Private note
      </label>
      <textarea
        id={`note-${id}`}
        className="input h-24 resize-none bg-blush/40"
        placeholder="Add thoughts…"
        maxLength={NOTE_MAX}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        aria-invalid={Boolean(err)}
      />
      <p className="mt-1 text-right text-[11px] text-muted">
        {text.length}/{NOTE_MAX}
      </p>
      {err && <p className="field-error">{err}</p>}
    </div>
  );
}

export function ComparePage() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { scoring, setCompareIds, compareIds, me, shortlistIds, toggleShortlist, toast } = useApp();
  const ids = (sp.get('ids') ?? '').split(',').filter(Boolean);
  const [radius, setRadius] = useState<ProximityRadius>(1000);
  const [items, setItems] = useState<Item[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ids.join(',') !== compareIds.join(',') && ids.length) setCompareIds(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  useEffect(() => {
    if (ids.length < COMPARE_MIN) return;
    setError(null);
    api<{ items: Item[] }>(`/compare?ids=${ids.join(',')}&${scoringParams(scoring, { radius })}`)
      .then((r) => setItems(r.items))
      .catch((e) => setError((e as ApiError).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, scoring, radius]);

  useEffect(() => {
    if (!me) return setNotes({});
    api<{ entries: ShortlistEntryDto[] }>('/shortlist')
      .then((r) => setNotes(Object.fromEntries(r.entries.map((e) => [e.neighbourhoodId, e.note]))))
      .catch(() => undefined);
  }, [me, shortlistIds]);

  const remove = (id: string) => {
    const next = ids.filter((x) => x !== id);
    setCompareIds(next);
    nav(`/compare?ids=${next.join(',')}`, { replace: true });
  };

  if (ids.length < COMPARE_MIN)
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Icon name="compare_arrows" className="!text-[48px] text-salmon" />
        <h1 className="mt-2 text-3xl font-bold text-burgundy">Compare neighbourhoods</h1>
        <p className="mt-2 text-muted">
          Select between {COMPARE_MIN} and {COMPARE_MAX} neighbourhoods from Explore or your shortlist, then open the comparison.
          {ids.length === 1 && ' You have selected one so far.'}
        </p>
        <Link to="/explore" className="btn-primary mt-6">
          Find neighbourhoods
        </Link>
      </div>
    );

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-8">
      <button onClick={() => nav(-1)} className="flex items-center gap-2 text-sm font-semibold text-muted hover:text-burgundy">
        <Icon name="arrow_back" className="!text-[18px]" />
        Back
      </button>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-burgundy">Compare neighbourhoods</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Evaluating {ids.length} choices with {me ? 'your saved priorities' : 'default weights'}
            {scoring.destination ? ` and estimated commute to ${scoring.destination.label}` : ''}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-full border border-line" role="radiogroup" aria-label="Radius">
            {PROXIMITY_RADII.map((r) => (
              <button key={r} role="radio" aria-checked={radius === r} className={`px-3 py-1.5 text-sm font-semibold ${radius === r ? 'bg-burgundy text-white' : 'bg-white text-burgundy hover:bg-blush'}`} onClick={() => setRadius(r)}>
                {fmtDistance(r)}
              </button>
            ))}
          </div>
          <button
            className="btn-secondary"
            onClick={async () => {
              await navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
              toast('Comparison link copied. Notes are private and are not included.', 'success');
            }}
          >
            <Icon name="share" className="!text-[18px]" />
            Share
          </button>
          <Link to="/preferences" className="btn-dark">
            <Icon name="tune" className="!text-[18px]" />
            Edit priorities
          </Link>
        </div>
      </div>

      {error && <Notice tone="error" className="mt-4">{error}</Notice>}
      {!items && !error && <Spinner label="Comparing" />}
      {items && (
        <div className="card mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <caption className="sr-only">Side-by-side comparison of family amenities, commute, accessibility and scores</caption>
            <thead>
              <tr>
                <td className="px-4 py-4 align-bottom">
                  <span className="eyebrow">Neighbourhood profiles</span>
                </td>
                {items.map((i) => (
                  <th key={i.id} scope="col" className="border-l border-line-soft px-4 py-4 text-left align-top">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link to={`/n/${i.id}`} className="text-xl font-semibold text-burgundy hover:underline">
                          {i.name}
                        </Link>
                        <p className="text-sm font-normal text-muted">{i.planningArea}</p>
                      </div>
                      <div className="flex">
                        <button className={`rounded-full p-1.5 hover:bg-blush ${shortlistIds.has(i.id) ? 'text-cinnabar' : 'text-muted'}`} aria-label={`Shortlist ${i.name}`} aria-pressed={shortlistIds.has(i.id)} onClick={() => toggleShortlist(i.id, i.name)}>
                          <Icon name="favorite" filled={shortlistIds.has(i.id)} className="!text-[20px]" />
                        </button>
                        <button className="rounded-full p-1.5 text-muted hover:bg-blush" aria-label={`Remove ${i.name} from comparison`} onClick={() => remove(i.id)}>
                          <Icon name="close" className="!text-[20px]" />
                        </button>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row icon="target" label="Suitability match" items={items} shade render={(i) => (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <ScorePill score={i.score.total} className="!text-base" />
                    <Rosette values={i.score.breakdown.map((b) => b.normalisedValue)} size={72} tone={toneFor(i.score.total)} />
                  </div>
                  <ScoreBreakdown score={i.score} compact />
                </div>
              )} />
              <Row icon="child_care" label="Childcare & kindergartens" items={items} render={(i) => {
                const a = amenity(i, 'childcare');
                const k = amenity(i, 'kindergarten');
                return (
                  <div>
                    <p className="text-2xl font-semibold text-burgundy">{a.matchedCount + k.matchedCount}</p>
                    <p className="text-xs text-muted">within {fmtDistance(radius)} · nearest {fmtDistance(a.nearest?.distanceM)}</p>
                    {a.state !== 'AVAILABLE' && <StateBadge state={a.state} />}
                  </div>
                );
              }} />
              <Row icon="school" label="Schools" items={items} shade render={(i) => {
                const p = amenity(i, 'primary_school');
                const s = amenity(i, 'secondary_school');
                return (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-line-soft bg-white p-2.5">
                      <p className="font-semibold text-ink">{p.nearest?.name ?? 'No primary school in radius'}</p>
                      <p className="text-xs text-muted">{p.matchedCount} primary within {fmtDistance(radius)}{p.nearest ? ` · ${fmtDistance(p.nearest.distanceM)}` : ''}</p>
                    </div>
                    <p className="text-xs text-muted">{s.matchedCount} secondary within {fmtDistance(radius)}</p>
                  </div>
                );
              }} />
              <Row icon="train" label="Public transport" items={items} render={(i) => {
                const m = amenity(i, 'mrt');
                const b = amenity(i, 'bus_stop');
                return (
                  <div className="flex items-start gap-3">
                    <span className="rounded-lg bg-blush p-2 text-burgundy"><Icon name="train" /></span>
                    <div>
                      <p className="font-semibold text-ink">{m.nearest?.name ?? 'No station in radius'}</p>
                      <p className="text-xs text-muted">{m.nearest ? fmtDistance(m.nearest.distanceM) : ''} · {b.matchedCount} bus stops in radius</p>
                    </div>
                  </div>
                );
              }} />
              <Row icon="commute" label={`Commute${scoring.destination ? ` (${scoring.destination.label})` : ''}`} items={items} shade render={(i) =>
                i.commuteMin !== null ? (
                  <div>
                    <p className="text-2xl font-semibold text-burgundy">~{i.commuteMin} min</p>
                    <p className="text-xs text-muted">Public transport estimate</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted">Add a priority destination in Preferences to compare commute.</p>
                )
              } />
              <Row icon="local_grocery_store" label="Daily needs" items={items} render={(i) => (
                <ul className="space-y-1 text-sm">
                  <li>Supermarket: <strong>{fmtDistance(amenity(i, 'supermarket').nearest?.distanceM ?? i.highlights.find((h) => h.category === 'supermarket')?.nearestM)}</strong></li>
                  <li>Clinic: <strong>{fmtDistance(amenity(i, 'clinic').nearest?.distanceM ?? i.highlights.find((h) => h.category === 'clinic')?.nearestM)}</strong></li>
                  <li>Parks & playgrounds: <strong>{amenity(i, 'park_playground').matchedCount}</strong></li>
                </ul>
              )} />
              <Row icon="accessible" label="Accessibility" items={items} shade render={(i) => {
                const acc = i.score.breakdown.find((b) => b.criterion === 'accessibility')!;
                return <p className="text-sm">{acc.missing ? 'Data unavailable' : acc.rawLabel} <span className="text-xs text-muted">(bus stops within 400 m)</span></p>;
              }} />
              {me && (
                <Row icon="edit_note" label="Your notes" items={items} render={(i) =>
                  shortlistIds.has(i.id) ? (
                    <NoteBox key={`${i.id}-${notes[i.id] ?? ''}`} id={i.id} initial={notes[i.id] ?? ''} />
                  ) : (
                    <button className="text-xs font-semibold text-cinnabar hover:underline" onClick={() => toggleShortlist(i.id, i.name)}>
                      Shortlist to add a private note
                    </button>
                  )
                } />
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 space-y-1">
        <Limitation>{LIMITATION_SCORE}</Limitation>
        <Limitation>{LIMITATION_EDUCATION}</Limitation>
      </div>
    </div>
  );
}
