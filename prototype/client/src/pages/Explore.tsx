// UC-3.1 Search Neighbourhoods + UC-3.2 Apply Saved Preferences (extend).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapContainer, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  AMENITY_CATEGORIES,
  AMENITY_LABELS,
  FAMILY_STAGES,
  FAMILY_STAGE_LABELS,
  LIMITATION_EDUCATION,
  PROXIMITY_RADII,
  SORT_LABELS,
  SORT_OPTIONS,
  type AmenityCategory,
  type AreaDto,
  type FamilyStage,
  type NeighbourhoodSummary,
  type ProximityRadius,
  type SearchResponse,
  type SortOption,
} from '@famplan/shared';
import { api, ApiError, fmtDistance, scoringParams } from '../lib/api';
import { useApp } from '../state/AppState';
import { AddressSearch } from '../components/AddressSearch';
import { Dropdown } from '../components/Dropdown';
import { OneMapTiles, SG_BOUNDS, SG_CENTER, pinIcon } from '../components/map';
import { FieldError, Icon, Limitation, Notice, ScorePill, Spinner, scoreTone } from '../components/ui';
import { AmenityHighlight } from '../components/AmenityHighlight';
import { Rosette } from '../components/Rosette';
import { toneFor } from '../components/SurveyMap';

interface Filters {
  q: string;
  areas: string[];
  stages: FamilyStage[];
  radius: ProximityRadius;
  category: AmenityCategory | '';
  minCount: string;
  maxNearest: string;
  maxCommute: string;
  sort: SortOption;
}

const EMPTY: Filters = { q: '', areas: [], stages: [], radius: 1000, category: '', minCount: '', maxNearest: '', maxCommute: '', sort: 'score' };
let remembered: Filters = EMPTY; // survives navigation to a profile and back

const radiusLabel = (r: number) => (r >= 1000 ? `${r / 1000} km` : `${r} m`);

function FitToResults({ results, focus, view }: { results: NeighbourhoodSummary[]; focus: { lat: number; lng: number } | null; view: string }) {
  const map = useMap();
  const key = results.map((r) => r.id).join(',');
  useEffect(() => {
    map.invalidateSize();
    if (focus) map.setView([focus.lat, focus.lng], 14);
    else if (results.length) map.fitBounds(L.latLngBounds(results.map((r) => [r.lat, r.lng])), { padding: [40, 40], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, focus?.lat, focus?.lng, view]);
  return null;
}

function ResultCard({ r, radius, destinationLabel, index = 0 }: { r: NeighbourhoodSummary; radius: number; destinationLabel?: string; index?: number }) {
  const { shortlistIds, toggleShortlist, compareIds, toggleCompare } = useApp();
  const h = Object.fromEntries(r.highlights.map((x) => [x.category, x])) as Record<AmenityCategory, NeighbourhoodSummary['highlights'][number]>;
  const saved = shortlistIds.has(r.id);
  const comparing = compareIds.includes(r.id);
  return (
    <article
      className="card overflow-hidden transition-shadow duration-150 hover:shadow-float"
      style={{ ['--i' as string]: index % 12 }}
      aria-labelledby={`r-${r.id}`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-line-soft bg-white px-5 pt-4 pb-3">
        <div className="min-w-0">
          <p className="eyebrow">Neighbourhood profile</p>
          <h3 id={`r-${r.id}`} className="mt-0.5 truncate text-xl font-semibold text-burgundy">
            <Link to={`/n/${r.id}`} className="hover:underline">
              {r.name}
            </Link>
          </h3>
          <p className="text-sm text-muted">
            {r.planningArea} · {r.region}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <ScorePill score={r.score.total} />
          <Rosette values={r.score.breakdown.map((b) => b.normalisedValue)} size={54} tone={toneFor(r.score.total)} />
        </div>
      </div>
      <div className="px-5 pt-3 pb-4">
        <div className="flex flex-wrap gap-1.5">
          {r.highlights.filter((item) => ['childcare', 'kindergarten', 'primary_school', 'secondary_school', 'supermarket', 'mrt'].includes(item.category)).map((item) => (
            <AmenityHighlight key={item.category} item={item} />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Within {radiusLabel(radius)} of the neighbourhood reference point.
          {' '}<Link to={`/n/${r.id}`} className="underline">Sources, freshness and score explanation</Link>
        </p>
        <div className="mt-3 flex items-end justify-between border-t border-line-soft pt-3">
          <div>
            {r.commuteMin !== null ? (
              <>
                <p className="text-xs text-muted">Commute to {destinationLabel ?? 'destination'} (estimate)</p>
                <p className="text-2xl font-bold text-burgundy">~{r.commuteMin} min</p>
              </>
            ) : (
              <>
                <p className="text-xs text-muted">Nearest supermarket · clinic</p>
                <p className="text-lg font-bold text-burgundy">
                  {fmtDistance(h.supermarket.nearestM)} · {fmtDistance(h.clinic.nearestM)}
                </p>
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              className={`rounded-full p-2 hover:bg-blush ${comparing ? 'text-cinnabar' : 'text-muted'}`}
              aria-pressed={comparing}
              aria-label={comparing ? `Remove ${r.name} from comparison` : `Add ${r.name} to comparison`}
              title="Compare"
              onClick={() => toggleCompare(r.id)}
            >
              <Icon name={comparing ? 'check_box' : 'check_box_outline_blank'} />
            </button>
            <button
              className={`rounded-full p-2 hover:bg-blush ${saved ? 'text-cinnabar' : 'text-muted'}`}
              aria-pressed={saved}
              aria-label={saved ? `Remove ${r.name} from shortlist` : `Save ${r.name} to shortlist`}
              title="Shortlist"
              onClick={() => toggleShortlist(r.id, r.name)}
            >
              <Icon name="favorite" filled={saved} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function ExplorePage() {
  const { me, prefs, scoring, setScoring, compareIds, toast } = useApp();
  const nav = useNavigate();
  const [f, setF] = useState<Filters>(remembered);
  const [draftQ, setDraftQ] = useState(remembered.q);
  const [areas, setAreas] = useState<AreaDto[]>([]);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [results, setResults] = useState<NeighbourhoodSummary[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');
  const listTop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    remembered = f;
  }, [f]);
  useEffect(() => {
    void api<AreaDto[]>('/areas').then(setAreas).catch(() => undefined);
  }, []);

  const params = useMemo(
    () =>
      scoringParams(scoring, {
        q: f.q,
        areas: f.areas.join(','),
        stages: f.stages.join(','),
        radius: f.radius,
        category: f.category,
        minCount: f.minCount,
        maxNearest: f.maxNearest,
        maxCommute: f.maxCommute,
        sort: f.sort,
        pageSize: 12,
      }),
    [f, scoring],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const p = new URLSearchParams(params);
    p.set('page', String(page));
    api<SearchResponse>(`/neighbourhoods?${p}`, { signal: ctrl.signal })
      .then((d) => {
        setData(d);
        setResults((prev) => (page === 1 ? d.results : [...prev, ...d.results]));
      })
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setError(e as ApiError);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [params, page]);

  const update = (patch: Partial<Filters>) => {
    setPage(1);
    setF((x) => ({ ...x, ...patch }));
    listTop.current?.scrollIntoView({ block: 'start' });
  };

  const applyMyPreferences = () => {
    if (!prefs) return;
    const d = prefs.destinations[0];
    setScoring({ weights: prefs.weights, thresholds: prefs.amenityThresholds, destination: d ? { lat: d.lat, lng: d.lng, label: d.label, address: d.address } : null });
    update({ areas: prefs.preferredAreas, stages: prefs.familyStages });
    toast('Applied your saved family preferences to this search. Your saved values were not changed.', 'success');
  };

  const fieldErr = (k: string) => error?.fields?.[k];
  const activeCount = f.areas.length + f.stages.length + (f.category ? 1 : 0) + (f.maxCommute ? 1 : 0);

  return (
    <div className="flex h-[calc(100dvh-128px)] flex-col md:h-[calc(100dvh-69px)] md:flex-row">
      {/* Map */}
      <section className={`relative flex-1 ${view === 'map' ? 'block' : 'hidden'} md:block`} aria-label="Map of results">
        <MapContainer center={SG_CENTER} zoom={12} maxBounds={SG_BOUNDS} className="h-full w-full" scrollWheelZoom>
          <OneMapTiles />
          <FitToResults results={results} focus={data?.addressMatch ?? null} view={view} />
          {results.map((r) => (
            <Marker
              key={r.id}
              position={[r.lat, r.lng]}
              icon={pinIcon(String(r.score.total), r.score.total >= 75 ? '#a81724' : r.score.total >= 55 ? '#c51a27' : '#8a4b00')}
              title={`${r.name}, score ${r.score.total}`}
              alt={`${r.name}, family suitability score ${r.score.total}`}
              eventHandlers={{ click: () => nav(`/n/${r.id}`), keypress: (e) => (e.originalEvent as KeyboardEvent).key === 'Enter' && nav(`/n/${r.id}`) }}
            >
              <Tooltip direction="top" offset={[0, -28]}>
                {r.name} · {r.planningArea}
              </Tooltip>
            </Marker>
          ))}
          {data?.addressMatch && (
            <Marker position={[data.addressMatch.lat, data.addressMatch.lng]} icon={pinIcon('You searched here', '#202124')} alt={data.addressMatch.address} />
          )}
        </MapContainer>
        <button className="btn-dark absolute top-4 right-4 z-[1000] md:hidden" onClick={() => setView('list')}>
          Show results
        </button>
        {compareIds.length > 0 && (
          <div className="absolute bottom-6 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-3 rounded-full bg-burgundy py-2 pr-2 pl-5 text-sm text-white shadow-float">
            {compareIds.length} selected to compare
            <button className="btn-primary btn-sm rounded-full" disabled={compareIds.length < 2} onClick={() => nav(`/compare?ids=${compareIds.join(',')}`)}>
              Compare now
            </button>
          </div>
        )}
      </section>

      {/* Results panel */}
      <section className={`flex w-full flex-col border-l border-line-soft bg-surface md:w-[520px] lg:w-[560px] ${view === 'list' ? 'flex' : 'hidden'} md:flex min-h-0`} aria-label="Search and results">
        <div className="border-b border-line-soft px-4 pt-4 pb-3 md:px-6">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-2xl font-semibold text-burgundy">Discover neighbourhoods</h1>
            <p className="text-sm text-muted" aria-live="polite">
              {data ? `${data.total} result${data.total === 1 ? '' : 's'}` : ''}
            </p>
          </div>
          <form
            className="mt-3 flex gap-2"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              const candidate = draftQ.trim();
              if (/^(?:Singapore\s*|S\s*\(?)?\d+\s*\)?$/i.test(candidate)
                && !/^(?:Singapore\s*|S\s*\(?)?\d{6}\s*\)?$/i.test(candidate)) {
                toast('Enter all six digits of the Singapore postal code, including any leading zero.');
                return;
              }
              update({ q: draftQ.trim() });
            }}
          >
            <label htmlFor="q" className="sr-only">
              Search by town, planning area, estate, address or postal code
            </label>
            <div className="relative flex-1">
              <Icon name="search" className="pointer-events-none absolute top-2.5 left-3 !text-[20px] text-muted" />
              <input
                id="q"
                className="input pl-10"
                placeholder="Singapore postal code, address or town"
                value={draftQ}
                onChange={(e) => setDraftQ(e.target.value)}
                aria-invalid={Boolean(fieldErr('q'))}
              />
            </div>
            <button className="btn-dark">Search</button>
          </form>
          <FieldError msg={fieldErr('q')} />
          <p className="mt-2 text-xs text-muted">
            Enter a six-digit Singapore postal code (e.g. 238801), or a street address or town name.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Dropdown label={f.areas.length ? `Areas (${f.areas.length})` : 'Area'} active={f.areas.length > 0} width="w-80">
              <fieldset>
                <legend className="label">Planning areas</legend>
                <div className="grid max-h-64 grid-cols-2 gap-1 overflow-auto pr-1">
                  {areas.map((a) => (
                    <label key={a.planningArea} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-blush">
                      <input
                        type="checkbox"
                        className="accent-cinnabar"
                        checked={f.areas.includes(a.planningArea)}
                        onChange={(e) =>
                          update({ areas: e.target.checked ? [...f.areas, a.planningArea] : f.areas.filter((x) => x !== a.planningArea) })
                        }
                      />
                      {a.planningArea}
                    </label>
                  ))}
                </div>
              </fieldset>
            </Dropdown>
            <Dropdown label={f.stages.length ? `Family stage (${f.stages.length})` : 'Family stage'} active={f.stages.length > 0}>
              <fieldset>
                <legend className="label">Show areas with nearby services for</legend>
                {FAMILY_STAGES.map((s) => (
                  <label key={s} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-blush">
                    <input
                      type="checkbox"
                      className="accent-cinnabar"
                      checked={f.stages.includes(s)}
                      onChange={(e) => update({ stages: e.target.checked ? [...f.stages, s] : f.stages.filter((x) => x !== s) })}
                    />
                    {FAMILY_STAGE_LABELS[s]}
                  </label>
                ))}
              </fieldset>
            </Dropdown>
            <div className="flex overflow-hidden rounded-full border border-line" role="radiogroup" aria-label="Facility radius">
              {PROXIMITY_RADII.map((r) => (
                <button
                  key={r}
                  role="radio"
                  aria-checked={f.radius === r}
                  className={`px-3 py-1.5 text-sm font-semibold ${f.radius === r ? 'bg-burgundy text-white' : 'bg-white text-burgundy hover:bg-blush'}`}
                  onClick={() => update({ radius: r })}
                >
                  {radiusLabel(r)}
                </button>
              ))}
            </div>
            <Dropdown label={`Sort: ${SORT_LABELS[f.sort].split(' ')[0]}`} align="right" width="w-64">
              {(close) => (
                <div role="radiogroup" aria-label="Sort results by">
                  {SORT_OPTIONS.map((s) => (
                    <button
                      key={s}
                      role="radio"
                      aria-checked={f.sort === s}
                      className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-blush ${f.sort === s ? 'font-semibold text-cinnabar' : ''}`}
                      onClick={() => {
                        update({ sort: s });
                        close();
                      }}
                    >
                      {SORT_LABELS[s]}
                      {f.sort === s && <Icon name="check" className="!text-[18px]" />}
                    </button>
                  ))}
                </div>
              )}
            </Dropdown>
            <button className="chip-outline" aria-expanded={showMore} aria-pressed={activeCount > 0 && showMore} onClick={() => setShowMore((s) => !s)}>
              <Icon name="tune" className="!text-[18px]" />
              More filters
            </button>
          </div>
          <FieldError msg={fieldErr('sort')} />

          {showMore && (
            <div className="mt-3 grid gap-3 rounded-lg border border-burgundy/10 bg-white p-3 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <label className="label" htmlFor="cat">
                  Amenity
                </label>
                <select id="cat" className="input" value={f.category} onChange={(e) => update({ category: e.target.value as AmenityCategory | '' })} aria-invalid={Boolean(fieldErr('category'))}>
                  <option value="">Any</option>
                  {AMENITY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {AMENITY_LABELS[c]}
                    </option>
                  ))}
                </select>
                <FieldError msg={fieldErr('category')} />
              </div>
              <div>
                <label className="label" htmlFor="minc">
                  At least (count)
                </label>
                <input id="minc" type="number" inputMode="numeric" className="input" value={f.minCount} onChange={(e) => update({ minCount: e.target.value })} aria-invalid={Boolean(fieldErr('minCount'))} />
                <FieldError msg={fieldErr('minCount')} />
              </div>
              <div>
                <label className="label" htmlFor="maxn">
                  Nearest within (m)
                </label>
                <input id="maxn" type="number" inputMode="numeric" className="input" value={f.maxNearest} onChange={(e) => update({ maxNearest: e.target.value })} aria-invalid={Boolean(fieldErr('maxNearest'))} />
                <FieldError msg={fieldErr('maxNearest')} />
              </div>
              <div className="sm:col-span-2">
                {scoring.destination ? (
                  <div>
                    <p className="label">Commute destination</p>
                    <div className="flex items-center justify-between gap-2 rounded border border-line px-3 py-2 text-sm">
                      <span>
                        <Icon name="work" className="mr-1 !text-[16px] align-[-3px] text-cinnabar" />
                        <strong>{scoring.destination.label}</strong> {scoring.destination.address && <span className="text-muted">— {scoring.destination.address}</span>}
                      </span>
                      <button className="text-xs font-semibold text-cinnabar hover:underline" onClick={() => setScoring((s) => ({ ...s, destination: null }))}>
                        Change
                      </button>
                    </div>
                  </div>
                ) : (
                  <AddressSearch
                    label="Commute destination"
                    onPick={(r) => {
                      setPage(1);
                      setScoring((s) => ({ ...s, destination: { lat: r.lat, lng: r.lng, label: r.label.slice(0, 40), address: r.address } }));
                    }}
                  />
                )}
              </div>
              <div>
                <label className="label" htmlFor="maxc">
                  Max commute (min)
                </label>
                <input id="maxc" type="number" inputMode="numeric" className="input" value={f.maxCommute} onChange={(e) => update({ maxCommute: e.target.value })} aria-invalid={Boolean(fieldErr('maxCommute'))} />
                <FieldError msg={fieldErr('maxCommute')} />
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {me ? (
              <button className="btn btn-sm bg-peach text-burgundy hover:bg-salmon" onClick={applyMyPreferences} disabled={!prefs}>
                <Icon name="auto_fix_high" className="!text-[16px]" />
                Apply my preferences
              </button>
            ) : (
              <Link to="/signin" className="text-xs font-semibold text-cinnabar hover:underline">
                Sign in to apply saved family preferences
              </Link>
            )}
            <Link to="/preferences" className="btn-ghost btn-sm">
              <Icon name="balance" className="!text-[16px]" />
              Adjust weights
            </Link>
            {(activeCount > 0 || f.q) && (
              <button
                className="ml-auto text-xs font-semibold text-cinnabar hover:underline"
                onClick={() => {
                  setDraftQ('');
                  update({ ...EMPTY, sort: f.sort, radius: f.radius });
                }}
              >
                Clear filters
              </button>
            )}
          </div>
          <div className="mt-2 flex md:hidden">
            <button className="btn-secondary btn-sm w-full" onClick={() => setView(view === 'list' ? 'map' : 'list')}>
              <Icon name={view === 'list' ? 'map' : 'list'} className="!text-[16px]" />
              {view === 'list' ? 'Show map' : 'Show list'}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
          <div ref={listTop} />
          {error && <Notice tone="error">{error.message}</Notice>}
          {data?.matchedBy === 'address' && data.addressMatch && (
            <Notice className="mb-3">
              Showing neighbourhoods around <strong>{data.addressMatch.address}</strong>
              {data.addressMatch.neighbourhoodId && results[0]?.id === data.addressMatch.neighbourhoodId
                ? ' — the first result contains this address.' : '.'}
              {' '}Scores and amenity distances describe the neighbourhood reference point, not your individual home.
            </Notice>
          )}
          {data && data.total === 0 && !loading && (
            <div className="card p-6 text-center">
              <Icon name="travel_explore" className="!text-[40px] text-salmon" />
              <p className="mt-2 font-semibold text-burgundy">No neighbourhoods match these filters.</p>
              <p className="mt-1 text-sm text-muted">Try a larger radius, fewer family stages, or a different area.</p>
            </div>
          )}
          {loading && results.length === 0 && (
            <div className="space-y-4" aria-hidden="true">
              {[0, 1, 2].map((k) => (
                <div key={k} className="skeleton h-48 rounded-lg" />
              ))}
            </div>
          )}
          <div className="stagger space-y-4">
            {results.map((r, i) => (
              <ResultCard key={r.id} r={r} index={i} radius={f.radius} destinationLabel={scoring.destination?.label} />
            ))}
          </div>
          {loading && results.length > 0 && <Spinner label="Finding neighbourhoods" />}
          {data && results.length < data.total && !loading && (
            <button className="btn-secondary mt-4 w-full" onClick={() => setPage((p) => p + 1)}>
              Load more results ({data.total - results.length} more)
            </button>
          )}
          {data && (
            <div className="mt-6 space-y-1 border-t border-line-soft pt-3">
              <Limitation>{data.limitation}</Limitation>
              <Limitation>{LIMITATION_EDUCATION}</Limitation>
              <Limitation>
                Scores use {me ? 'your saved' : 'default'} weights{scoring.destination ? ` and commute estimates to ${scoring.destination.label}` : ''}. Legend: score colour{' '}
                <span className={`font-semibold ${scoreTone(80).text}`}>≥75 strong</span>, <span className={`font-semibold ${scoreTone(60).text}`}>55–74 fair</span>,{' '}
                <span className={`font-semibold ${scoreTone(40).text}`}>&lt;55 weak</span>.
              </Limitation>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
