// FR-PREF-03: every priority destination keeps its own travel mode and reaches the scoring request.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WEIGHTS, type PreferencesDto } from '@famplan/shared';
import { PreferencesPage } from '../src/pages/Preferences';
import { api, destinationNames, scoringDestinations, scoringParams } from '../src/lib/api';

vi.mock('../src/lib/api', async (original) => ({ ...await original<typeof import('../src/lib/api')>(), api: vi.fn() }));

const prefs: PreferencesDto = {
  familyStages: [],
  preferredAreas: [],
  amenityThresholds: {},
  weights: DEFAULT_WEIGHTS,
  confirmedWeights: [],
  destinations: [
    { label: 'Work', queryText: 'Raffles Place', address: 'Raffles Place MRT', lat: 1.284, lng: 103.851, mode: 'drive' },
    { label: 'School', queryText: 'Bishan', address: 'Bishan Street 13', lat: 1.35, lng: 103.84, mode: 'pt' },
  ],
  updatedAt: null,
};
const scoring = { weights: DEFAULT_WEIGHTS, thresholds: {}, destinations: scoringDestinations(prefs.destinations) };
const me = { id: 'u1' };
vi.mock('../src/state/AppState', () => ({ useApp: () => ({ me, prefs, scoring, setScoring: vi.fn(), reloadPrefs: vi.fn(), toast: vi.fn() }) }));

beforeEach(() => { vi.clearAllMocks(); vi.mocked(api).mockResolvedValue([]); });

describe('commute destinations in the scoring request', () => {
  it('CM-C1 sends every destination with its own travel mode', () => {
    const sent = JSON.parse(scoringParams(scoring).get('destinations')!);
    expect(sent).toEqual([
      { lat: 1.284, lng: 103.851, label: 'Work', mode: 'drive' },
      { lat: 1.35, lng: 103.84, label: 'School', mode: 'pt' },
    ]);
  });

  it('CM-C2 leaves the parameter out when no destination is set', () => {
    expect(scoringParams({ ...scoring, destinations: [] }).has('destinations')).toBe(false);
  });

  it('CM-C3 names every destination', () => {
    expect(destinationNames(scoring.destinations)).toBe('Work and School');
  });
});

describe('family preferences', () => {
  it('CM-C4 saves a travel mode chosen for each destination', async () => {
    render(<MemoryRouter><PreferencesPage /></MemoryRouter>);
    expect(await screen.findByLabelText('Travel mode to Work')).toHaveValue('drive');
    await userEvent.selectOptions(screen.getByLabelText('Travel mode to School'), 'walk');
    await userEvent.click(screen.getByRole('button', { name: /save preferences/i }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/preferences', expect.objectContaining({ method: 'PUT' })));
    const save = vi.mocked(api).mock.calls.find(([path, init]) => path === '/preferences' && init?.method === 'PUT')!;
    expect((save[1]!.body as PreferencesDto).destinations.map((d) => d.mode)).toEqual(['drive', 'walk']);
  });

  it('CM-C5 no longer marks one destination as the only one used for the score', async () => {
    render(<MemoryRouter><PreferencesPage /></MemoryRouter>);
    await screen.findByLabelText('Travel mode to Work');
    expect(screen.queryByText('used for commute score')).not.toBeInTheDocument();
    expect(screen.getByText(/averages your travel time to every destination/)).toBeInTheDocument();
  });
});
