# FamPlan — working prototype

FamPlan helps Singapore households compare **family neighbourhoods**. It covers nearby childcare, schools, groceries, clinics, parks, public transport, commute and accessibility. Each neighbourhood gets a transparent, user-weighted suitability score.

The prototype follows **SRS v1.3**, the **Lab 2 class diagram** and the **technology stack recommendation**:

- React + Vite
- Express
- PostgreSQL + Prisma
- Leaflet + OneMap
- node-cron
- Vitest + Supertest

The UI follows the Lab 1 *Warm Institutional* mockups: the burgundy/cinnabar/peach palette, Public Sans and Material Symbols.

> Scope note: the Lab 1 mockups were drawn for HDB resale flats. The SRS v1.3 baseline is neighbourhood-focused and says FamPlan is *not* a property marketplace. The prototype keeps each mockup's layout and applies it to neighbourhoods. The HFE and financial-roadmap screens are left out, in line with the Lab 2 TODO ("Remove HFE").

## Quick start

Prerequisites: Node 22+ and PostgreSQL 16. On macOS: `brew install postgresql@16 && brew services start postgresql@16`.

```bash
cd prototype
cp .env.example .env              # set DATABASE_URL user (e.g. postgresql://<you>@localhost:5432/famplan) and seed passwords
createdb famplan && createdb famplan_test
npm install
npm run db:deploy                 # apply migrations (tables, CHECK constraints, shortlist-capacity trigger)
npm run db:seed                   # data administrator + demo user (credentials from .env)
npm run sync                      # first data load from data.gov.sg / OSM / OneMap (~6 min; schools are geocoded once and cached)
npm run dev                       # API on :3001, web on http://localhost:5173
```

Other commands:

| Command | Purpose |
|---|---|
| `npm test` | Vitest unit tests and Supertest API tests against `famplan_test` |
| `npm run test:coverage -w server` | Coverage for the scoring, geo, dedup, validation and transformation modules |
| `npm run typecheck` | TypeScript check for server and client |
| `npm run build && npm start` | Production build: Express serves the React app and the API on one port |

The server also syncs automatically: daily at 04:00 SGT (`SYNC_CRON`), and at startup when any source has never run or is more than 24 h old.

## What's implemented

| Area | Requirements | Where |
|---|---|---|
| Register, login/logout, password reset, display name, delete account | FR-ACC-01…06, NFR-SEC-02/04 | `server/src/account`, `client/src/pages/SignIn.tsx`, `Account.tsx`, `PasswordReset.tsx` |
| Family stages, areas, up to 3 destinations, amenity distances, 0–5 weights, stage presets | FR-PREF-01…07 | `server/src/preferences`, `client/src/pages/Preferences.tsx` |
| Search by town / planning area / subzone / address / postal code; filters, sort, pagination, apply saved preferences | FR-DISC-01…06 | `server/src/neighbourhoods/service.ts`, `client/src/pages/Explore.tsx` |
| Profile, amenity counts, nearest facility, 500 m / 1 km / 2 km radius, facility details, provenance, category states | FR-NBH-01…10 | `Profile.tsx` |
| Interactive map with category markers, a list alternative, and commute routes | FR-TRV-01…05 | `Profile.tsx`, `Commute.tsx`, `server/src/travel` |
| Explainable score, missing-data treatment, compare 2–4, shortlist (max 10), notes (max 500 chars) | FR-DEC-01…07, NFR-TRANS-01/02 | `server/src/scoring`, `Compare.tsx`, `Shortlist.tsx` |
| Automatic sync, validation, snapshot activation, monitoring (no manual trigger) | FR-ADM-01…04, FR-RES-01…03 | `server/src/synchronisation`, `client/src/pages/Admin.tsx` |

## Data sources (real, authorised open data)

| Source id | Dataset | Categories |
|---|---|---|
| `ura-subzones` | URA Master Plan 2019 Subzone Boundary | neighbourhood boundaries (332 subzones → ~170 family neighbourhoods) |
| `ecda-preschools`, `ecda-childcare` | ECDA Pre-Schools Location; Child Care Services | childcare, kindergarten (deduplicated across both) |
| `moe-schools` | MOE General information of schools, geocoded via OneMap | primary, secondary |
| `osm-supermarkets` | OpenStreetMap `shop=supermarket` (ODbL) | supermarket |
| `moh-chas-clinics` | MOH CHAS Clinics | clinic |
| `nparks-parks` | NParks Parks | parks & playgrounds |
| `lta-mrt-exits`, `lta-bus-stops` | LTA MRT Station Exit; LTA Bus Stop | MRT/LRT, bus stop |

Data.gov.sg datasets are used under the Singapore Open Data Licence. The basemap, search and routing come from OneMap (SLA).

**Family neighbourhood rule:** a URA subzone counts as a family neighbourhood when it:

- lies in a residential planning area, and
- contains at least 3 early-childhood centres inside its boundary.

Its reference point is the area centroid, or the nearest interior point if the centroid falls outside the boundary. All distances are great-circle metres from that point.

## Scoring (`famplan-score-v1.0`, `server/src/scoring/config.ts`)

Each criterion is normalised to 0–1 by a documented linear rule. The rules were calibrated against real Singapore percentiles.

**Total** = Σ(weight × normalised) ÷ Σ(weight) × 100, then rounded to the nearest whole number. An exact .5 rounds up.

- **Missing criteria** are excluded, and their weight is redistributed.
- **All-zero weights** fall back to equal weighting.

The Profile and Compare pages show every criterion's raw value, normalised value, weight share and points contributed, plus the configuration and dataset versions.

## Known limitations / next steps

- **Live routing** needs a free OneMap account: set `ONEMAP_EMAIL` / `ONEMAP_PASSWORD`. Without it, the Commute page shows a clearly labelled straight-line estimate. Search ranking always uses that estimate, so results stay deterministic and don't depend on live APIs.
- **Barrier-free routing:** OneMap does not supply step-free route data, so the app shows the "coverage unavailable" statement from FR-TRV-04. The accessibility criterion uses bus stops within 400 m as a proxy.
- **Email:** without SMTP, password-reset links are printed to the server console instead of being emailed.
- **Kindergartens** are identified by name ("Kindergarten"), because ECDA's location data has no service-type field.
- **Branch coverage:** scoring and validation are above the 80% NFR-MAINT-02 target. `geo.ts` and the data.gov.sg network client are lower (≈60% / ≈50%).
- **Not yet done:**
  - a load test for NFR-PERF (search runs against an in-memory index built from Postgres, ~150 ms rebuild)
  - Playwright end-to-end tests (needs a browser download)
  - a Prisma 7 migration (`package.json#prisma` is deprecated there)

Try the failure-isolation demo (FR-RES-01): run `SYNC_FAIL_SOURCES=moe-schools npm run sync -- moe-schools`. The admin dashboard then shows the failure, while the previous validated schools dataset stays active.
