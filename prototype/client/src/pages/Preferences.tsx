// UC-2.1 Manage Family Preferences (FR-PREF-01 – FR-PREF-07). Visitors can try weights for the session but cannot save.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AMENITY_CATEGORIES,
  AMENITY_ICONS,
  AMENITY_LABELS,
  CRITERIA,
  CRITERION_ICONS,
  CRITERION_LABELS,
  DESTINATIONS_MAX,
  FAMILY_STAGES,
  FAMILY_STAGE_LABELS,
  PROXIMITY_RADII,
  preferencesSchema,
  type AreaDto,
  type Criterion,
  type CriterionWeights,
  type PreferencesDto,
  type ProximityRadius,
} from '@famplan/shared';
import { api, ApiError, fmtDate } from '../lib/api';
import { useApp } from '../state/AppState';
import { AddressSearch } from '../components/AddressSearch';
import { FieldError, Icon, Notice, Spinner } from '../components/ui';

type Draft = Omit<PreferencesDto, 'updatedAt'>;

export function PreferencesPage() {
  const { me, prefs, scoring, setScoring, reloadPrefs, toast } = useApp();
  const nav = useNavigate();
  const [areas, setAreas] = useState<AreaDto[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [areaPick, setAreaPick] = useState('');
  const [newDestLabel, setNewDestLabel] = useState('');
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    void api<AreaDto[]>('/areas').then(setAreas).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (me && !prefs) { setDraft(null); return; }
    setDraft(
      prefs
        ? { ...prefs }
        : {
            familyStages: [],
            preferredAreas: [],
            amenityThresholds: scoring.thresholds,
            weights: scoring.weights,
            confirmedWeights: [],
            destinations: scoring.destination
              ? [{ label: scoring.destination.label, queryText: scoring.destination.label, address: scoring.destination.address ?? '', lat: scoring.destination.lat, lng: scoring.destination.lng }]
              : [],
          },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, prefs]);

  if (!draft) return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-bold text-burgundy">Family preferences</h1>
      <Spinner label="Waiting for your saved preferences" />
      <p className="text-muted">If this takes longer than expected, check your connection and retry.</p>
      <button className="btn-secondary mt-4" disabled={waiting} onClick={async () => {
        setWaiting(true);
        try { await reloadPrefs(); } catch (e) { toast((e as Error).message, 'error'); }
        finally { setWaiting(false); }
      }}>{waiting ? 'Retrying…' : 'Retry loading'}</button>
    </div>
  );
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d!, ...patch }));
  const setWeight = (c: Criterion, v: number) =>
    set({ weights: { ...draft.weights, [c]: v }, confirmedWeights: draft.confirmedWeights.includes(c) ? draft.confirmedWeights : [...draft.confirmedWeights, c] });

  const suggest = async () => {
    try {
      const r = await api<{ weights: CriterionWeights; kept: Criterion[] }>('/preferences/suggest-weights', {
        method: 'POST',
        body: { familyStages: draft.familyStages, weights: draft.weights, confirmedWeights: draft.confirmedWeights },
      });
      set({ weights: r.weights });
      toast(
        r.kept.length
          ? `Suggested weights applied. Kept your confirmed ${r.kept.map((k) => CRITERION_LABELS[k]).join(', ')}.`
          : 'Suggested weights applied — adjust any slider to confirm your own value.',
        'success',
      );
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const applyToSession = () => {
    const d = draft.destinations[0];
    setScoring({ weights: draft.weights, thresholds: draft.amenityThresholds, destination: d ? { lat: d.lat, lng: d.lng, label: d.label, address: d.address } : null });
  };

  const save = async () => {
    setErrors({});
    const validated = preferencesSchema.safeParse(draft);
    if (!validated.success) {
      setErrors(Object.fromEntries(validated.error.issues.map((issue) => [issue.path.join('.'), issue.message])));
      toast('Please correct the highlighted preference fields.', 'error');
      return;
    }
    if (!me) {
      applyToSession();
      toast('Weights applied for this visit. Sign in to save them.', 'success');
      return;
    }
    setSaving(true);
    try {
      await api<PreferencesDto>('/preferences', { method: 'PUT', body: validated.data });
      await reloadPrefs();
      toast('Family preferences saved.', 'success');
    } catch (e) {
      const err = e as ApiError;
      setErrors(err.fields);
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const err = (k: string) => errors[k];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-burgundy">Family preferences</h1>
          <p className="mt-1 max-w-2xl text-muted">
            Tell FamPlan what matters to your household. We only ask for planning stages — never children's names, birth dates or medical details.
          </p>
        </div>
        {me && prefs?.updatedAt && <p className="text-xs text-muted">Last saved {fmtDate(prefs.updatedAt, true)}</p>}
      </div>
      {!me && (
        <Notice className="mt-4">
          You're browsing as a visitor. Changes apply to this visit only. <Link to="/signin?next=/preferences" className="font-semibold underline">Sign in</Link> to save them.
        </Notice>
      )}
      {Object.keys(errors).length > 0 && <Notice tone="error" className="mt-4">Please correct the highlighted fields.</Notice>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <section className="card p-5" aria-labelledby="stages-h">
            <h2 id="stages-h" className="text-lg font-semibold text-burgundy">Family stages</h2>
            <p className="mt-1 text-xs text-muted">Choose all that apply over the next few years.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {FAMILY_STAGES.map((s) => {
                const on = draft.familyStages.includes(s);
                return (
                  <button key={s} className="chip-outline" aria-pressed={on} onClick={() => set({ familyStages: on ? draft.familyStages.filter((x) => x !== s) : [...draft.familyStages, s] })}>
                    {FAMILY_STAGE_LABELS[s]}
                  </button>
                );
              })}
            </div>
            <FieldError msg={err('familyStages')} />
          </section>

          <section className="card p-5" aria-labelledby="areas-h">
            <h2 id="areas-h" className="text-lg font-semibold text-burgundy">Preferred areas</h2>
            <div className="mt-3 flex gap-2">
              <label htmlFor="area-pick" className="sr-only">Add a planning area</label>
              <select id="area-pick" className="input" value={areaPick} onChange={(e) => setAreaPick(e.target.value)}>
                <option value="">Select towns…</option>
                {areas.filter((a) => !draft.preferredAreas.includes(a.planningArea)).map((a) => (
                  <option key={a.planningArea} value={a.planningArea}>
                    {a.planningArea} ({a.neighbourhoods})
                  </option>
                ))}
              </select>
              <button className="btn-secondary" disabled={!areaPick} onClick={() => { set({ preferredAreas: [...draft.preferredAreas, areaPick] }); setAreaPick(''); }}>
                Add
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {draft.preferredAreas.map((a, i) => (
                <span key={a} className="chip !py-1">
                  {a}
                  <button aria-label={`Remove ${a}`} onClick={() => set({ preferredAreas: draft.preferredAreas.filter((x) => x !== a) })}>
                    <Icon name="close" className="!text-[14px]" />
                  </button>
                  <FieldError msg={err(`preferredAreas.${i}`)} />
                </span>
              ))}
            </div>
          </section>

          <section className="card p-5" aria-labelledby="dest-h">
            <div className="flex items-center justify-between">
              <h2 id="dest-h" className="flex items-center gap-2 text-lg font-semibold text-burgundy">
                <Icon name="map" className="!text-[20px]" /> Priority destinations
              </h2>
              <span className="text-xs text-muted">{draft.destinations.length}/{DESTINATIONS_MAX}</span>
            </div>
            <ul className="mt-3 divide-y divide-line-soft">
              {draft.destinations.map((d, i) => (
                <li key={`${d.lat},${d.lng}`} className="flex items-center gap-3 py-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-peach text-burgundy">
                    <Icon name={i === 0 ? 'work' : 'place'} className="!text-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{d.label}{i === 0 && <span className="ml-2 text-[11px] font-normal text-muted">used for commute score</span>}</span>
                    <span className="block truncate text-xs text-muted">{d.address}</span>
                    <FieldError msg={err(`destinations.${i}.queryText`) ?? err(`destinations.${i}.label`)} />
                  </span>
                  <button className="rounded p-1 text-muted hover:text-cinnabar" aria-label={`Remove ${d.label}`} onClick={() => set({ destinations: draft.destinations.filter((_, j) => j !== i) })}>
                    <Icon name="delete" />
                  </button>
                </li>
              ))}
            </ul>
            <FieldError msg={err('destinations')} />
            {draft.destinations.length < DESTINATIONS_MAX ? (
              <div className="mt-3 space-y-2 rounded-lg bg-blush/50 p-3">
                <div>
                  <label className="label" htmlFor="dest-label">Label</label>
                  <input id="dest-label" className="input" placeholder="e.g. Work, Grandparents" maxLength={40} value={newDestLabel} onChange={(e) => setNewDestLabel(e.target.value)} />
                </div>
                <AddressSearch
                  label="Address"
                  onPick={(r) => {
                    const label = (newDestLabel.trim() || r.label).slice(0, 40);
                    if (draft.destinations.some((d) => d.lat.toFixed(5) === r.lat.toFixed(5) && d.lng.toFixed(5) === r.lng.toFixed(5)))
                      return toast('This destination is already saved.', 'error');
                    set({ destinations: [...draft.destinations, { label, queryText: r.query, address: r.address, lat: r.lat, lng: r.lng }] });
                    setNewDestLabel('');
                  }}
                />
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted">Maximum of {DESTINATIONS_MAX} destinations reached.</p>
            )}
          </section>

          <section className="card p-5" aria-labelledby="th-h">
            <h2 id="th-h" className="text-lg font-semibold text-burgundy">Amenity distances</h2>
            <p className="mt-1 text-xs text-muted">Preferred maximum distance for each amenity you care about. Used in count-based scores.</p>
            <div className="mt-3 space-y-2">
              {AMENITY_CATEGORIES.map((c) => (
                <div key={c} className="flex items-center justify-between gap-3">
                  <label htmlFor={`th-${c}`} className="flex items-center gap-2 text-sm text-ink">
                    <Icon name={AMENITY_ICONS[c]} className="!text-[18px] text-muted" />
                    {AMENITY_LABELS[c]}
                  </label>
                  <select
                    id={`th-${c}`}
                    className="input !w-28 !py-1"
                    value={draft.amenityThresholds[c] ?? ''}
                    onChange={(e) => {
                      const v = e.target.value ? (Number(e.target.value) as ProximityRadius) : undefined;
                      const next = { ...draft.amenityThresholds };
                      if (v) next[c] = v;
                      else delete next[c];
                      set({ amenityThresholds: next });
                    }}
                  >
                    <option value="">Not selected</option>
                    {PROXIMITY_RADII.map((r) => (
                      <option key={r} value={r}>{r >= 1000 ? `${r / 1000} km` : `${r} m`}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-5 lg:p-6" aria-labelledby="w-h">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="w-h" className="flex items-center gap-2 text-2xl font-semibold text-burgundy">
                  <Icon name="balance" /> Suitability weightings
                </h2>
                <p className="mt-1 text-sm text-muted">Importance from 0 (ignore) to 5 (essential). Weights recalculate the FamPlan score.</p>
              </div>
              <button className="btn-secondary" onClick={suggest} disabled={draft.familyStages.length === 0} title={draft.familyStages.length ? '' : 'Choose a family stage first'}>
                <Icon name="auto_awesome" className="!text-[18px]" />
                Suggest from stages
              </button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {CRITERIA.map((c) => (
                <div key={c} className="rounded-lg border border-burgundy/10 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-peach text-burgundy">
                      <Icon name={CRITERION_ICONS[c]} className="!text-[18px]" />
                    </span>
                    <label htmlFor={`w-${c}`} className="text-sm font-semibold text-burgundy">
                      {CRITERION_LABELS[c]}
                    </label>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted">
                    <span>Weight{draft.confirmedWeights.includes(c) && <span className="ml-1 text-good">· confirmed</span>}</span>
                    <span className="text-lg font-bold text-cinnabar">{draft.weights[c]}</span>
                  </div>
                  <input
                    id={`w-${c}`}
                    type="range"
                    min={0}
                    max={5}
                    step={1}
                    className="mt-1 w-full accent-cinnabar"
                    value={draft.weights[c]}
                    onChange={(e) => setWeight(c, Number(e.target.value))}
                    aria-valuetext={`${draft.weights[c]} out of 5`}
                  />
                  <FieldError msg={err(`weights.${c}`)} />
                </div>
              ))}
            </div>
            {CRITERIA.every((c) => draft.weights[c] === 0) && (
              <Notice tone="warn" className="mt-4">All weights are 0 — FamPlan will weight every available criterion equally.</Notice>
            )}
          </section>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              className="btn-secondary"
              onClick={() => {
                applyToSession();
                nav('/explore');
              }}
            >
              Use for this search
            </button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              <Icon name="save" className="!text-[18px]" />
              {me ? (saving ? 'Saving…' : 'Save preferences') : 'Apply for this visit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
