import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from '../src/components/AppErrorBoundary';
import { AmenityHighlight } from '../src/components/AmenityHighlight';
import { api } from '../src/lib/api';
import { LandingPage } from '../src/pages/Landing';

vi.mock('../src/lib/motion', () => ({
  Reveal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CountUp: ({ to }: { to: number }) => <span>{to}</span>,
  useTweened: (n: number) => n,
  usePrefersReducedMotion: () => true,
}));
vi.mock('../src/components/SurveyMap', () => ({ LADDER: [], SurveyMap: () => <div>Map</div>, toneFor: () => 'warm' }));

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('family-focused interface', () => {
  it('offers exploration and preferences without paid plans, and handles missing showcase data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<MemoryRouter><LandingPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('family');
    expect(screen.getByRole('link', { name: /Explore neighbourhoods/i })).toHaveAttribute('href', '/explore');
    expect(screen.getByRole('link', { name: 'Family preferences' })).toHaveAttribute('href', '/preferences');
    expect(screen.queryByText(/Pricing|S\$6|S\$39|Choose Family|Built for advisors/i)).not.toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent('Cannot reach FamPlan');
    expect(screen.queryByLabelText('Loading map')).not.toBeInTheDocument();
  });

  it('does not show a misleading zero when an amenity source is unavailable', () => {
    render(<AmenityHighlight item={{ category: 'childcare', count: 0, nearestM: null, state: 'UNAVAILABLE' }} />);
    expect(screen.getByText('Source unavailable')).toBeInTheDocument();
    expect(screen.getByText(/Childcare centres:/)).toHaveTextContent('—');
    expect(screen.queryByText(/Childcare centres: 0/)).not.toBeInTheDocument();
  });

  it('distinguishes a genuine no-match result from missing data', () => {
    render(<AmenityHighlight item={{ category: 'supermarket', count: 0, nearestM: null, state: 'NO_MATCH' }} />);
    expect(screen.getByText(/Supermarkets:/)).toHaveTextContent('0');
    expect(screen.getByText('None nearby')).toBeInTheDocument();
  });

  it('offers recovery after a rendering error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function Broken(): never { throw new Error('render failure'); }
    render(<AppErrorBoundary><Broken /></AppErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t display this page');
    expect(screen.getByRole('link', { name: 'Reload Explore' })).toHaveAttribute('href', '/explore');
  });

  it('turns a non-JSON service response into a readable retry message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Unavailable</html>', { status: 502 })));
    await expect(api('/neighbourhoods')).rejects.toThrow('FamPlan returned an unexpected response');
  });
});
