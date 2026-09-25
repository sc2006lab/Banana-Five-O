// UC-6.3 Manage Shortlist and Notes (FR-DEC-05 – FR-DEC-07).
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { COMPARE_MAX, COMPARE_MIN, LIMITATION_SCORE, NOTE_MAX, SHORTLIST_MAX, type ShortlistEntryDto } from '@famplan/shared';
import { api, ApiError, fmtDate, fmtDistance, scoringParams } from '../lib/api';
import { useApp } from '../state/AppState';
import { FieldError, Icon, Limitation, Notice, ScorePill, Spinner } from '../components/ui';

type Entry = ShortlistEntryDto & { addedBy?: string };
interface WorkspaceInfo {
  id: string;
  name: string;
  role: string;
  plan: string;
  memberCount: number;
  canExport: boolean;
}

function Entry({ e, selected, onSelect, onRemoved, shared }: { e: Entry; selected: boolean; onSelect: () => void; onRemoved: () => void; shared: boolean }) {
  const { toast, refreshShortlist } = useApp();
  const [note, setNote] = useState(e.note);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>();
  const n = e.neighbourhood;
  const dirty = note !== e.note;

  const save = async (text: string) => {
    setSaving(true);
    try {
      const r = await api<{ message: string }>(`/shortlist/${e.neighbourhoodId}/note`, { method: 'PUT', body: { text } });
      setErr(undefined);
      e.note = text;
      toast(r.message, 'success');
    } catch (x) {
      setErr((x as ApiError).fields.text ?? (x as ApiError).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="card p-5" aria-labelledby={`s-${e.neighbourhoodId}`}>
      <div className="flex items-start justify-between gap-3">
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1.5 h-4 w-4 accent-cinnabar" checked={selected} onChange={onSelect} aria-label={`Select ${n?.name ?? e.neighbourhoodId} for comparison`} />
          <span>
            <span className="eyebrow">Neighbourhood profile</span>
            <h2 id={`s-${e.neighbourhoodId}`} className="text-xl font-semibold text-burgundy">
              {n ? <Link to={`/n/${e.neighbourhoodId}`} className="hover:underline">{n.name}</Link> : e.neighbourhoodId}
            </h2>
            {n && (
              <span className="block text-sm text-muted">
                {n.planningArea} · saved {fmtDate(e.addedAt)}
                {shared && e.addedBy ? ` by ${e.addedBy}` : ''}
              </span>
            )}
          </span>
        </label>
        <div className="flex items-center gap-2">
          {n && <ScorePill score={n.score.total} />}
          <button
            className="rounded-full p-2 text-muted hover:bg-blush hover:text-cinnabar"
            aria-label={`Remove ${n?.name ?? 'neighbourhood'} from shortlist`}
            onClick={async () => {
              try {
                await api(`/shortlist/${e.neighbourhoodId}`, { method: 'DELETE', body: {} });
                toast(`${n?.name ?? 'Neighbourhood'} removed from your shortlist.`, 'success');
                await refreshShortlist();
                onRemoved();
              } catch (x) {
                toast((x as Error).message, 'error');
              }
            }}
          >
            <Icon name="delete" />
          </button>
        </div>
      </div>
      {n ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {n.highlights
            .filter((h) => ['childcare', 'primary_school', 'mrt', 'supermarket'].includes(h.category))
            .map((h) => (
              <span key={h.category} className="chip">
                {h.category.replace('_', ' ')}: {h.count} · nearest {fmtDistance(h.nearestM)}
              </span>
            ))}
          {n.commuteMin !== null && <span className="chip">Commute ~{n.commuteMin} min</span>}
        </div>
      ) : (
        <Notice tone="warn" className="mt-3">This neighbourhood is no longer in the current dataset.</Notice>
      )}
      <div className="mt-4">
        <label className="label" htmlFor={`note-${e.neighbourhoodId}`}>
          {shared ? 'Shared note' : 'Private note'}{' '}
          <span className="font-normal text-muted">{shared ? '(visible to everyone in this workspace)' : '(only you can see this)'}</span>
        </label>
        <textarea
          id={`note-${e.neighbourhoodId}`}
          className="input h-24 resize-y bg-blush/30"
          value={note}
          maxLength={NOTE_MAX + 50}
          placeholder="e.g. Near grandparents; check the playground on weekends"
          onChange={(x) => setNote(x.target.value)}
          aria-invalid={Boolean(err) || note.length > NOTE_MAX}
          aria-describedby={`count-${e.neighbourhoodId}`}
        />
        <div className="mt-1 flex items-center justify-between">
          <span id={`count-${e.neighbourhoodId}`} className={`text-xs ${note.length > NOTE_MAX ? 'font-semibold text-poor' : 'text-muted'}`}>
            {note.length}/{NOTE_MAX} characters
          </span>
          <div className="flex gap-2">
            {e.note && (
              <button className="btn-ghost btn-sm" disabled={saving} onClick={() => { setNote(''); void save(''); }}>
                Clear note
              </button>
            )}
            <button className="btn-primary btn-sm" disabled={!dirty || saving || note.length > NOTE_MAX} onClick={() => save(note)}>
              {saving ? 'Saving…' : 'Save note'}
            </button>
          </div>
        </div>
        <FieldError msg={note.length > NOTE_MAX ? `Notes must be at most ${NOTE_MAX} characters — remove ${note.length - NOTE_MAX}.` : err} />
      </div>
    </article>
  );
}

export function ShortlistPage() {
  const { me, loadingMe, scoring, setCompareIds } = useApp();
  const nav = useNavigate();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [max, setMax] = useState(SHORTLIST_MAX);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ entries: Entry[]; workspace: WorkspaceInfo; max: number }>(`/shortlist?${scoringParams(scoring)}`)
      .then((r) => {
        setEntries(r.entries);
        setWorkspace(r.workspace);
        setMax(r.max);
      })
      .catch((e) => setError((e as Error).message));
  }, [scoring]);

  useEffect(() => {
    if (me) load();
  }, [me, me?.workspace?.id, load]);

  if (loadingMe) return <Spinner />;
  if (!me)
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <Icon name="favorite" className="!text-[48px] text-salmon" />
        <h1 className="mt-2 text-3xl font-bold text-burgundy">Your shortlist</h1>
        <p className="mt-2 text-muted">Sign in to save up to {SHORTLIST_MAX} neighbourhoods and keep private notes. Visitors can still search and compare.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/signin?next=/shortlist" className="btn-dark">Sign in</Link>
          <Link to="/register" className="btn-secondary">Create account</Link>
        </div>
      </div>
    );

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= COMPARE_MAX ? s : [...s, id]));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {workspace && (
            <p className="eyebrow flex items-center gap-1.5">
              <Icon name={workspace.memberCount > 1 ? 'group' : 'person'} className="!text-[14px]" />
              {workspace.name}
              {workspace.memberCount > 1 ? ` · shared with ${workspace.memberCount - 1} ${workspace.memberCount === 2 ? 'person' : 'people'}` : ''}
            </p>
          )}
          <h1 className="mt-1 font-display text-5xl text-burgundy">Shortlist</h1>
          <p className="mt-1 text-muted" aria-live="polite">
            {entries ? `${entries.length} of ${max} saved` : ''} · select {COMPARE_MIN}–{COMPARE_MAX} to compare
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
        {workspace &&
          (workspace.canExport ? (
            <a className="btn-secondary" href={`/api/workspaces/${workspace.id}/export.csv`} download>
              <Icon name="download" className="!text-[18px]" /> Export CSV
            </a>
          ) : (
            <Link to="/settings/workspace" className="btn-secondary">
              <Icon name="person_add" className="!text-[18px]" /> Plan together
            </Link>
          ))}
        <button
          className="btn-dark"
          disabled={selected.length < COMPARE_MIN}
          onClick={() => {
            setCompareIds(selected);
            nav(`/compare?ids=${selected.join(',')}`);
          }}
        >
          <Icon name="compare_arrows" className="!text-[18px]" />
          Compare selected ({selected.length})
        </button>
        </div>
      </div>
      {error && <Notice tone="error" className="mt-4">{error}</Notice>}
      {!entries && !error && <Spinner />}
      {entries?.length === 0 && (
        <div className="card mt-6 p-8 text-center">
          <p className="font-semibold text-burgundy">Your shortlist is empty.</p>
          <p className="mt-1 text-sm text-muted">Use the heart on any neighbourhood to save it here.</p>
          <Link to="/explore" className="btn-primary mt-4">Explore neighbourhoods</Link>
        </div>
      )}
      <div className="stagger mt-6 space-y-4">
        {entries?.map((e) => (
          <Entry
            key={e.neighbourhoodId}
            e={e}
            shared={(workspace?.memberCount ?? 1) > 1}
            selected={selected.includes(e.neighbourhoodId)}
            onSelect={() => toggle(e.neighbourhoodId)}
            onRemoved={load}
          />
        ))}
      </div>
      <div className="mt-6">
        <Limitation>{LIMITATION_SCORE}</Limitation>
      </div>
    </div>
  );
}
