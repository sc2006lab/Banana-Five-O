# FamPlan V1.1 implementation handover

Date: 30 September 2026. Branch: `fix/family-planning-v1-1`. Requirements authority: the local `FamPlan_SRS_v1.1 (1).docx`, not the repository's V1.3 label.

## Delivered changes

- Removed pricing, billing/Stripe, subscriptions, paid feature limits, invitations, shared workspaces and commercial admin metrics from active application code, routes, contracts, database schema and configuration.
- Restored account-owned preferences, shortlists and notes. The API and PostgreSQL enforce 10 saved neighbourhoods; notes remain limited to 500 characters. Comparison remains 2–4 neighbourhoods.
- Kept the recommended React/Vite/TypeScript, Express, PostgreSQL/Prisma, Leaflet/OneMap and node-cron architecture. No new application service was introduced. Nodemailer implements the existing email boundary; React Testing Library/jsdom are development-only additions.
- Preserved the family-neighbourhood visual design while removing financial/commercial messaging, fabricated fallback counts, the static poster and misleading claims of universal source coverage or verified step-free walks.
- Search and shortlist highlights now carry category availability. Unknown amenities display “Source unavailable”, not a seemingly verified zero. Search cards link to source dates and score explanations.
- Fixed late account responses restoring stale preferences/shortlists, false logout-success feedback, duplicate save clicks, note-prop mutation, stale comparison notes, blank preference-loading pages and unreadable non-JSON API errors. Added a rendering error boundary.
- Password reset now has an SMTP delivery implementation, no console reset links, atomic single-use token consumption and prior-session invalidation. Login attempt updates are serialized per account. Internal errors are sanitised; scheduled sync rejections are handled.
- Added keyboard access/focus styling to the landing-page map and a keyboard-focusable comparison-table scroll region. These are improvements, not a WCAG conformance certification.

## Verification completed

| Check | Observed result |
|---|---|
| Backend tests | 71 passed across 5 files |
| Frontend tests | 7 passed across 2 files |
| Strict TypeScript | Passed |
| Production Vite build | Passed |
| Fresh PostgreSQL migration deployment | All 5 migrations applied successfully |
| Prisma schema comparison | No difference between migrated test database and schema |
| Migration: ordinary personal data | Saved note preserved; commercial tables removed |
| Migration: shared data, duplicate entries, >10 entries, external subscription reference | Each case rejected transactionally with existing records preserved |
| Browser smoke test | Landing, discovery and selecting two fixture neighbourhoods for comparison worked |
| Responsive smoke test | Discovery and comparison inspected at measured 360px content width; no primary-page horizontal overflow. Comparison uses its own horizontal scroll region |
| Git whitespace check | Passed |

Backend tests include registration, generic login failures, lockout, logout, single-use/expired resets, deletion, private-note ownership, preference validation, score reproducibility, shortlist limits, comparison limits, administrator access, source validation and snapshot retention. New tests cover removed commercial endpoints, availability in search results, SMTP boundaries, landing failure states, non-JSON errors, the rendering boundary and late account-state responses.

Tests used Node 24 and an isolated temporary PostgreSQL instance on loopback with synthetic fixtures. The preview used 12 test neighbourhoods and 48 test facilities, not a newly downloaded Singapore dataset. No user's project database, provider credentials, SRS file or Lab 1 document was changed. Only temporary migration-test schemas were dropped after verification.

## Remaining acceptance evidence / limitations

| Requirement area | Remaining work |
|---|---|
| NFR-PERF-01/02, NFR-SCALE-01/02 | Run the specified 15-minute, 100-concurrent-user workload with at least 100,000 records. This run did not establish those targets. |
| NFR-PERF-03; FR-TRV-02–05 | Validate configured OneMap routes, provider timing, timeouts and real coverage. Modelled travel is not a live route or verified step-free journey. |
| NFR-USAB-01 | Conduct the moderated test with at least 10 representative users; verify 80% complete search/select/compare within 3 minutes. |
| NFR-ACC-01/02 | Complete automated accessibility scanning and manual keyboard/screen-reader/contrast review across every core workflow. |
| NFR-COMP-01/02 | Extend smoke checks to all core pages and the specified browser/version matrix, including the 1440px boundary. |
| NFR-REL-01/02 | Run the one-hour reliability and timed restart/recovery exercises. Fixture startup and retained-snapshot tests are not substitutes. |
| NFR-MAINT-02 | Coverage target is not fully established. The existing configured report measured 70.88% branch coverage overall: scoring 88.46%, deduplication 100%, geo helpers 60.71%, data.gov.sg client/parser 49.12%, validation 92.5%. The report scope does not include every source adapter or proximity aggregation path; expand scope/tests before claiming the SRS 80% target. |
| FR-ACC-04 | SMTP success/failure boundaries were mocked; confirm real delivery using your chosen provider. Missing SMTP is surfaced as unavailable. |
| NFR-SEC-01 | Configure and verify HTTPS/TLS 1.2+ on the deployment proxy. Local HTTP preview is not production TLS evidence. |
| Dependency maintenance | `npm audit` reports three high-severity entries in the existing Prisma → @prisma/config → deepmerge-ts dependency chain (one underlying recursive-merge advisory). No major dependency downgrade/override was forced; review a compatible upstream fix before deployment. |

The existing residential-area/three-early-childhood-centre discovery heuristic, name-based kindergarten classification and bus-stop accessibility proxy remain documented in the README. They need team acceptance and suitable source-data checks; do not describe them as guaranteed family suitability, admissions, vacancies or accessibility coverage.

## Before running on existing data

Back up first and stop writes. The forward migration removes membership/invite/plan metadata after safeguards pass. Shared shortlist data and external subscriptions require explicit reconciliation; the migration intentionally stops rather than silently deleting or reassigning records. Resolve any Prisma failed-migration state only after reviewing the underlying data.

Changes are local and uncommitted. Nothing has been pushed, deployed or submitted. Pre-existing Lab 1 edits and artifacts have been preserved.
