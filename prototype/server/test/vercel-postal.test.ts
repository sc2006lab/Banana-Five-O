import { afterEach, describe, expect, it, vi } from 'vitest';
import { postalCode } from '../src/travel/postal.js';
import { validCronAuthorization } from '../src/synchronisation/cloud.js';
import { checkSyncBudget, withSyncBudget, SyncBudgetError } from '../src/synchronisation/budget.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Singapore postal input', () => {
  it.each(['012345', ' 012345 ', 'Singapore 012345', 'S(012345)'])('retains leading zeros in %s', (q) => {
    expect(postalCode(q)).toBe('012345');
  });
  it.each(['12345', '1234567', 'S(12345)'])('rejects malformed code %s', (q) => {
    expect(() => postalCode(q)).toThrow('six-digit');
  });
  it.each(['123 Bedok Road', 'Bishan', 'Woodlands Avenue 1'])('keeps name/address %s', (q) => {
    expect(postalCode(q)).toBeNull();
  });
});

describe('serverless refresh protection', () => {
  it('rejects absent secrets, mismatched tokens and empty headers', () => {
    expect(validCronAuthorization('Bearer test', '')).toBe(false);
    expect(validCronAuthorization(undefined, 'test')).toBe(false);
    expect(validCronAuthorization('Bearer wrong', 'test')).toBe(false);
    expect(validCronAuthorization('Bearer test', 'test')).toBe(true);
  });
  it('does not apply cloud deadlines to normal local synchronisation', () => {
    expect(() => checkSyncBudget()).not.toThrow();
  });
  it('fails before exhausting the cloud fetch budget', async () => {
    await expect(withSyncBudget(10, async () => checkSyncBudget(1000))).rejects.toBeInstanceOf(SyncBudgetError);
  });
});

describe('OneMap postal contract', () => {
  it('uses a supplied access token without sending a password', async () => {
    const { config } = await import('../src/config.js');
    const previous = config.onemap;
    config.onemap = { email: '', password: '', accessToken: 'fixture-only' };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [
      { ADDRESS: '12 EXAMPLE ROAD', POSTAL: '012345', LATITUDE: '1.32', LONGITUDE: '103.82' },
      { ADDRESS: 'OTHER ADDRESS', POSTAL: '112345', LATITUDE: '1.33', LONGITUDE: '103.82' },
    ] })));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { searchAddress } = await import('../src/travel/onemap.js');
      const hits = await searchAddress('Singapore 012345');
      expect(hits).toHaveLength(1);
      expect(hits[0].postal).toBe('012345');
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('fixture-only');
    } finally { config.onemap = previous; }
  });
});
