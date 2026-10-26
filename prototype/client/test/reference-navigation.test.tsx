import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from '../src/components/Layout';
import { SignInPage } from '../src/pages/SignIn';
import { backOrExplore, explorePath, malformedPostalQuery, signInPath } from '../src/lib/navigation';

const { toast, setMe, api } = vi.hoisted(() => ({ toast: vi.fn(), setMe: vi.fn(), api: vi.fn() }));
vi.mock('../src/state/AppState', () => ({ useApp: () => ({ me: null, compareIds: [], toast, setMe }) }));
vi.mock('../src/lib/api', () => ({ api, ApiError: class extends Error {} }));

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

beforeEach(() => { vi.clearAllMocks(); });

describe('reference dialog-map navigation', () => {
  it('keeps the current profile as the sign-in destination without offering SaaS navigation', () => {
    render(<MemoryRouter initialEntries={['/n/TPSZ01']}><Header /><Location /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Sign In' })).toHaveAttribute('href', '/signin?next=%2Fn%2FTPSZ01');
    expect(screen.getByRole('navigation', { name: 'Primary' })).toHaveTextContent('ExploreShortlistPreferences');
    expect(screen.queryByRole('link', { name: /Pricing|Billing|Workspace|Eligibility/i })).not.toBeInTheDocument();
  });

  it('sends the header postal search to Explore without losing a leading zero', async () => {
    render(<MemoryRouter initialEntries={['/']}><Header /><Location /></MemoryRouter>);
    await userEvent.type(screen.getByRole('textbox', { name: 'Search locations or postal codes' }), '018961');
    await userEvent.click(screen.getByRole('button', { name: 'Search this location' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/explore?q=018961');
  });

  it('keeps malformed postal queries on the current screen and explains the six-digit format', async () => {
    render(<MemoryRouter initialEntries={['/preferences']}><Header /><Location /></MemoryRouter>);
    await userEvent.type(screen.getByRole('textbox', { name: 'Search locations or postal codes' }), '12345');
    await userEvent.click(screen.getByRole('button', { name: 'Search this location' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/preferences');
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('six digits'));
  });

  it('returns to the requested shortlist after a successful login', async () => {
    const account = { id: 'test-parent', displayName: 'Parent', email: 'parent@example.com', role: 'REGISTERED_USER' };
    api.mockResolvedValue(account);
    render(<MemoryRouter initialEntries={['/signin?next=%2Fshortlist']}><SignInPage /><Location /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText('Email address'), 'parent@example.com');
    await userEvent.type(screen.getByLabelText('Password', { exact: true }), 'FamilyTest123');
    fireEvent.submit(screen.getByRole('button', { name: /^Sign In/ }).closest('form')!);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/shortlist'));
    expect(setMe).toHaveBeenCalledWith(account);
  });

  it('preserves the authentication card tabs and registration fields from the mockup', async () => {
    render(<MemoryRouter initialEntries={['/signin']}><SignInPage /></MemoryRouter>);
    await userEvent.click(screen.getByRole('tab', { name: 'Create Account' }));
    expect(screen.getByRole('tab', { name: 'Create Account' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Display name')).toBeInTheDocument();
    expect(screen.queryByText(/Singpass|Billing|Choose a plan/i)).not.toBeInTheDocument();
  });
});

describe('internal navigation helpers', () => {
  it('encodes text searches and retains all six postal digits', () => {
    expect(explorePath(' 018961 ')).toBe('/explore?q=018961');
    expect(explorePath('Toa Payoh & Bishan')).toBe('/explore?q=Toa+Payoh+%26+Bishan');
    expect(malformedPostalQuery('310123')).toBe(false);
    expect(malformedPostalQuery('S(018961)')).toBe(false);
    expect(malformedPostalQuery('12345')).toBe(true);
    expect(malformedPostalQuery('Toa Payoh')).toBe(false);
  });

  it('does not propagate external return destinations or password-reset tokens', () => {
    for (const target of ['/', 'https://example.com', '//example.com', '/\\example.com', '/reset-password?token=private']) {
      expect(signInPath(target)).toBe('/signin?next=%2Fexplore');
    }
  });

  it('falls back to Explore for a directly opened profile instead of leaving the application', () => {
    const navigate = vi.fn();
    backOrExplore(navigate);
    expect(navigate).toHaveBeenCalledWith('/explore');
  });
});
