// Application state via React Context (tech-stack recommendation: no Redux).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { COMPARE_MAX, DEFAULT_WEIGHTS, type Me, type PreferencesDto } from '@famplan/shared';
import { api, type ScoringState } from '../lib/api';

interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error' | 'success';
}

interface AppStateValue {
  me: Me | null;
  loadingMe: boolean;
  setMe: (m: Me | null) => void;
  refreshMe: () => Promise<void>;
  prefs: PreferencesDto | null;
  reloadPrefs: () => Promise<void>;
  scoring: ScoringState;
  setScoring: (s: ScoringState | ((s: ScoringState) => ScoringState)) => void;
  compareIds: string[];
  toggleCompare: (id: string) => void;
  setCompareIds: (ids: string[]) => void;
  shortlistIds: Set<string>;
  refreshShortlist: () => Promise<void>;
  toggleShortlist: (id: string, name?: string) => Promise<void>;
  toasts: Toast[];
  toast: (text: string, tone?: Toast['tone']) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AppStateValue | null>(null);

const VISITOR_SCORING: ScoringState = { weights: { ...DEFAULT_WEIGHTS }, thresholds: {}, destination: null };

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [me, setMeState] = useState<Me | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);
  const [prefs, setPrefs] = useState<PreferencesDto | null>(null);
  const [scoring, setScoring] = useState<ScoringState>(VISITOR_SCORING);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [shortlistIds, setShortlistIds] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);

  const identity = useRef<{ id: string | null; version: number }>({ id: null, version: 0 });
  const mounted = useRef(true);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const pendingSaves = useRef(new Set<string>());
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const timer of timers.current) clearTimeout(timer);
      timers.current.clear();
    };
  }, []);

  const setMe = useCallback((next: Me | null) => {
    if (identity.current.id !== (next?.id ?? null)) {
      identity.current = { id: next?.id ?? null, version: identity.current.version + 1 };
      setPrefs(null);
      setShortlistIds(new Set());
      setCompareIds([]);
      setScoring(VISITOR_SCORING);
      setToasts([]);
      pendingSaves.current.clear();
    }
    setMeState(next);
  }, []);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    const timer = setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
      timers.current.delete(timer);
    }, 4500);
    timers.current.add(timer);
  }, []);

  const refreshMe = useCallback(async () => {
    const version = identity.current.version;
    try {
      const next = await api<Me | null>('/auth/me');
      if (mounted.current && identity.current.version === version) setMe(next);
    } catch {
      if (mounted.current && identity.current.version === version) {
        toast('We could not check your session. Please reload before making account changes.', 'error');
      }
    } finally {
      if (mounted.current) setLoadingMe(false);
    }
  }, [setMe, toast]);

  const reloadPrefs = useCallback(async () => {
    const version = identity.current.version;
    if (!identity.current.id) return;
    const p = await api<PreferencesDto>('/preferences');
    if (!mounted.current || identity.current.version !== version) return;
    setPrefs(p);
    const d = p.destinations[0];
    setScoring({
      weights: p.weights,
      thresholds: p.amenityThresholds,
      destination: d ? { lat: d.lat, lng: d.lng, label: d.label, address: d.address } : null,
    });
  }, []);

  const refreshShortlist = useCallback(async () => {
    const version = identity.current.version;
    if (!identity.current.id) return;
    const r = await api<{ entries: { neighbourhoodId: string }[] }>('/shortlist');
    if (!mounted.current || identity.current.version !== version) return;
    setShortlistIds(new Set(r.entries.map((e) => e.neighbourhoodId)));
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  // Guard late responses: private data from an old session must not populate a new one.
  useEffect(() => {
    const version = identity.current.version;
    const report = (error: Error) => {
      if (mounted.current && identity.current.version === version) toast(error.message, 'error');
    };
    if (me?.id) {
      void reloadPrefs().catch(report);
      void refreshShortlist().catch(report);
    }
  }, [me?.id, reloadPrefs, refreshShortlist, toast]);

  const toggleCompare = useCallback((id: string) => {
    if (!compareIds.includes(id) && compareIds.length >= COMPARE_MAX) {
      toast(`You can compare at most ${COMPARE_MAX} neighbourhoods. Remove one first.`, 'error');
      return;
    }
    setCompareIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : ids.length < COMPARE_MAX ? [...ids, id] : ids);
  }, [compareIds, toast]);

  const toggleShortlist = useCallback(
    async (id: string, name?: string) => {
      if (!me) {
        toast('Sign in to save neighbourhoods to your shortlist.', 'info');
        return;
      }
      if (pendingSaves.current.has(id)) return;
      pendingSaves.current.add(id);
      const version = identity.current.version;
      try {
        if (shortlistIds.has(id)) {
          await api(`/shortlist/${id}`, { method: 'DELETE', body: {} });
          if (identity.current.version !== version) return;
          toast(`${name ?? 'Neighbourhood'} removed from your shortlist.`, 'success');
        } else {
          const r = await api<{ status: string; message: string }>('/shortlist', { method: 'POST', body: { neighbourhoodId: id } });
          if (identity.current.version !== version) return;
          toast(r.status === 'ADDED' ? `${name ?? 'Neighbourhood'} added to your shortlist.` : r.message, 'success');
        }
        await refreshShortlist();
      } catch (e) {
        if (identity.current.version === version) toast((e as Error).message, 'error');
      } finally {
        if (identity.current.version === version) pendingSaves.current.delete(id);
      }
    },
    [me, shortlistIds, refreshShortlist, toast],
  );

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST', body: {} });
    setMe(null);
    toast('You have been signed out.', 'success');
  }, [setMe, toast]);

  const value = useMemo(
    () => ({
      me,
      loadingMe,
      setMe,
      refreshMe,
      prefs,
      reloadPrefs,
      scoring,
      setScoring,
      compareIds,
      toggleCompare,
      setCompareIds,
      shortlistIds,
      refreshShortlist,
      toggleShortlist,
      toasts,
      toast,
      signOut,
    }),
    [me, loadingMe, setMe, refreshMe, prefs, reloadPrefs, scoring, compareIds, toggleCompare, shortlistIds, refreshShortlist, toggleShortlist, toasts, toast, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppStateProvider');
  return v;
}
