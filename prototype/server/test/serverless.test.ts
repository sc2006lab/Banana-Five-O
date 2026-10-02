import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const { registry, rebuild } = vi.hoisted(() => ({ registry: vi.fn(), rebuild: vi.fn() }));
vi.mock('../src/db.js', () => ({ prisma: { dataSourceRegistry: { findMany: registry } } }));
vi.mock('../src/neighbourhoods/store.js', () => ({ rebuildIndex: rebuild }));
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  registry.mockReset().mockResolvedValue([{ id: 'source', status: 'OK', lastSuccessAt: '2026-10-02' }]);
  rebuild.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

it('shares cold-start hydration and skips unnecessary warm reads', async () => {
  const { refreshServerlessIndex } = await import('../src/serverless.js');
  await Promise.all([refreshServerlessIndex(), refreshServerlessIndex()]);
  await refreshServerlessIndex();
  expect(registry).toHaveBeenCalledOnce();
  expect(rebuild).toHaveBeenCalledOnce();
});
it('rebuilds a warm instance when the persisted source state changes', async () => {
  const { refreshServerlessIndex } = await import('../src/serverless.js');
  await refreshServerlessIndex();
  registry.mockResolvedValue([{ id: 'source', status: 'FAILED', lastSuccessAt: '2026-10-02' }]);
  vi.advanceTimersByTime(31_000);
  await refreshServerlessIndex();
  expect(rebuild).toHaveBeenCalledTimes(2);
});
it('retries failed cold-start hydration on the next request', async () => {
  registry.mockRejectedValueOnce(new Error('temporary failure'));
  const { refreshServerlessIndex } = await import('../src/serverless.js');
  await expect(refreshServerlessIndex()).rejects.toThrow('temporary failure');
  await refreshServerlessIndex();
  expect(rebuild).toHaveBeenCalledOnce();
});
