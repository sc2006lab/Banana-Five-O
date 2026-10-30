import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/synchronisation/datagovsg.js', () => ({ fetchWithTimeout: vi.fn() }));
vi.mock('../src/synchronisation/budget.js', async (original) => ({
  ...(await original<typeof import('../src/synchronisation/budget.js')>()),
  budgetSleep: vi.fn().mockResolvedValue(undefined),
}));

import { fetchWithTimeout } from '../src/synchronisation/datagovsg.js';
import { budgetSleep, SyncBudgetError, withSyncBudget } from '../src/synchronisation/budget.js';
import { fetchSupermarketData } from '../src/synchronisation/overpass.js';

const valid = { osm3s: { timestamp_osm_base: '2026-10-30T06:00:00Z' }, elements: [
  { type: 'node', id: 1, lat: 1.35, lon: 103.8, tags: { name: 'Fixture supermarket' } },
] };
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const fetchMock = vi.mocked(fetchWithTimeout);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(budgetSleep).mockResolvedValue(undefined);
});

describe('bounded Overpass supermarket recovery', () => {
  it('returns valid primary data without an unnecessary retry', async () => {
    fetchMock.mockResolvedValue(json(valid));
    expect(await fetchSupermarketData()).toEqual(valid);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(budgetSleep).not.toHaveBeenCalled();
    const [url, init, timeout] = fetchMock.mock.calls[0];
    expect(url).toBe('https://overpass-api.de/api/interpreter');
    expect(timeout).toBe(45_000);
    const query = new URLSearchParams(init!.body as string).get('data');
    expect(query).toContain('[timeout:30]');
    expect(query).toContain('(1.15,103.59,1.48,104.1)');
  });

  it.each([406, 408, 429, 500, 502, 503, 504])('fails over after HTTP %d and returns the mirror data', async (status) => {
    fetchMock.mockResolvedValueOnce(new Response('upstream failure', { status })).mockResolvedValueOnce(json(valid));
    expect(await fetchSupermarketData()).toEqual(valid);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('https://overpass.private.coffee/api/interpreter');
    expect(budgetSleep).toHaveBeenCalledWith(status === 429 || status === 406 ? 30_000 : 1000);
  });

  it('fails over on a transport timeout', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Request timed out')).mockResolvedValueOnce(json(valid));
    expect((await fetchSupermarketData()).elements).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    { remark: 'runtime error: timed out', elements: valid.elements },
    { osm3s: {} },
    { elements: 'not an array' },
    { elements: [{ type: 'node', id: 'invalid' }] },
    { ...valid, osm3s: { timestamp_osm_base: 'not a date' } },
  ])('rejects an incomplete or malformed HTTP 200 response and uses the mirror', async (body) => {
    fetchMock.mockResolvedValueOnce(json(body)).mockResolvedValueOnce(json(valid));
    expect(await fetchSupermarketData()).toEqual(valid);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('recovers from an HTML body masquerading as success', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>gateway</html>')).mockResolvedValueOnce(json(valid));
    expect(await fetchSupermarketData()).toEqual(valid);
  });

  it.each([400, 401, 403, 404])('does not retry permanent HTTP %d', async (status) => {
    fetchMock.mockResolvedValue(new Response('permanent failure', { status }));
    await expect(fetchSupermarketData()).rejects.toThrow(`Overpass API responded ${status}`);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('stops after both mirrors fail, keeping the failure visible to the snapshot pipeline', async () => {
    fetchMock.mockImplementation(async () => new Response('gateway failure', { status: 502 }));
    await expect(fetchSupermarketData()).rejects.toThrow('failed after 2 attempts');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not start an outbound request after the shared sync deadline', async () => {
    await expect(withSyncBudget(0, fetchSupermarketData)).rejects.toBeInstanceOf(SyncBudgetError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propagates exhaustion during the request without trying another endpoint', async () => {
    fetchMock.mockRejectedValue(new SyncBudgetError());
    await expect(fetchSupermarketData()).rejects.toBeInstanceOf(SyncBudgetError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
