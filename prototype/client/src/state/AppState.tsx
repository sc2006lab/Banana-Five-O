// Application state via React Context (tech-stack recommendation: no Redux).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { COMPARE_MAX, DEFAULT_WEIGHTS, type Me, type PreferencesDto, type WorkspaceSummary } from '@famplan/shared';
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
  workspaces: WorkspaceSummary[];
  refreshWorkspaces: () => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;
}

const Ctx = createContext<AppStateValue | null>(null);

const VISITOR_SCORING: ScoringState = { weights: { ...DEFAULT_WEIGHTS }, thresholds: {}, destination: null };

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);
  const [prefs, setPrefs] = useState<PreferencesDto | null>(null);
  const [scoring, setScoring] = useState<ScoringState>(VISITOR_SCORING);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [shortlistIds, setShortlistIds] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      setMe(await api<Me | null>('/auth/me'));
    } catch {
      setMe(null);
    } finally {
      setLoadingMe(false);
    }
  }, []);

  const reloadPrefs = useCallback(async () => {
    const p = await api<PreferencesDto>('/preferences');
    setPrefs(p);
    const d = p.destinations[0];
    setScoring({
      weights: p.weights,
      thresholds: p.amenityThresholds,
      destination: d ? { lat: d.lat, lng: d.lng, label: d.label, address: d.address } : null,
    });
  }, []);

  const refreshShortlist = useCallback(async () => {
    const r = await api<{ entries: { neighbourhoodId: string }[] }>('/shortlist');
    setShortlistIds(new Set(r.entries.map((e) => e.neighbourhoodId)));
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const refreshWorkspaces = useCallback(async () => {
    const r = await api<{ workspaces: WorkspaceSummary[] }>('/workspaces');
    setWorkspaces(r.workspaces);
  }, []);

  // Signed-in users score with their saved profile; visitors use in-memory, unsaved defaults.
  useEffect(() => {
    if (me) {
      void reloadPrefs().catch(() => undefined);
      void refreshShortlist().catch(() => undefined);
      void refreshWorkspaces().catch(() => undefined);
    } else {
      setPrefs(null);
      setWorkspaces([]);
      setShortlistIds(new Set());
      setScoring(VISITOR_SCORING);
    }
  }, [me?.id, me?.workspace?.id, reloadPrefs, refreshShortlist, refreshWorkspaces]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCompare = useCallback(
    (id: string) =>
      setCompareIds((ids) => {
        if (ids.includes(id)) return ids.filter((x) => x !== id);
        if (ids.length >= COMPARE_MAX) {
          toast(`You can compare at most ${COMPARE_MAX} neighbourhoods. Remove one first.`, 'error');
          return ids;
        }
        return [...ids, id];
      }),
    [toast],
  );

  const toggleShortlist = useCallback(
    async (id: string, name?: string) => {
      if (!me) {
        toast('Sign in to save neighbourhoods to your shortlist.', 'info');
        return;
      }
      try {
        if (shortlistIds.has(id)) {
          await api(`/shortlist/${id}`, { method: 'DELETE', body: {} });
          toast(`${name ?? 'Neighbourhood'} removed from your shortlist.`, 'success');
        } else {
          const r = await api<{ status: string; message: string }>('/shortlist', { method: 'POST', body: { neighbourhoodId: id } });
          toast(r.status === 'ADDED' ? `${name ?? 'Neighbourhood'} added to your shortlist.` : r.message, 'success');
        }
        await refreshShortlist();
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    },
    [me, shortlistIds, refreshShortlist, toast],
  );

  const switchWorkspace = useCallback(
    async (id: string) => {
      try {
        const r = await api<{ name: string }>(`/workspaces/${id}/switch`, { method: 'POST', body: {} });
        await refreshMe();
        toast(`Switched to “${r.name}”.`, 'success');
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    },
    [refreshMe, toast],
  );

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
    setMe(null);
    toast('You have been signed out.', 'success');
  }, [toast]);

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
      workspaces,
      refreshWorkspaces,
      switchWorkspace,
    }),
    [me, loadingMe, refreshMe, prefs, reloadPrefs, scoring, compareIds, toggleCompare, shortlistIds, refreshShortlist, toggleShortlist, toasts, toast, signOut, workspaces, refreshWorkspaces, switchWorkspace],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppStateProvider');
  return v;
}
