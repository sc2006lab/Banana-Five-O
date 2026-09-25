// UC-4.1 View Neighbourhood Profile (includes UC-6.1), UC-4.2 Explore Family Amenities, UC-5.1 View Map and Nearby Places.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Circle, GeoJSON, MapContainer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  AMENITY_CATEGORIES,
  AMENITY_ICONS,
  AMENITY_LABELS,
  PROXIMITY_RADII,
  type AmenityCategory,
  type AmenitySummaryDto,
  type FacilityDto,
  type NeighbourhoodDetail,
  type ProximityRadius,
} from '@famplan/shared';
import { api, ApiError, fmtDistance, scoringParams } from '../lib/api';
import { useApp } from '../state/AppState';
import { CategoryLegend, CATEGORY_COLORS, OneMapTiles, SG_BOUNDS, categoryIcon, homeIcon } from '../components/map';
import { ScoreBreakdown } from '../components/ScoreBreakdown';
import { Icon, Limitation, Notice, ProvenanceLine, Spinner, StateBadge, scoreTone } from '../components/ui';

const DEFAULT_LAYERS: AmenityCategory[] = ['childcare', 'kindergarten', 'primary_school', 'secondary_school', 'supermarket', 'clinic', 'park_playground', 'mrt'];

function FitBoundary({ detail, radius }: { detail: NeighbourhoodDetail; radius: number }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(L.latLng(detail.lat, detail.lng).toBounds(radius * 2.3), { padding: [20, 20] });
  }, [map, detail.id, detail.lat, detail.lng, radius]);
  return null;
}

function AmenityRow({ a, facilities, radius }: { a: AmenitySummaryDto; facilities: FacilityDto[]; radius: number }) {
  const [open, setOpen] = useState(false);
  const list = facilities.filter((f) => f.category === a.category);
  return (
    <li className="border-b border-line-soft last:border-0">
      <button className="flex w-full items-center gap-3 py-3 text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ background: CATEGORY_COLORS[a.category] }}>
          <Icon name={AMENITY_ICONS[a.category]} className="!text-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-burgundy">{AMENITY_LABELS[a.category]}</span>
            {a.state !== 'AVAILABLE' && <StateBadge state={a.state} />}
          </span>
          <span className="block truncate text-xs text-muted">
            {a.state === 'UNAVAILABLE'
              ? a.stateReason
              : a.nearest
                ? `Nearest: ${a.nearest.name} · ${fmtDistance(a.nearest.distanceM)}`
                : `None within ${fmtDistance(radius)}`}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-xl font-bold text-burgundy">{a.state === 'UNAVAILABLE' ? '—' : a.matchedCount}</span>
          <span className="block text-[11px] text-muted">within {fmtDistance(radius)}</span>
        </span>
        <Icon name={open ? 'expand_less' : 'expand_more'} className="text-muted" />
      </button>
      {open && (
        <div className="pb-3 pl-12">
          {a.stateReason && a.state !== 'UNAVAILABLE' && <p className="mb-2 text-xs text-fair">{a.stateReason}</p>}
          {list.length === 0 ? (
            <p className="text-sm text-muted">No matched facility in this radius.</p>
          ) : (
            <ul className="max-h-72 space-y-1.5 overflow-auto pr-1">
              {list.map((f) => (
                <li key={f.id} className="rounded border border-line-soft bg-white px-3 py-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold text-ink">{f.name}</span>
                    <span className="shrink-0 font-semibold text-cinnabar">{fmtDistance(f.distanceM)}</span>
                  </div>
                  <p className="text-xs text-muted">{f.address ?? 'Address not published by source'}</p>
                  {f.details && Object.keys(f.details).length > 0 && (
                    <p className="mt-0.5 text-[11px] text-muted">
                      {Object.entries(f.details)
                        .filter(([, v]) => v)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(' · ')}
                    </p>
                  )}
                  <p className="mt-0.5 text-[11px] text-muted/80">Source: {f.sourceId}</p>
                </li>
              ))}
            </ul>
          )}
          <ProvenanceLine items={a.provenance} className="mt-2" />
        </div>
      )}
    </li>
  );
}

export function ProfilePage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { scoring, shortlistIds, toggleShortlist, compareIds, toggleCompare, me } = useApp();
  const [radius, setRadius] = useState<ProximityRadius>(1000);
  const [detail, setDetail] = useState<NeighbourhoodDetail | null>(null);
  const [facilities, setFacilities] = useState<FacilityDto[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [layers, setLayers] = useState<AmenityCategory[]>(DEFAULT_LAYERS);
  const [tab, setTab] = useState<'amenities' | 'score'>('amenities');

  useEffect(() => {
    setError(null);
    const p = scoringParams(scoring, { radius });
    Promise.all([api<NeighbourhoodDetail>(`/neighbourhoods/${id}?${p}`), api<FacilityDto[]>(`/neighbourhoods/${id}/facilities?radius=${radius}`)])
      .then(([d, f]) => {
        setDetail(d);
        setFacilities(f);
        document.title = `${d.name} — FamPlan`;
      })
      .catch((e) => setError(e as ApiError));
  }, [id, radius, scoring]);

  const shown = useMemo(() => facilities.filter((f) => layers.includes(f.category)), [facilities, layers]);

  if (error) return <div className="mx-auto max-w-xl p-8"><Notice tone="error">{error.message}</Notice><Link to="/" className="btn-secondary mt-4">Back to search</Link></div>;
  if (!detail) return <Spinner label="Loading neighbourhood" />;
  const tone = scoreTone(detail.score.total);
  const saved = shortlistIds.has(detail.id);
  const comparing = compareIds.includes(detail.id);

  return (
    <div className="flex flex-col md:h-[calc(100dvh-64px)] md:flex-row">
      <section className="relative h-[45vh] md:h-auto md:flex-1" aria-label={`Map of ${detail.name} and nearby facilities`}>
        <MapContainer center={[detail.lat, detail.lng]} zoom={15} maxBounds={SG_BOUNDS} className="h-full w-full">
          <OneMapTiles />
          <FitBoundary detail={detail} radius={radius} />
          {detail.boundary && (
            <GeoJSON key={detail.id} data={detail.boundary} style={{ color: '#461220', weight: 2, dashArray: '6 4', fillColor: '#fcb9b2', fillOpacity: 0.12 }} />
          )}
          <Circle center={[detail.lat, detail.lng]} radius={radius} pathOptions={{ color: '#b23a48', weight: 1.5, fillOpacity: 0.04 }} />
          <Marker position={[detail.lat, detail.lng]} icon={homeIcon()} title={`${detail.name} reference point`} alt={`${detail.name} reference point`} zIndexOffset={1000}>
            <Popup>
              <strong>{detail.name}</strong>
              <br />
              Reference point used for all distances.
            </Popup>
          </Marker>
          {shown.map((f) => (
            <Marker key={`${f.category}-${f.id}`} position={[f.lat, f.lng]} icon={categoryIcon(f.category)} alt={`${AMENITY_LABELS[f.category]}: ${f.name}, ${fmtDistance(f.distanceM)}`} title={f.name}>
              <Popup>
                <strong>{f.name}</strong>
                <br />
                {AMENITY_LABELS[f.category]} · {fmtDistance(f.distanceM)} away
                {f.address && (
                  <>
                    <br />
                    {f.address}
                  </>
                )}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        <div className="absolute top-3 right-3 z-[1000] rounded-lg bg-white/95 px-3 py-2 shadow-float">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-burgundy">
            <Icon name="location_on" className="!text-[18px] text-cinnabar" />
            {detail.name}
          </p>
        </div>
        <div className="absolute right-3 bottom-8 left-3 z-[1000] rounded-lg bg-white/95 p-2 shadow-float md:right-auto md:max-w-md">
          <fieldset>
            <legend className="sr-only">Map layers</legend>
            <div className="flex flex-wrap gap-1">
              {AMENITY_CATEGORIES.map((c) => (
                <button
                  key={c}
                  aria-pressed={layers.includes(c)}
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${layers.includes(c) ? 'border-transparent text-white' : 'border-line bg-white text-muted'}`}
                  style={layers.includes(c) ? { background: CATEGORY_COLORS[c] } : undefined}
                  onClick={() => setLayers((l) => (l.includes(c) ? l.filter((x) => x !== c) : [...l, c]))}
                >
                  <Icon name={AMENITY_ICONS[c]} className="!text-[13px]" />
                  {AMENITY_LABELS[c].split(' ')[0]}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      <section className="flex w-full flex-col border-l border-line-soft bg-surface md:w-[520px] lg:w-[560px] min-h-0" aria-labelledby="nh-title">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-6 md:px-6">
          <button onClick={() => nav(-1)} className="flex items-center gap-2 text-sm font-semibold text-muted hover:text-burgundy">
            <Icon name="arrow_back" className="!text-[18px]" />
            Back to search
          </button>
          <div className="mt-3 flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Neighbourhood profile</p>
              <h1 id="nh-title" className="text-3xl font-bold tracking-tight text-burgundy">
                {detail.name}
              </h1>
              <p className="text-muted">
                {detail.planningArea} planning area · {detail.region}
              </p>
            </div>
            <div className={`shrink-0 rounded-lg border border-burgundy/10 px-4 py-2 text-center ${tone.bg}`} title={tone.label}>
              <p className={`text-3xl font-bold ${tone.text}`}>
                {detail.score.total}
                <span className="text-base">/100</span>
              </p>
              <p className="text-xs font-semibold text-muted">Family score</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-burgundy">Radius</span>
            <div className="flex overflow-hidden rounded-full border border-line" role="radiogroup" aria-label="Nearby facility radius">
              {PROXIMITY_RADII.map((r) => (
                <button key={r} role="radio" aria-checked={radius === r} className={`px-3 py-1 text-sm font-semibold ${radius === r ? 'bg-burgundy text-white' : 'bg-white text-burgundy hover:bg-blush'}`} onClick={() => setRadius(r)}>
                  {fmtDistance(r)}
                </button>
              ))}
            </div>
          </div>

          <details className="mt-3 rounded border border-line-soft bg-white px-3 py-2 text-xs text-muted">
            <summary className="cursor-pointer font-semibold text-burgundy">Coverage basis and data sources</summary>
            <p className="mt-2">
              <strong>Boundary:</strong> {detail.boundaryBasis}
            </p>
            <p className="mt-1">
              <strong>Reference point:</strong> {detail.referencePointBasis}
            </p>
            <ProvenanceLine items={detail.provenance} className="mt-2" />
          </details>

          <div className="mt-5 flex border-b border-line-soft" role="tablist">
            {(
              [
                ['amenities', 'Family amenities'],
                ['score', 'Score breakdown'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === k ? 'border-cinnabar text-burgundy' : 'border-transparent text-muted hover:text-burgundy'}`} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'amenities' ? (
            <div role="tabpanel" className="mt-2">
              <p className="mb-1 text-xs text-muted">Counts and distances within the selected radius. Expand a category for the full list — a text alternative to the map.</p>
              <ul>
                {detail.amenities.map((a) => (
                  <AmenityRow key={a.category} a={a} facilities={facilities} radius={radius} />
                ))}
              </ul>
              <CategoryLegend categories={AMENITY_CATEGORIES.filter((c) => c !== 'bus_stop')} />
            </div>
          ) : (
            <div role="tabpanel" className="mt-4">
              <p className="mb-3 text-sm text-muted">
                Using {me ? 'your saved' : 'default'} weights{scoring.destination ? ` and commute to ${scoring.destination.label}` : ''}.{' '}
                <Link to="/preferences" className="font-semibold text-cinnabar hover:underline">
                  Edit priorities
                </Link>
              </p>
              <ScoreBreakdown score={detail.score} />
            </div>
          )}

          <div className="mt-6 space-y-1 border-t border-line-soft pt-3">
            {detail.limitations.map((l) => (
              <Limitation key={l}>{l}</Limitation>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-line-soft bg-white p-3 md:px-6">
          <button className="btn-secondary" aria-pressed={saved} onClick={() => toggleShortlist(detail.id, detail.name)}>
            <Icon name="favorite" filled={saved} className="!text-[18px]" />
            {saved ? 'Saved' : 'Shortlist'}
          </button>
          <button className="btn-secondary" aria-pressed={comparing} onClick={() => toggleCompare(detail.id)}>
            <Icon name={comparing ? 'check_box' : 'compare_arrows'} className="!text-[18px]" />
            {comparing ? 'Comparing' : 'Compare'}
          </button>
          <Link to={`/n/${detail.id}/commute`} className="btn-dark">
            <Icon name="commute" className="!text-[18px]" />
            Commute
          </Link>
        </div>
      </section>
    </div>
  );
}
