# Travel modes and multiple commute destinations verification

Date: 31 October 2026 (Singapore).

## Automated

- 255 of 255 server tests and 28 of 28 client tests passed, run against an isolated `famplan_commute_test` database. Type checks and the client production build passed.
- New test IDs CM-1 to CM-9 and CM-C1 to CM-C5 are listed in `Lab4/FamPlan_Lab4_Test_Cases_v1.1`.
- Branch coverage stays above the 80% NFR-MAINT-02 target: `neighbourhoods/service.ts` 93.03%, `scoring/score.ts` 95.23%.

## In the running app

Checked in a browser with a new account and a local copy of the public data (332 neighbourhoods, 12,107 facility records), default weights.

| Saved destinations | Top results |
|---|---|
| Work (Raffles Place) by public transport | Kebun Bahru 94, Serangoon Central 94, Moulmein 91 |
| Work by car | Kebun Bahru 97, Serangoon Central 97, Jelebu 91 |
| Work by car, School (Tampines) by public transport | Serangoon Central 96, Kebun Bahru 95, Katong 90 |

Also confirmed: saved modes survive a page reload; Profile, Compare and Commute show each trip; a mode changed in Explore's filters applies to that search only; a 22-minute maximum commute filters on the average.

## Local load test

`npm run loadtest -w server`, one production-mode Node.js server on a 10-core Mac, load generator on the same machine, read-only requests.

| Simulated users | Think time | Requests | Failed | p95 | p99 |
|---|---|---|---|---|---|
| 100 | 1 s | 2,907 (95/s) | 0 | 77 ms | 106 ms |
| 1,000 | 1 s | 18,873 (615/s) | 0 | 1,290 ms | 1,346 ms |
| 1,000 | 2 s | 13,952 (438/s) | 0 | 299 ms | 1,954 ms |

These numbers are local evidence only. They exclude sign-in and writes, use 12,107 facility records rather than the 100,000 in NFR-PERF-01, and were not measured on the Vercel deployment. Do not present them as the capacity of the live site.

## Not done

- Production has not been migrated or redeployed. Apply `20261031090000_destination_travel_mode` before deploying this code.
- Live OneMap routes were not exercised, because the local machine has no OneMap credentials. The Commute page showed its estimate state instead.
- The original local `famplan` database, still two migrations behind, was left untouched. Verification used a new `famplan_review` database.
