import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AMENITY_CATEGORIES, DEFAULT_WEIGHTS, type GeocodeResult } from '@famplan/shared';
import { AddressSearch } from '../src/components/AddressSearch';
import { ExplorePage } from '../src/pages/Explore';
import { ProfilePage } from '../src/pages/Profile';
import { api } from '../src/lib/api';
import { originFromParams, profilePath } from '../src/lib/navigation';

vi.mock('../src/lib/api', async (original) => ({ ...await original<typeof import('../src/lib/api')>(), api: vi.fn() }));
const map = { fitBounds: vi.fn(), invalidateSize: vi.fn() };
vi.mock('react-leaflet', () => ({
  MapContainer: ({children}: {children: React.ReactNode}) => <div>{children}</div>,
  Marker: ({children}: {children: React.ReactNode}) => <div>{children}</div>,
  Circle: ({center, radius}: {center: number[]; radius: number}) => <output data-testid="circle">{JSON.stringify({center, radius})}</output>,
  Tooltip: ({children}: {children: React.ReactNode}) => <span>{children}</span>,
  Popup: ({children}: {children: React.ReactNode}) => <span>{children}</span>,
  GeoJSON: () => null, TileLayer: () => null, useMap: () => map,
}));
const scoring = { weights: DEFAULT_WEIGHTS, thresholds: {}, destination: null };
vi.mock('../src/state/AppState', () => ({ useApp: () => ({ scoring, prefs: null, me: null, setScoring: vi.fn(), compareIds: [], shortlistIds: new Set(), toggleCompare: vi.fn(), toggleShortlist: vi.fn(), toast: vi.fn() }) }));
vi.mock('../src/components/Rosette', () => ({ Rosette: () => null }));
vi.mock('../src/lib/motion', () => ({ useTweened: (value: number) => value }));
const place: GeocodeResult = { address: '12 Example Road Singapore 012345', label: 'Example House', postal: '012345', lat: 1.32, lng: 103.82 };
const summary = { id: 'TESZ01', name: 'Example Estate', planningArea: 'Example Town', region: 'Central Region', lat: place.lat, lng: place.lng, score: { total: 50, breakdown: [] }, highlights: AMENITY_CATEGORIES.map((category) => ({ category, count: 0, nearestM: null, state: 'NO_MATCH' })), commuteMin: null, nearestSelectedM: null, origin: place };
const response = { matchedBy: 'address', total: 1, page: 1, pageSize: 12, radius: 1000, results: [summary], addressMatch: { ...place, neighbourhoodId: summary.id }, limitation: 'Selected address.' };

beforeEach(() => { vi.clearAllMocks(); vi.mocked(api).mockResolvedValue([]); Element.prototype.scrollIntoView = vi.fn(); });

describe('address input request lifecycle', () => {
  it('retains leading zeros and selects the resolved place', async () => {
    vi.mocked(api).mockResolvedValue([place]); const onPick = vi.fn();
    render(<AddressSearch onPick={onPick} />);
    await userEvent.type(screen.getByLabelText('Find a place'), '012345');
    await userEvent.click(screen.getByRole('button', { name: /^search$/i }));
    expect(api).toHaveBeenCalledWith('/geocode?q=012345', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    await userEvent.click(await screen.findByRole('button', { name: /Example House/ }));
    expect(onPick).toHaveBeenCalledWith({ ...place, query: '012345' });
  });
  it('does not allow choosing an old result after the input changes', async () => {
    vi.mocked(api).mockResolvedValue([place]);
    render(<AddressSearch onPick={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Find a place'), 'Example');
    await userEvent.click(screen.getByRole('button', { name: /^search$/i }));
    expect(await screen.findByRole('list', { name: 'Address results' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Find a place'), ' Other');
    expect(screen.queryByRole('list', { name: 'Address results' })).not.toBeInTheDocument();
  });
  it('ignores a late response after editing starts a new search', async () => {
    let finish!: (value: GeocodeResult[]) => void;
    vi.mocked(api).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve as typeof finish; })).mockResolvedValueOnce([]);
    render(<AddressSearch onPick={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Find a place'), 'Old Place');
    await userEvent.click(screen.getByRole('button', { name: /^search$/i }));
    await userEvent.clear(screen.getByLabelText('Find a place'));
    await userEvent.type(screen.getByLabelText('Find a place'), 'New Place');
    await userEvent.click(screen.getByRole('button', { name: /^search$/i }));
    expect(await screen.findByText(/No matching Singapore address/)).toBeInTheDocument();
    await act(async () => { finish([place]); });
    expect(screen.queryByRole('list', { name: 'Address results' })).not.toBeInTheDocument();
  });
  it('validates malformed postal codes before requesting the provider', async () => {
    render(<AddressSearch onPick={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Find a place'), '12345');
    await userEvent.click(screen.getByRole('button', { name: /^search$/i }));
    expect(screen.getByText(/Enter all six digits/)).toBeInTheDocument(); expect(api).not.toHaveBeenCalled();
  });
});

describe('search -> exact address -> profile', () => {
  it('preserves the chosen address and radius in profile navigation', () => {
    const path = profilePath('TESZ01', place, 500);
    const url = new URL(path, 'https://famplan.example');
    expect(url.searchParams.get('radius')).toBe('500');
    expect(originFromParams(url.searchParams)).toEqual({ address: place.address, lat: place.lat, lng: place.lng, postal: place.postal });
  });
  it('asks users to select an ambiguous place and opens its exact-address profile', async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === '/areas') return [];
      const p = new URL(path, 'https://famplan.example').searchParams;
      return p.has('originLat') ? response : { ...response, matchedBy: 'ambiguous', total: 0, results: [], addressMatch: undefined, locationChoices: [place, { ...place, label: 'Other House', lat: 1.33 }] };
    });
    render(<MemoryRouter initialEntries={['/explore?q=Example+House']}><ExplorePage /></MemoryRouter>);
    expect(await screen.findByRole('list', { name: 'Matching places' })).toBeInTheDocument();
    expect(screen.queryByText('No neighbourhoods match these filters.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Example House/ }));
    const link = await screen.findByRole('link', { name: 'Example Estate' });
    expect(link.getAttribute('href')).toContain('originPostal=012345');
    expect(link.getAttribute('href')).toContain('originLat=1.32');
    expect(screen.getByTestId('circle')).toHaveTextContent('"center":[1.32,103.82]');
  });
  it('requests profile and facilities at the same coordinate and keeps the origin after radius changes', async () => {
    vi.mocked(api).mockImplementation(async (path) => path.includes('/facilities') ? [] : { ...summary, radius: Number(new URL(path, 'https://famplan.example').searchParams.get('radius')), amenities: [], provenance: [], limitations: [], boundary: null, boundaryBasis: 'Fixture', referencePointBasis: 'Selected address' });
    render(<MemoryRouter initialEntries={[profilePath('TESZ01', place, 500)]}><Routes><Route path="/n/:id" element={<ProfilePage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Example Estate' })).toBeInTheDocument();
    expect(screen.getByTestId('circle')).toHaveTextContent('"radius":500');
    await userEvent.click(screen.getByRole('radio', { name: '2.0 km' }));
    await waitFor(() => expect(screen.getByTestId('circle')).toHaveTextContent('"radius":2000'));
    for (const [path] of vi.mocked(api).mock.calls) {
      const p = new URL(path, 'https://famplan.example').searchParams;
      expect(p.get('originLat')).toBe('1.32'); expect(p.get('originPostal')).toBe('012345');
    }
  });
  it('ignores a previous Explore response when a new search has finished', async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(api).mockImplementation((path) => {
      if (path === '/areas') return Promise.resolve([]);
      if (new URL(path, 'https://famplan.example').searchParams.get('q') === 'Old Place') return new Promise((resolve) => { finish = resolve; });
      return Promise.resolve({ ...response, results: [], total: 0 });
    });
    render(<MemoryRouter initialEntries={['/explore?q=Old+Place']}><ExplorePage /></MemoryRouter>);
    const input = screen.getByRole('textbox', { name: /Search by town/ });
    await userEvent.clear(input); await userEvent.type(input, 'New Place');
    fireEvent.submit(input.closest('form')!);
    expect(await screen.findByText('No neighbourhoods match these filters.')).toBeInTheDocument();
    await act(async () => { finish(response); });
    expect(screen.queryByRole('link', { name: 'Example Estate' })).not.toBeInTheDocument();
  });
});
