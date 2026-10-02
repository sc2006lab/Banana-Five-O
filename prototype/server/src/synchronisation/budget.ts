import { AsyncLocalStorage } from 'node:async_hooks';

const deadline = new AsyncLocalStorage<number>();
export class SyncBudgetError extends Error {
  constructor() { super('Scheduled fetch budget exhausted; retaining the last validated dataset.'); }
}
export function withSyncBudget<T>(ms: number, work: () => Promise<T>): Promise<T> {
  return deadline.run(Date.now() + ms, work);
}
export function remainingSyncBudget(): number {
  const end = deadline.getStore();
  return end === undefined ? Infinity : end - Date.now();
}
export function checkSyncBudget(reserveMs = 1000) {
  if (remainingSyncBudget() <= reserveMs) throw new SyncBudgetError();
}
export async function budgetSleep(ms: number) {
  checkSyncBudget(ms + 1000);
  await new Promise((r) => setTimeout(r, ms));
}
