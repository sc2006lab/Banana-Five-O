import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppState';
import { Icon } from './ui';

function NavItem({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `relative px-1 py-5 text-sm font-semibold transition-colors ${isActive ? 'text-burgundy after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-burgundy' : 'text-muted hover:text-burgundy'}`
      }
    >
      {children}
    </NavLink>
  );
}

function UserMenu() {
  const { me, signOut } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);
  if (!me)
    return (
      <Link to="/signin" className="btn-dark">
        Sign In
      </Link>
    );
  return (
    <div ref={ref} className="relative">
      <button
        className="flex items-center gap-2 rounded-full border border-line bg-white py-1 pr-3 pl-1 text-sm font-semibold text-burgundy hover:bg-blush"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-peach text-burgundy">{me.displayName.slice(0, 1).toUpperCase()}</span>
        <span className="hidden max-w-32 truncate sm:inline">{me.displayName}</span>
        <Icon name="expand_more" className="!text-[18px]" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-[1200] mt-2 w-56 rounded-lg border border-burgundy/10 bg-white py-1 shadow-float">
          <p className="border-b border-line-soft px-4 py-2 text-xs text-muted">{me.email}</p>
          {[
            ['/preferences', 'tune', 'Family preferences'],
            ['/shortlist', 'favorite', 'Shortlist'],
            ['/account', 'manage_accounts', 'Account'],
            ...(me.role === 'DATA_ADMINISTRATOR' ? [['/admin', 'monitoring', 'Data sync status']] : []),
          ].map(([to, icon, label]) => (
            <button
              key={to}
              role="menuitem"
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ink hover:bg-blush"
              onClick={() => {
                setOpen(false);
                nav(to);
              }}
            >
              <Icon name={icon} className="!text-[18px] text-muted" />
              {label}
            </button>
          ))}
          <button
            role="menuitem"
            className="flex w-full items-center gap-2 border-t border-line-soft px-4 py-2 text-left text-sm text-cinnabar hover:bg-blush"
            onClick={async () => {
              setOpen(false);
              await signOut();
              nav('/');
            }}
          >
            <Icon name="logout" className="!text-[18px]" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { compareIds, me } = useApp();
  const nav = useNavigate();
  return (
    <header className="sticky top-0 z-[1100] border-b border-line-soft bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 md:px-8">
        <Link to="/" className="flex items-center gap-2 text-2xl font-bold tracking-tight text-burgundy" aria-label="FamPlan home">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          FamPlan
        </Link>
        <nav className="ml-4 hidden items-center gap-6 md:flex" aria-label="Primary">
          <NavItem to="/">Explore</NavItem>
          <NavItem to="/shortlist">Shortlist</NavItem>
          <NavItem to="/preferences">Preferences</NavItem>
          {me?.role === 'DATA_ADMINISTRATOR' && <NavItem to="/admin">Data status</NavItem>}
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <button
            className="btn-secondary hidden sm:inline-flex"
            onClick={() => nav(`/compare?ids=${compareIds.join(',')}`)}
            aria-label={`Compare ${compareIds.length} selected neighbourhoods`}
          >
            <Icon name="compare_arrows" className="!text-[18px]" />
            Compare
            {compareIds.length > 0 && <span className="rounded-full bg-cinnabar px-1.5 text-xs text-white">{compareIds.length}</span>}
          </button>
          <Link to="/shortlist" className="rounded-full p-2 text-burgundy hover:bg-blush" aria-label="Shortlist">
            <Icon name="favorite" />
          </Link>
          <UserMenu />
        </div>
      </div>
      <nav className="flex justify-around border-t border-line-soft md:hidden" aria-label="Primary mobile">
        <NavItem to="/">Explore</NavItem>
        <NavItem to="/shortlist">Shortlist</NavItem>
        <NavItem to="/preferences">Preferences</NavItem>
        <NavItem to={`/compare?ids=${compareIds.join(',')}`}>{`Compare${compareIds.length ? ` (${compareIds.length})` : ''}`}</NavItem>
      </nav>
    </header>
  );
}

function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[2000] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite" role="status">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-float ${
            t.tone === 'error' ? 'bg-poor text-white' : t.tone === 'success' ? 'bg-burgundy text-white' : 'bg-white text-burgundy'
          }`}
        >
          <Icon name={t.tone === 'error' ? 'error' : t.tone === 'success' ? 'check_circle' : 'info'} className="!text-[18px]" />
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Layout() {
  const loc = useLocation();
  useEffect(() => {
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [loc.pathname]);
  return (
    <div className="flex min-h-full flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[3000] focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to main content
      </a>
      <Header />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <Outlet />
      </main>
      <Toasts />
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-12 border-t border-line-soft bg-blush/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted md:flex-row md:items-center md:justify-between md:px-8">
        <p>
          <strong className="text-burgundy">FamPlan</strong> — a comparative planning aid for family neighbourhoods. Not a property listing, school-admission
          predictor or childcare-vacancy service.
        </p>
        <p>Data: data.gov.sg (URA, ECDA, MOE, MOH, NParks, LTA), OpenStreetMap contributors, OneMap / SLA.</p>
      </div>
    </footer>
  );
}
