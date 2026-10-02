# FamPlan — family neighbourhood planning

FamPlan helps couples and households choose neighbourhoods that suit their family plans: childcare, schools, supermarkets, healthcare, parks, transport and journeys to work or relatives. It is a comparative planning aid, not a flat-price tool, admissions predictor or vacancy service.

## Baseline and stack

The local **FamPlan SRS V1.1** is the requirements baseline (48 FRs, 29 NFRs, 16 use cases). Repository documents with different version numbers do not supersede it for this change.

Keep the Lab 3 stack simple: React + Vite + TypeScript, Express, PostgreSQL + Prisma, Leaflet + OneMap, and node-cron inside Express. Context handles shared UI state. Zod validates input on both sides; Argon2id and HTTP-only server sessions handle authentication. Nodemailer provides the password-reset email boundary. Vitest, React Testing Library and Supertest are development tools, not additional services.

There are **no subscriptions, payments, plan upgrades, invitations, shared workspaces or paid limits**. Every registered account has its own preferences, shortlist and private notes.

## User workflow

1. Explore publicly, or create an account to save family stages, areas and priorities.
2. Set family preferences and optional destinations. Visitors can try weights for the current visit.
3. Search/filter neighbourhood profiles; inspect amenities, distances, missing data and source dates.
4. Select 2–4 neighbourhoods and compare their scores, amenities and commute estimates.
5. Save up to 10 neighbourhoods with private notes of up to 500 characters.
6. Administrators monitor automatic source updates and history. They do not manually start sync.

The burgundy/peach UI, maps, score explanations and reduced-motion support are retained. Pricing pages, payment buttons and commercial admin metrics have been removed.

## Local setup

Use Node **24 LTS** (or supported Node 22.12+) and PostgreSQL 16+. Start with an empty development database. Do not point the test suite at a database you need to preserve.

```bash
cd prototype
cp .env.example .env
# Edit DATABASE_URL, APP_ORIGIN and unique seed passwords in .env.
createdb famplan
createdb famplan_test
npm ci
npx prisma generate
npm run db:deploy
npm run db:seed
npm run dev
```

Open http://localhost:5173. Express runs on port 3001. At startup it checks for sources that have never succeeded or are overdue, and begins loading them automatically. Until validated data is available, affected views show unavailable states. The daily schedule defaults to 04:00 Singapore time. Keep the server running for scheduled checks.

Optional integrations:

- `ONEMAP_EMAIL` / `ONEMAP_PASSWORD`: authenticated address search, school geocoding and live routes. OneMap documents authentication for search as well as routing. Public search responses are accepted when provided, but authentication errors stop the school refresh and preserve its last valid snapshot. Without credentials, live routes are unavailable and travel estimates are labelled.
- `SMTP_URL` / `MAIL_FROM`: real password-reset delivery. Without SMTP, the reset endpoint returns an availability message. Reset links are never printed to logs.
- `HTTPS=true`, a TLS-terminating reverse proxy, and the real `APP_ORIGIN`: production deployment. Configure TLS 1.2+ at the proxy. Never submit real credentials over an HTTP deployment.

`docker compose up --build` is an optional local alternative, not an extra production service requirement. Its sample database password and HTTP configuration are for local development only.

## Upgrading an existing database

Back up the database and stop application writes before applying the new migration. The old migration history is deliberately retained; `20260930090000_personal_family_planning` removes the commercial models.

- Personal shortlist entries and notes are preserved.
- Shared shortlist entries, duplicate account/neighbourhood pairs, more than 10 entries per account, or unresolved external subscriptions stop the migration with `PERSONAL_MIGRATION_REVIEW_REQUIRED`.
- Export and reconcile flagged records with their owners first; do not simply delete them to bypass the guard. Resolve any external subscriptions before discarding billing references.
- Workspace membership/invite metadata and plan fields are removed after the checks pass. Keep the backup if these records need archival.
- A stopped migration is transactional. After resolving the data, follow Prisma's failed-migration recovery procedure before retrying deployment.

No existing development or production database was upgraded during this implementation; verification used an isolated fixture database.

## Commands

| Command | Purpose |
|---|---|
| `npm run typecheck` | Strict server/client TypeScript checks |
| `npm run build` | Production React build |
| `npm test` | Backend and frontend tests |
| `npm run test -w client` | Browser-component tests without a database |
| `npm run test:coverage -w server` | Coverage of the configured backend modules |
| `npm run db:deploy` | Apply reviewed migrations to DATABASE_URL |
| `npm run db:seed` | Create configured administrator/demo accounts |
| `npm run sync` | Developer setup/diagnostic command, not an administrator UI feature |

Backend integration tests use `TEST_DATABASE_URL`, defaulting to the local `famplan_test` database. Apply migrations to that database separately before testing:

```bash
DATABASE_URL="postgresql://localhost:5432/famplan_test" npm run db:deploy
TEST_DATABASE_URL="postgresql://localhost:5432/famplan_test" npm test
```

Test fixtures refuse to clear a database whose name does not end in `_test`. Use only disposable test data.

## Requirement implementation map

| Requirements | Implementation |
|---|---|
| FR-ACC-01–06 | Registration, login/logout, email reset, display-name editing, confirmed account deletion |
| FR-PREF-01–07 | Family stages, areas, up to 3 destinations, amenity radii, eight 0–5 weights, saved profiles and editable presets |
| FR-DISC-01–06 | Search, filters, apply saved preferences, profile labels, sorting and validation |
| FR-NBH-01–10 | Neighbourhood boundaries/reference points, nine amenity categories, 500/1000/2000 m radii, distances, source metadata and availability warnings |
| FR-TRV-01–05 | Maps, provider-backed routes where configured, supported modes, barrier-free limitation and route provenance |
| FR-DEC-01–07 | Explainable scores, missing-data rules, 2–4 comparison, private 10-entry shortlists and 500-character notes |
| FR-ADM-01–04; FR-RES-01–03 | Role-protected monitoring, automatic sync, history, last-valid snapshot retention, failure isolation and freshness warnings |

This maps implemented code, not a claim that every acceptance scenario or NFR has been certified.

## Data and scoring limitations

Sources remain isolated adapters in `server/src/synchronisation/sources.ts`: URA subzones, ECDA childcare/preschools, MOE schools, MOH CHAS clinics, NParks parks, LTA rail/bus data through data.gov.sg, OpenStreetMap supermarkets and OneMap.

The existing discovery rule selects residential subzones containing at least three early-childhood centres. This is a product heuristic, not an SRS definition or proof that excluded areas are unsuitable. Review it with the team before final acceptance.

Distances are straight-line distances from a neighbourhood reference point, not walking distances from a particular home. Kindergarten classification currently uses facility names; missing source detail must not be interpreted as confirmed service availability. The accessibility score is a bus-stop proximity proxy, not verified step-free access.

Scores use disclosed normalisation and weights, with exact .5 rounded upward. Missing criteria are excluded; if all available criteria have weight zero, the documented equal-weight fallback applies. Live-route estimates and locally modelled commute times are distinguished.

## Verification and remaining evidence

The local real-data run and assignment demonstration steps are documented in [real-data demonstration](specs/live-data_verification.md). These are provider datasets retrieved through APIs and refreshed daily, with publisher dates shown; they are not real-time childcare vacancy or school admission feeds.

See [implementation verification](specs/family-planning-v1-1_verification.md). Performance at 100,000 records/100 concurrent users, the one-hour reliability target, moderated usability trials, full WCAG AA review and the required multi-browser matrix need separate acceptance evidence. Do not describe the prototype as meeting all 29 NFRs merely because the build and unit tests pass.
