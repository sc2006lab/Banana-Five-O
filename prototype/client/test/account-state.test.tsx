import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WEIGHTS, type PreferencesDto } from '@famplan/shared';
import { AppStateProvider, useApp } from '../src/state/AppState';
import { api } from '../src/lib/api';

vi.mock('../src/lib/api', () => ({ api: vi.fn() }));
const mockApi = vi.mocked(api);
const me = { id: 'parent-a', displayName: 'Parent', email: 'parent@example.com', role: 'REGISTERED_USER' as const };
const prefs: PreferencesDto = { familyStages: ['preschool'], preferredAreas: [], amenityThresholds: {}, weights: { ...DEFAULT_WEIGHTS, childcare: 5 }, confirmedWeights: [], destinations: [], updatedAt: null };

function Harness() {
  const a = useApp();
  return <>
    <p data-testid="identity">{a.me?.displayName ?? 'Visitor'}</p>
    <p data-testid="prefs">{a.prefs?.familyStages.join(',') ?? 'none'}</p>
    <p data-testid="shortlist">{a.shortlistIds.size}</p>
    <button onClick={() => a.setMe(null)}>Change to visitor</button>
    <button onClick={() => a.signOut().catch(() => {})}>Sign out</button>
    {a.toasts.map((t) => <p key={t.id}>{t.text}</p>)}
  </>;
}

beforeEach(() => { mockApi.mockReset(); });

describe('private account state', () => {
  it('ignores late preferences and shortlist responses after the account ends', async () => {
    let resolvePreferences!: (value: PreferencesDto) => void;
    let resolveShortlist!: (value: { entries: { neighbourhoodId: string }[] }) => void;
    const preferencesPromise = new Promise<PreferencesDto>((r) => { resolvePreferences = r; });
    const shortlistPromise = new Promise<{ entries: { neighbourhoodId: string }[] }>((r) => { resolveShortlist = r; });
    mockApi.mockImplementation(async (path) => {
      if (path === '/auth/me') return me;
      if (path === '/preferences') return preferencesPromise;
      if (path === '/shortlist') return shortlistPromise;
      throw new Error('Unexpected request');
    });
    render(<AppStateProvider><Harness /></AppStateProvider>);
    await waitFor(() => expect(screen.getByTestId('identity')).toHaveTextContent('Parent'));
    await userEvent.click(screen.getByRole('button', { name: 'Change to visitor' }));
    await act(async () => {
      resolvePreferences(prefs);
      resolveShortlist({ entries: [{ neighbourhoodId: 'TEST01' }] });
      await Promise.all([preferencesPromise, shortlistPromise]);
    });
    expect(screen.getByTestId('identity')).toHaveTextContent('Visitor');
    expect(screen.getByTestId('prefs')).toHaveTextContent('none');
    expect(screen.getByTestId('shortlist')).toHaveTextContent('0');
  });

  it('does not claim logout succeeded when the server could not end the session', async () => {
    mockApi.mockImplementation(async (path) => {
      if (path === '/auth/me') return me;
      if (path === '/preferences') return prefs;
      if (path === '/shortlist') return { entries: [] };
      throw new Error('Cannot reach FamPlan');
    });
    render(<AppStateProvider><Harness /></AppStateProvider>);
    await waitFor(() => expect(screen.getByTestId('identity')).toHaveTextContent('Parent'));
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByTestId('identity')).toHaveTextContent('Parent');
    expect(screen.queryByText('You have been signed out.')).not.toBeInTheDocument();
  });
});
