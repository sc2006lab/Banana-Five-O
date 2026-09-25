import { useId, useState } from 'react';
import type { GeocodeResult } from '@famplan/shared';
import { api } from '../lib/api';
import { FieldError, Icon } from './ui';

/** OneMap-backed address lookup; the user must pick a resolved result (FR-PREF-03 unresolved-address handling). */
export function AddressSearch({
  onPick,
  placeholder = 'Address, building or postal code',
  label = 'Find a place',
  initial = '',
}: {
  onPick: (r: GeocodeResult & { query: string }) => void;
  placeholder?: string;
  label?: string;
  initial?: string;
}) {
  const id = useId();
  const [q, setQ] = useState(initial);
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  const search = async () => {
    setErr(undefined);
    if (q.trim().length < 2) return setErr('Enter at least 2 characters.');
    setBusy(true);
    try {
      const r = await api<GeocodeResult[]>(`/geocode?q=${encodeURIComponent(q.trim())}`);
      setResults(r);
      if (!r.length) setErr('No matching Singapore address found. Try a postal code or building name.');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          className="input"
          value={q}
          placeholder={placeholder}
          aria-invalid={Boolean(err)}
          aria-describedby={err ? `${id}-err` : undefined}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void search();
            }
          }}
        />
        <button type="button" className="btn-secondary shrink-0" onClick={search} disabled={busy}>
          <Icon name="search" className="!text-[18px]" />
          {busy ? 'Searching' : 'Search'}
        </button>
      </div>
      <FieldError id={`${id}-err`} msg={err} />
      {results && results.length > 0 && (
        <ul className="mt-2 max-h-56 overflow-auto rounded border border-line bg-white" aria-label="Address results">
          {results.map((r) => (
            <li key={`${r.lat},${r.lng},${r.label}`}>
              <button
                type="button"
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-blush"
                onClick={() => {
                  onPick({ ...r, query: q.trim() });
                  setResults(null);
                }}
              >
                <Icon name="location_on" className="mt-0.5 !text-[18px] text-cinnabar" />
                <span>
                  <span className="block font-semibold text-burgundy">{r.label}</span>
                  <span className="block text-xs text-muted">{r.address}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
