// Read-only load test for NFR-SCALE-02: simulated users browse search, profile and comparison, pausing between requests.
// Usage: npm run loadtest -w server -- <baseUrl> <users> <seconds> [thinkMs]
// Refuses non-local targets: a public deployment and its database should not receive test traffic by accident.
export {};

const [base = 'http://localhost:3001', usersArg = '100', secondsArg = '30', thinkArg = '1000'] = process.argv.slice(2);
const users = Number(usersArg);
const seconds = Number(secondsArg);
const thinkMs = Number(thinkArg);

if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) throw new Error('Load tests only run against a local server.');
if (![users, seconds, thinkMs].every((n) => Number.isFinite(n) && n >= 0)) throw new Error('Users, seconds and thinkMs must be numbers.');

const api = `${base}/api`;
const points = (await (await fetch(`${api}/neighbourhoods/points`)).json()) as { id: string }[];
if (!points.length) throw new Error('The target has no neighbourhoods loaded.');

const pick = () => points[Math.floor(Math.random() * points.length)].id;
const trips = encodeURIComponent(JSON.stringify([
  { lat: 1.284, lng: 103.851, label: 'Work', mode: 'drive' },
  { lat: 1.352, lng: 103.944, label: 'School', mode: 'pt' },
]));
const workload: Record<string, () => string> = {
  search: () => `/neighbourhoods?pageSize=12&destinations=${trips}`,
  'filtered search': () => `/neighbourhoods?pageSize=12&radius=2000&category=childcare&minCount=1&sort=commute&destinations=${trips}`,
  profile: () => `/neighbourhoods/${pick()}?destinations=${trips}`,
  facilities: () => `/neighbourhoods/${pick()}/facilities?radius=1000`,
  comparison: () => `/compare?ids=${pick()},${pick()}&destinations=${trips}`,
};
const operations = Object.keys(workload);
const results = new Map(operations.map((op) => [op, { ms: [] as number[], failed: 0 }]));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const deadline = Date.now() + seconds * 1000;

async function simulatedUser() {
  await sleep(Math.random() * thinkMs); // Spread the first requests so users do not all arrive at once.
  while (Date.now() < deadline) {
    const op = operations[Math.floor(Math.random() * operations.length)];
    const started = performance.now();
    const record = results.get(op)!;
    try {
      const res = await fetch(api + workload[op]());
      await res.arrayBuffer();
      // Compare picks two random neighbourhoods, which may be the same one: that 400 is expected, not a failure.
      if (res.status >= 500) record.failed++;
      else record.ms.push(performance.now() - started);
    } catch {
      record.failed++;
    }
    await sleep(thinkMs);
  }
}

const startedAt = Date.now();
await Promise.all(Array.from({ length: users }, simulatedUser));
const elapsed = (Date.now() - startedAt) / 1000;

const percentile = (sorted: number[], p: number) => (sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]) : 0);
const rows = [...results].map(([operation, { ms, failed }]) => {
  const sorted = [...ms].sort((a, b) => a - b);
  return { operation, requests: ms.length + failed, failed, p50ms: percentile(sorted, 0.5), p95ms: percentile(sorted, 0.95), p99ms: percentile(sorted, 0.99) };
});
const total = rows.reduce((sum, r) => sum + r.requests, 0);
const failed = rows.reduce((sum, r) => sum + r.failed, 0);
console.table(rows);
const all = [...results.values()].flatMap((r) => r.ms).sort((a, b) => a - b);
console.log(`${users} users, ${thinkMs} ms think time, ${elapsed.toFixed(0)} s: ${total} requests (${(total / elapsed).toFixed(0)}/s), ${failed} failed, overall p95 ${percentile(all, 0.95)} ms, p99 ${percentile(all, 0.99)} ms`);
