// UC-7.1 Monitor Automatic Data Synchronisation (FR-ADM-01, FR-ADM-02, FR-ADM-04). Monitoring only — no manual trigger.
import { useEffect, useState } from 'react';
import { AMENITY_LABELS, type AmenityCategory, type DataSourceStatusDto, type SyncHistoryDto } from '@famplan/shared';
import { api, ApiError, fmtDate, fmtRelative } from '../lib/api';
import { FieldError, Icon, Notice, Spinner } from '../components/ui';

interface LiveDep {
  id: string;
  name: string;
  provider: string;
  use: string;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
}

const STATUS: Record<DataSourceStatusDto['status'], { label: string; cls: string; dot: string }> = {
  OK: { label: 'OK', cls: 'bg-good-bg text-good', dot: 'bg-good' },
  FAILED: { label: 'Failed', cls: 'bg-poor-bg text-poor', dot: 'bg-poor' },
  STALE: { label: 'Stale', cls: 'bg-fair-bg text-fair', dot: 'bg-[#c77800]' },
  DELAYED: { label: 'Delayed', cls: 'bg-fair-bg text-fair', dot: 'bg-[#c77800]' },
  NEVER_RUN: { label: 'Never run', cls: 'bg-blush text-muted', dot: 'bg-muted' },
  RUNNING: { label: 'Syncing', cls: 'bg-peach text-burgundy', dot: 'bg-cinnabar animate-pulse' },
  LIVE: { label: 'Live', cls: 'bg-good-bg text-good', dot: 'bg-good' },
};

const SOURCE_ICONS: Record<string, string> = {
  'ura-subzones': 'map',
  'ecda-preschools': 'child_care',
  'ecda-childcare': 'child_friendly',
  'moe-schools': 'school',
  'osm-supermarkets': 'local_grocery_store',
  'moh-chas-clinics': 'local_hospital',
  'nparks-parks': 'park',
  'lta-mrt-exits': 'train',
  'lta-bus-stops': 'directions_bus',
};

export function AdminPage() {
  const [sources, setSources] = useState<DataSourceStatusDto[] | null>(null);
  const [live, setLive] = useState<LiveDep | null>(null);
  const [history, setHistory] = useState<SyncHistoryDto[] | null>(null);
  const [filter, setFilter] = useState({ source: '', from: '', to: '' });
  const [err, setErr] = useState<ApiError | null>(null);

  const loadSources = () =>
    api<{ sources: DataSourceStatusDto[]; live: LiveDep }>('/admin/sources')
      .then((r) => {
        setSources(r.sources);
        setLive(r.live);
      })
      .catch((e) => setErr(e));

  useEffect(() => {
    void loadSources();
    const t = setInterval(loadSources, 15_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const p = new URLSearchParams({ limit: '100' });
    if (filter.source) p.set('source', filter.source);
    if (filter.from) p.set('from', filter.from);
    if (filter.to) p.set('to', filter.to);
    api<SyncHistoryDto[]>(`/admin/history?${p}`)
      .then((h) => {
        setHistory(h);
        setErr(null);
      })
      .catch((e) => setErr(e));
  }, [filter]);

  const healthy = sources?.filter((s) => s.status === 'OK').length ?? 0;
  const next = sources?.find((s) => s.nextRunAt)?.nextRunAt;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-burgundy">Data sync dashboard</h1>
          <p className="mt-1 text-muted">Monitor automatic public-data synchronisation. Updates run on a schedule — no manual action is needed.</p>
        </div>
        <div className="rounded-lg bg-burgundy px-4 py-2 text-sm text-white">
          <Icon name="schedule" className="mr-1 !text-[16px] align-[-3px]" />
          Next automatic run: <strong>{next ? fmtDate(next, true) : 'scheduled daily 04:00 SGT'}</strong>
        </div>
      </div>
      {err && <Notice tone="error" className="mt-4">{err.message}</Notice>}
      {!sources && !err && <Spinner />}

      {sources && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sources.map((s) => {
            const st = STATUS[s.status];
            return (
              <article key={s.id} className="card p-5" aria-labelledby={`src-${s.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-peach text-burgundy">
                      <Icon name={SOURCE_ICONS[s.id] ?? 'database'} />
                    </span>
                    <div>
                      <h2 id={`src-${s.id}`} className="font-semibold text-burgundy">{s.name}</h2>
                      <p className="text-[11px] text-muted">{s.categories.length ? s.categories.map((c) => AMENITY_LABELS[c as AmenityCategory]).join(', ') : 'Neighbourhood boundaries'}</p>
                    </div>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                    {st.label}
                  </span>
                </div>
                <dl className="mt-4 divide-y divide-line-soft text-sm">
                  {[
                    ['Records (active)', s.recordCount?.toLocaleString() ?? '—'],
                    ['Dataset version', s.activeVersion ? `v${s.activeVersion}` : '—'],
                    ['Last success', s.lastSuccessAt ? `${fmtRelative(s.lastSuccessAt)}` : 'never'],
                    ['Last attempt', s.lastAttemptAt ? fmtDate(s.lastAttemptAt, true) : 'never'],
                    ['Publisher updated', fmtDate(s.publisherUpdatedAt)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between py-1.5">
                      <dt className="text-muted">{k}</dt>
                      <dd className="font-semibold text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
                {s.lastError && (
                  <p className={`mt-3 rounded px-2 py-1.5 text-xs ${s.status === 'FAILED' ? 'bg-poor-bg text-poor' : 'bg-fair-bg text-fair'}`}>
                    {s.status === 'FAILED' ? 'Last error: ' : 'Coverage: '}
                    {s.lastError}
                    {s.status === 'FAILED' && s.activeVersion ? ` Previous validated v${s.activeVersion} remains active.` : ''}
                  </p>
                )}
                <p className="mt-3 text-[11px] text-muted">{s.provider}</p>
              </article>
            );
          })}
          {live && (
            <article className="card p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-peach text-burgundy">
                    <Icon name="public" />
                  </span>
                  <div>
                    <h2 className="font-semibold text-burgundy">{live.name}</h2>
                    <p className="text-[11px] text-muted">Live dependency · {live.provider}</p>
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${live.lastErrorAt && (!live.lastOkAt || live.lastErrorAt > live.lastOkAt) ? STATUS.FAILED.cls : STATUS.LIVE.cls}`}>
                  {live.lastErrorAt && (!live.lastOkAt || live.lastErrorAt > live.lastOkAt) ? 'Degraded' : 'Live'}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted">{live.use}</p>
              <p className="mt-2 text-sm">Last successful call: <strong>{fmtRelative(live.lastOkAt)}</strong></p>
              {live.lastError && <p className="mt-1 text-xs text-poor">Last error: {live.lastError}</p>}
            </article>
          )}
          <article className={`flex flex-col items-center justify-center rounded-lg p-6 text-center ${healthy === sources.length ? 'bg-good-bg' : 'bg-salmon'}`}>
            <p className="text-xl font-semibold text-burgundy">System status</p>
            <p className="mt-1 text-muted">
              {healthy}/{sources.length} sources operating normally
            </p>
            <span className="mt-3 flex h-12 w-12 items-center justify-center rounded-lg bg-white">
              <Icon name={healthy === sources.length ? 'check_circle' : 'warning'} className={healthy === sources.length ? 'text-good' : 'text-[#c77800]'} />
            </span>
          </article>
        </div>
      )}

      <section className="card mt-8 overflow-hidden" aria-labelledby="hist-h">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line-soft bg-blush/50 px-5 py-4">
          <h2 id="hist-h" className="text-xl font-semibold text-burgundy">Sync history</h2>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="f-src" className="text-xs font-semibold text-muted">Source</label>
              <select id="f-src" className="input !py-1" value={filter.source} onChange={(e) => setFilter((f) => ({ ...f, source: e.target.value }))}>
                <option value="">All sources</option>
                {sources?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="f-from" className="text-xs font-semibold text-muted">From</label>
              <input id="f-from" type="date" className="input !py-1" value={filter.from} onChange={(e) => setFilter((f) => ({ ...f, from: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="f-to" className="text-xs font-semibold text-muted">To</label>
              <input id="f-to" type="date" className="input !py-1" value={filter.to} onChange={(e) => setFilter((f) => ({ ...f, to: e.target.value }))} />
            </div>
          </div>
        </div>
        <FieldError msg={err?.fields?.from ?? err?.fields?.to} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-[11px] tracking-wider text-muted uppercase">
              <tr>
                <th className="px-5 py-3">Started</th>
                <th className="px-3 py-3">Source</th>
                <th className="px-3 py-3">Outcome</th>
                <th className="px-3 py-3 text-right">Added</th>
                <th className="px-3 py-3 text-right">Changed</th>
                <th className="px-3 py-3 text-right">Removed</th>
                <th className="px-3 py-3">Duration</th>
                <th className="px-5 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {history?.map((h) => (
                <tr key={h.id} className={`border-t border-line-soft ${h.outcome === 'FAILED' ? 'bg-poor-bg/40' : ''}`}>
                  <td className="px-5 py-2.5 whitespace-nowrap">{fmtDate(h.startedAt, true)}</td>
                  <td className="px-3 py-2.5">{h.sourceName}</td>
                  <td className={`px-3 py-2.5 font-semibold ${h.outcome === 'FAILED' ? 'text-poor' : h.outcome === 'RUNNING' ? 'text-cinnabar' : 'text-good'}`}>
                    {h.outcome === 'NO_CHANGES' ? 'No changes' : h.outcome.charAt(0) + h.outcome.slice(1).toLowerCase()}
                  </td>
                  <td className="px-3 py-2.5 text-right">{h.outcome === 'FAILED' ? '—' : h.recordsAdded.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right">{h.outcome === 'FAILED' ? '—' : h.recordsChanged.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right">{h.outcome === 'FAILED' ? '—' : h.recordsRemoved.toLocaleString()}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{h.endedAt ? `${((new Date(h.endedAt).getTime() - new Date(h.startedAt).getTime()) / 1000).toFixed(1)} s` : '…'}</td>
                  <td className="px-5 py-2.5 text-xs text-muted">
                    {h.sanitisedError ?? <span className="capitalize">{h.trigger.toLowerCase()} run</span>}
                  </td>
                </tr>
              ))}
              {history?.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-6 text-center text-muted">No synchronisation runs match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
