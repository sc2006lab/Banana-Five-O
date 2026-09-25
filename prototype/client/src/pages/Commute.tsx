// UC-5.2 Check Commute Route (FR-TRV-02 – FR-TRV-05).
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapContainer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { TRAVEL_MODES, TRAVEL_MODE_LABELS, type NeighbourhoodDetail, type RouteEstimateDto, type TravelMode } from '@famplan/shared';
import { api, ApiError, fmtDate, fmtDistance, scoringParams } from '../lib/api';
import { useApp } from '../state/AppState';
import { AddressSearch } from '../components/AddressSearch';
import { OneMapTiles, SG_BOUNDS, homeIcon, pinIcon } from '../components/map';
import { Icon, Notice, Spinner } from '../components/ui';

const MODE_ICONS: Record<TravelMode, string> = { pt: 'directions_transit', drive: 'directions_car', walk: 'directions_walk', cycle: 'directions_bike' };

function FitRoute({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [50, 50] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(pts.slice(0, 1)), JSON.stringify(pts.slice(-1)), pts.length]);
  return null;
}

type Dest = { lat: number; lng: number; label: string; address?: string };

export function CommutePage() {
  const { id = '' } = useParams();
  const { prefs, scoring } = useApp();
  const [n, setN] = useState<NeighbourhoodDetail | null>(null);
  const saved: Dest[] = prefs?.destinations.map((d) => ({ lat: d.lat, lng: d.lng, label: d.label, address: d.address })) ?? [];
  const [dest, setDest] = useState<Dest | null>(scoring.destination ?? saved[0] ?? null);
  const [mode, setMode] = useState<TravelMode>('pt');
  const [barrierFree, setBarrierFree] = useState(false);
  const [route, setRoute] = useState<RouteEstimateDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<NeighbourhoodDetail>(`/neighbourhoods/${id}?${scoringParams(scoring)}`)
      .then(setN)
      .catch((e) => setError((e as ApiError).message));
  }, [id, scoring]);

  useEffect(() => {
    if (!dest) return;
    setLoading(true);
    setError(null);
    api<RouteEstimateDto>(`/neighbourhoods/${id}/route?destLat=${dest.lat}&destLng=${dest.lng}&mode=${mode}&barrierFree=${barrierFree}`)
      .then(setRoute)
      .catch((e) => setError((e as ApiError).message))
      .finally(() => setLoading(false));
  }, [id, dest, mode, barrierFree]);

  if (!n) return error ? <div className="p-8"><Notice tone="error">{error}</Notice></div> : <Spinner />;
  const pts: [number, number][] = route?.geometry ?? (dest ? [[n.lat, n.lng], [dest.lat, dest.lng]] : [[n.lat, n.lng]]);

  return (
    <div className="mx-auto grid max-w-[1400px] gap-6 px-4 py-6 md:grid-cols-[380px_1fr] md:px-8">
      <div>
        <Link to={`/n/${id}`} className="flex items-center gap-2 text-sm font-semibold text-muted hover:text-burgundy">
          <Icon name="arrow_back" className="!text-[18px]" />
          Back to {n.name}
        </Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-burgundy">Commute & routes</h1>
        <p className="mt-1 text-muted">From the {n.name} reference point to a priority destination.</p>

        <div className="card mt-5 p-4">
          <h2 className="text-lg font-semibold text-burgundy">Priority destination</h2>
          <div className="mt-3 flex items-center gap-2 rounded border border-line bg-blush/60 px-3 py-2 text-sm">
            <Icon name="home" className="!text-[18px] text-burgundy" />
            {n.name}, {n.planningArea}
          </div>
          {saved.length > 0 && (
            <div className="mt-3">
              <label className="label" htmlFor="saved-dest">
                Saved destinations
              </label>
              <select
                id="saved-dest"
                className="input"
                value={dest ? saved.findIndex((s) => s.lat === dest.lat && s.lng === dest.lng) : -1}
                onChange={(e) => setDest(saved[Number(e.target.value)] ?? null)}
              >
                <option value={-1}>Choose…</option>
                {saved.map((s, i) => (
                  <option key={i} value={i}>
                    {s.label} — {s.address}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="mt-3">
            <AddressSearch label={saved.length ? 'Or search another place' : 'Destination'} onPick={(r) => setDest({ lat: r.lat, lng: r.lng, label: r.label, address: r.address })} />
          </div>
          {dest && (
            <p className="mt-3 flex items-center gap-2 text-sm">
              <Icon name="flag" className="!text-[18px] text-cinnabar" />
              <strong className="text-burgundy">{dest.label}</strong>
            </p>
          )}
        </div>

        <fieldset className="mt-4">
          <legend className="label">Travel mode</legend>
          <div className="grid grid-cols-4 gap-2" role="radiogroup">
            {TRAVEL_MODES.map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={`flex flex-col items-center gap-1 rounded-lg border py-3 text-xs font-semibold ${mode === m ? 'border-cinnabar bg-blush text-cinnabar' : 'border-line bg-white text-muted hover:bg-blush'}`}
              >
                <Icon name={MODE_ICONS[m]} />
                {TRAVEL_MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-line bg-white px-4 py-3">
          <span>
            <span className="block text-sm font-semibold text-burgundy">Barrier-free routes only</span>
            <span className="block text-xs text-muted">Prioritise lifts, ramps and sheltered paths where the provider supports it.</span>
          </span>
          <input type="checkbox" aria-label="Barrier-free routes only" className="h-5 w-5 accent-cinnabar" checked={barrierFree} onChange={(e) => setBarrierFree(e.target.checked)} />
        </label>

        <div className="mt-4" aria-live="polite">
          {!dest && <Notice>Choose a destination to see the route and travel time.</Notice>}
          {loading && <Spinner label="Requesting route" />}
          {error && <Notice tone="error">{error}</Notice>}
          {route && !loading && (
            <div className={`card p-4 ${route.state === 'OK' ? 'border-cinnabar/40 bg-blush/40' : ''}`}>
              <div className="flex items-start justify-between">
                <div>
                  <span className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase ${route.state === 'OK' ? 'bg-salmon text-burgundy' : 'bg-fair-bg text-fair'}`}>
                    {route.state === 'OK' ? 'Live route' : 'Estimate'}
                  </span>
                  <p className="mt-2 text-sm text-muted">
                    {TRAVEL_MODE_LABELS[route.mode]} · {fmtDistance(route.distanceM)}
                  </p>
                </div>
                <p className="text-3xl font-bold text-burgundy">{route.durationS !== null ? `${Math.round(route.durationS / 60)} min` : '—'}</p>
              </div>
              {route.legs.length > 0 && (
                <ol className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  {route.legs.map((l, i) => (
                    <li key={i} className="flex items-center gap-1">
                      {i > 0 && <span className="text-muted">·</span>}
                      <span className="font-semibold text-burgundy">{l.label}</span> {Math.round(l.durationS / 60)} min
                    </li>
                  ))}
                </ol>
              )}
              {route.message && <p className="mt-3 text-xs text-fair">{route.message}</p>}
              {route.estimateBasis && <p className="mt-1 text-xs text-muted">{route.estimateBasis}</p>}
              {route.barrierFree.requested && (
                <Notice tone="warn" className="mt-3">
                  {route.barrierFree.message}
                </Notice>
              )}
              <p className="mt-3 border-t border-line-soft pt-2 text-[11px] text-muted">
                <Icon name="database" className="mr-1 !text-[12px] align-[-2px]" />
                Provider: {route.provider} · retrieved {fmtDate(route.retrievedAt, true)}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="card relative h-[60vh] overflow-hidden md:h-[calc(100dvh-140px)]">
        <MapContainer center={[n.lat, n.lng]} zoom={13} maxBounds={SG_BOUNDS} className="h-full w-full">
          <OneMapTiles />
          <FitRoute pts={pts} />
          <Marker position={[n.lat, n.lng]} icon={homeIcon()} title={`Start: ${n.name}`} alt={`Start: ${n.name}`} />
          {dest && <Marker position={[dest.lat, dest.lng]} icon={pinIcon(dest.label, '#b23a48')} title={`Destination: ${dest.label}`} alt={`Destination: ${dest.label}`} />}
          {route && route.geometry && (
            <Polyline positions={route.geometry} pathOptions={route.state === 'OK' ? { color: '#b23a48', weight: 5 } : { color: '#461220', weight: 3, dashArray: '8 8' }} />
          )}
        </MapContainer>
        {route && (
          <div className="absolute bottom-6 left-3 z-[1000] rounded-lg bg-white/95 px-3 py-2 text-xs shadow-float">
            <p className="font-semibold text-burgundy">Path legend</p>
            <p className="mt-1 flex items-center gap-2">
              <span className="inline-block h-1 w-6 rounded bg-cinnabar" /> Live provider route
            </p>
            <p className="flex items-center gap-2">
              <span className="inline-block h-0 w-6 border-t-2 border-dashed border-burgundy" /> Straight-line estimate (not a route)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
