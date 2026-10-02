import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const json = (data: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(data), { status, headers });
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('data.gov.sg download contract', () => {
  it('initialises a CSV export before polling and downloading it', async () => {
    fetchMock.mockResolvedValueOnce(json({ code: 0, data: { message: 'started' } }))
      .mockResolvedValueOnce(json({ code: 0, data: { url: 'https://example.org/schools.csv' } }))
      .mockResolvedValueOnce(new Response('school_name,postal_code\nExample,123456'));
    const { downloadDataset } = await import('../src/synchronisation/datagovsg.js');
    expect(await downloadDataset('school-data', { initiate: true })).toContain('school_name');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://api-open.data.gov.sg/v1/public/api/datasets/school-data/initiate-download',
      'https://api-open.data.gov.sg/v1/public/api/datasets/school-data/poll-download',
      'https://example.org/schools.csv',
    ]);
  });

  it('downloads geospatial data directly through poll-download', async () => {
    fetchMock.mockResolvedValueOnce(json({ code: 0, data: { url: 'https://example.org/areas.geojson' } }))
      .mockResolvedValueOnce(new Response('{"type":"FeatureCollection","features":[]}'));
    const { downloadDataset } = await import('../src/synchronisation/datagovsg.js');
    expect(await downloadDataset('areas')).toContain('FeatureCollection');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries an HTTP 429 even when its body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Too many requests', { status: 429, headers: { 'Retry-After': '2' } }))
      .mockResolvedValueOnce(json({ code: 0, data: { name: 'Schools', lastUpdatedAt: '2026-04-17T00:00:00Z' } }));
    const { datasetMetadata } = await import('../src/synchronisation/datagovsg.js');
    const result = datasetMetadata('schools');
    await vi.runAllTimersAsync();
    expect((await result).name).toBe('Schools');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('waits for an export that is still being prepared', async () => {
    fetchMock.mockResolvedValueOnce(json({ code: 0, data: {} }))
      .mockResolvedValueOnce(json({ code: 0, data: { url: 'https://example.org/data.csv' } }))
      .mockResolvedValueOnce(new Response('ready'));
    const { downloadDataset } = await import('../src/synchronisation/datagovsg.js');
    const result = downloadDataset('preparing');
    await vi.runAllTimersAsync();
    expect(await result).toBe('ready');
  });
});

describe('OneMap response contract', () => {
  const school = { SEARCHVAL: 'EXAMPLE SCHOOL', ADDRESS: '11 EXAMPLE ROAD', POSTAL: '738907', LATITUDE: '1.4426', LONGITUDE: '103.8000' };

  it('accepts a valid public search response and returns provider coordinates', async () => {
    const { config } = await import('../src/config.js');
    config.onemap = { email: '', password: '', accessToken: '' };
    fetchMock.mockResolvedValue(json({ found: 1, results: [school] }));
    const { searchAddress } = await import('../src/travel/onemap.js');
    expect(await searchAddress('738907')).toEqual([expect.objectContaining({ lat: 1.4426, lng: 103.8 })]);
  });

  it('does not turn an HTTP 200 authentication error into an empty search', async () => {
    const { config } = await import('../src/config.js');
    config.onemap = { email: '', password: '', accessToken: '' };
    fetchMock.mockImplementation(async () => json({ error: 'Missing token' }));
    const { searchAddress, onemapHealth } = await import('../src/travel/onemap.js');
    const result = expect(searchAddress('738907')).rejects.toThrow('Configure valid OneMap credentials');
    await vi.runAllTimersAsync();
    await result;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(onemapHealth.lastOkAt).toBeNull();
    expect(onemapHealth.lastErrorAt).not.toBeNull();
  });

  it('authenticates search when OneMap credentials are configured', async () => {
    const { config } = await import('../src/config.js');
    config.onemap = { email: 'fixture@example.com', password: 'test-only', accessToken: '' };
    fetchMock.mockResolvedValueOnce(json({ access_token: 'fixture-token', expiry_timestamp: String(Date.now() / 1000 + 3600) }))
      .mockResolvedValueOnce(json({ results: [school] }));
    const { searchAddress } = await import('../src/travel/onemap.js');
    expect(await searchAddress('738907')).toHaveLength(1);
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'fixture-token' });
  });

  it('reuses a recent geocode without another provider request', async () => {
    const { prisma } = await import('../src/db.js');
    vi.spyOn(prisma.geocodeCache, 'findUnique').mockResolvedValue({ key: 'postal:738907', lat: 1.44, lng: 103.8, address: 'Recent address', retrievedAt: new Date() });
    const { geocodeCached } = await import('../src/travel/onemap.js');
    expect(await geocodeCached('postal:738907', '738907')).toMatchObject({ lat: 1.44 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes expired geocodes instead of retaining an old location forever', async () => {
    const { config } = await import('../src/config.js');
    config.onemap = { email: '', password: '', accessToken: '' };
    const { prisma } = await import('../src/db.js');
    vi.spyOn(prisma.geocodeCache, 'findUnique').mockResolvedValue({ key: 'postal:738907', lat: 1.3, lng: 103.7, address: 'Old address', retrievedAt: new Date(Date.now() - 8 * 86_400_000) });
    const upsert = vi.spyOn(prisma.geocodeCache, 'upsert').mockResolvedValue({ key: 'postal:738907', lat: 1.4426, lng: 103.8, address: 'Updated address', retrievedAt: new Date() });
    fetchMock.mockResolvedValueOnce(json({ results: [school] }));
    const { geocodeCached } = await import('../src/travel/onemap.js');
    expect(await geocodeCached('postal:738907', '738907')).toMatchObject({ lat: 1.4426 });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ lat: 1.4426 }) }));
  });
});
