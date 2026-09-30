# FamPlan: family-neighbourhood workflow (SRS V1.1)

## Scope and acceptance
The local SRS V1.1 and local Lab 3 stack recommendation govern this change. Remove paid plans, billing, invitations and shared workspaces; retain family preferences, discovery, maps, routes, scoring, comparison, private shortlists and read-only administrator monitoring. Do not modify coursework documents or deploy this branch.

- All registered accounts have the same capabilities: at most 10 privately saved neighbourhoods, notes up to 500 characters, comparison of 2–4 neighbourhoods, up to three destinations and eight criterion weights from 0–5.
- Public discovery covers childcare, kindergarten, primary and secondary schools, supermarkets, clinics, parks, MRT and bus stops. HFE and historical prices remain out of scope.
- The interface leads from family priorities to exploration, comparison and saving. Incomplete coverage, approximate travel and unavailable sources must not masquerade as verified facts.
- Synchronisation stays automatic; administrators monitor sources/history, not billing or manual sync.

## Three perspectives
Frontend: retain React/Vite/TypeScript, Context, Leaflet and the current visual language. Remove commercial routes/navigation/copy, make shortlists personal, handle request failures and prevent stale private state after account changes. Add an error boundary.

Backend: retain one Express application, Prisma/PostgreSQL, shared Zod validation and node-cron. Restore account-scoped shortlist queries and database uniqueness/capacity constraints. Keep previous migrations immutable and add a forward removal migration. Abort that migration if existing shared data cannot fit the personal-account constraints; never silently discard notes or saved entries.

Security: retain Argon2id, hashed session/reset tokens, HTTP-only cookies, JSON mutation/CSRF checks and server-side owner/admin checks. Make password-reset consumption atomic, deliver email through configured SMTP without logging tokens, and sanitise server errors. No live user database is to be used for destructive integration-test fixtures.

## Implementation sequence
1. Selectively recover pre-commercial domain contracts and account-owned records; retain unrelated later improvements.
2. Remove commercial models/endpoints/pages/config and add a guarded forward migration.
3. Refine family-focused navigation/content and fix authentication/error-state bugs.
4. Install dependencies, generate Prisma client, run strict TypeScript/build and tests. Add regressions for removed commercial routes, personal ownership and affected behaviour.
5. Document setup, changes and verification limitations. No claim of full NFR compliance without performance, accessibility and user evidence.

## Verification
Use an isolated PostgreSQL test database if available. Run existing tests plus targeted regressions, strict type checks and production build; inspect browser flows where the environment permits. Scan active source for commercial leftovers. Test migration both from a clean database and incompatible-data guard where feasible. Deployment/provider credentials and human usability/performance trials remain explicit external prerequisites.
