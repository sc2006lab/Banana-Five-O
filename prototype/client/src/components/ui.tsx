import type { ReactNode } from 'react';
import type { AvailabilityState, Provenance } from '@famplan/shared';
import { fmtDate } from '../lib/api';

export function Icon({ name, className = '', filled = false, label }: { name: string; className?: string; filled?: boolean; label?: string }) {
  return (
    <span
      className={`material-symbols-outlined ${filled ? 'filled' : ''} ${className}`}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    >
      {name}
    </span>
  );
}

export function scoreTone(score: number) {
  if (score >= 75) return { text: 'text-good', bg: 'bg-good-bg', bar: 'bg-good', label: 'Strong match' };
  if (score >= 55) return { text: 'text-fair', bg: 'bg-fair-bg', bar: 'bg-[#c77800]', label: 'Fair match' };
  return { text: 'text-poor', bg: 'bg-poor-bg', bar: 'bg-poor', label: 'Weak match' };
}

export function ScorePill({ score, className = '' }: { score: number; className?: string }) {
  const t = scoreTone(score);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${t.bg} ${t.text} ${className}`} title={`Family suitability score ${score}/100 — ${t.label}`}>
      <Icon name="verified" className="!text-[15px]" />
      {score}/100
    </span>
  );
}

const STATE_STYLE: Record<AvailabilityState, { label: string; cls: string; icon: string }> = {
  AVAILABLE: { label: 'Available', cls: 'bg-good-bg text-good', icon: 'check_circle' },
  NO_MATCH: { label: 'None nearby', cls: 'bg-blush text-muted', icon: 'do_not_disturb_on' },
  INCOMPLETE: { label: 'Incomplete coverage', cls: 'bg-fair-bg text-fair', icon: 'info' },
  STALE: { label: 'Stale data', cls: 'bg-fair-bg text-fair', icon: 'history' },
  UNAVAILABLE: { label: 'Source unavailable', cls: 'bg-poor-bg text-poor', icon: 'cloud_off' },
};

export function StateBadge({ state }: { state: AvailabilityState }) {
  const s = STATE_STYLE[state];
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${s.cls}`}>
      <Icon name={s.icon} className="!text-[13px]" />
      {s.label}
    </span>
  );
}

/** Data Provenance Stamp (NFR-DATA-01, FR-NBH-08, FR-RES-03). */
export function ProvenanceLine({ items, className = '' }: { items: Provenance[]; className?: string }) {
  if (!items.length) return null;
  return (
    <div className={`space-y-0.5 text-[11px] leading-4 text-muted ${className}`}>
      {items.map((p) => (
        <p key={p.sourceId}>
          <Icon name="database" className="mr-1 !text-[12px] align-[-2px]" />
          <span className="font-semibold">{p.datasetName}</span> — {p.provider}.{' '}
          {p.retrievedAt ? (
            <>
              Retrieved {fmtDate(p.retrievedAt, true)} (v{p.datasetVersion}, {p.ageDays === 0 ? 'today' : `${p.ageDays} d old`})
              {p.publisherUpdatedAt ? `; publisher updated ${fmtDate(p.publisherUpdatedAt)}` : ''}.
            </>
          ) : (
            'Not yet retrieved.'
          )}{' '}
          {p.stale && <strong className="text-fair">Stale — older than 31 days.</strong>}
        </p>
      ))}
    </div>
  );
}

export function FieldError({ id, msg }: { id?: string; msg?: string }) {
  if (!msg) return null;
  return (
    <p id={id} className="field-error" role="alert">
      <Icon name="error" className="!text-[14px]" />
      {msg}
    </p>
  );
}

export function Notice({ tone = 'info', children, className = '' }: { tone?: 'info' | 'warn' | 'error'; children: ReactNode; className?: string }) {
  const cls = tone === 'error' ? 'bg-poor-bg text-poor border-poor/20' : tone === 'warn' ? 'bg-fair-bg text-fair border-fair/20' : 'bg-blush text-burgundy border-burgundy/10';
  const icon = tone === 'error' ? 'error' : tone === 'warn' ? 'warning' : 'info';
  return (
    <div className={`flex items-start gap-2 rounded border px-3 py-2 text-sm ${cls} ${className}`} role={tone === 'error' ? 'alert' : undefined}>
      <Icon name={icon} className="mt-0.5 !text-[18px]" />
      <div>{children}</div>
    </div>
  );
}

export function Limitation({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs leading-5 text-muted">
      <Icon name="gavel" className="mt-0.5 !text-[14px]" />
      <span>{children}</span>
    </p>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-muted" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-salmon border-t-cinnabar" />
      {label}…
    </div>
  );
}

export function Bar({ value, className = 'bg-cinnabar', label }: { value: number; className?: string; label?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-peach/60" role="meter" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={`grow-x h-full rounded-full ${className}`} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}
