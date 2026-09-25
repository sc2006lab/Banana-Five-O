import { NavLink } from 'react-router-dom';
import { Icon } from './ui';

const TABS = [
  ['/settings/workspace', 'group', 'Workspace & team'],
  ['/settings/billing', 'credit_card', 'Plan & billing'],
  ['/account', 'manage_accounts', 'Account'],
] as const;

export function SettingsNav() {
  return (
    <nav aria-label="Settings" className="mb-8 flex gap-1 overflow-x-auto border-b border-line-soft">
      {TABS.map(([to, icon, label]) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors ${
              isActive ? 'border-cinnabar text-burgundy' : 'border-transparent text-muted hover:text-burgundy'
            }`
          }
        >
          <Icon name={icon} className="!text-[18px]" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(1, used / Math.max(1, limit));
  const tone = pct >= 1 ? 'bg-poor' : pct >= 0.8 ? 'bg-[#c77800]' : 'bg-cinnabar';
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold text-burgundy">{label}</span>
        <span className="font-mono text-xs text-muted">
          {used} / {limit}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-peach/60" role="meter" aria-valuenow={used} aria-valuemin={0} aria-valuemax={limit} aria-label={label}>
        <div className={`grow-x h-full rounded-full ${tone}`} style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}
