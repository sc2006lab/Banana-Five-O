# Exact address search and radius verification

Date: 29 October 2026 (Singapore).

Story: a visitor enters a Singapore postcode or place name, chooses a location if ambiguous, inspects nearby family amenities, adjusts the radius and opens a profile or route without the origin reverting to the neighbourhood centroid.

## Changes verified

- Address analysis uses the selected geocoded coordinate. Its containing URA subzone is context, including zones excluded from general family-neighbourhood recommendations. Outside boundaries, the closest zone is context only.
- Each address produces one consistent evidence set rather than copying centroid-based results for nearby zones. Town discovery continues returning neighbourhood recommendations.
- Profile and route links carry the coordinate, address and radius. The API validates the complete coordinate pair, Singapore bounds, address length and postal format. Profile radius changes update the URL.
- Raw haversine distances decide radius inclusion; only numerical noise up to one micrometre is tolerated. Rounded metres are display values. Nearby facilities are sorted before rounding.
- Counts, count filters, score evidence, map circles and route origins use the selected point. The chosen radius supplies default scoring thresholds; explicit saved category thresholds still override them.
- Ambiguous geocodes present address choices. Null/malformed provider rows are ignored and duplicate points are removed. Postal queries require an exact provider-postal match and preserve leading zeros.
- Outdated client responses are aborted/ignored; editing address input removes stale selectable results. Invalid postcode-only and punctuation-only queries receive validation errors. No-match and dependency failure remain separate outcomes.
- OneMap rejected-token renewal works when account credentials are configured. Token-only deployments still require renewal before expiry. Provider failures are not cached as nonexistent addresses.
- Existing stylesheets, font configuration and styling classes were preserved, apart from adding functional location choices within existing components. Coursework artifacts were not edited by this patch.

## Automated verification

Node 24.22.1; isolated PostgreSQL 18 instance on loopback port 55449; database named `famplan_test`; synthetic fixtures only. Live/public-data verification was separate from the automated suite.

| Check | Result |
|---|---|
| All six existing migrations applied to empty isolated database | Passed |
| Full server regression suite | 221 passed |
| Full client component suite | 23 passed |
| Strict server/client TypeScript checks | Passed |
| Production Vite/shared build | Passed |
| Whitespace/conflict checks | Passed |
| Existing configured coverage gate | Passed: 93.9% branches on the measured modules at the preceding 220-test checkpoint |

Coverage reporting follows the repository's existing include list (scoring, neighbourhood service/deduplication, source transformation/validation); it is not a claim of whole-application coverage. The additional punctuation-input case was included in the final 221-test server run.

Targeted cases include 500/1000/2000 m boundaries (inside, exact, 20 cm outside), address/centroid disagreement, absent source data, postal leading zeros/prefixes/malformed brackets, ambiguous names, malformed provider records, rejected tokens, provider outages, invalid coordinates, duplicate requests, late responses and profile-to-route origin propagation. Existing Lab 4 address tests were updated to mock the actual `searchLocation` boundary and to reflect one exact-address analysis; outdated fixture fields were corrected.

## Real public-data checks

The local preview loaded 9,895 deduplicated facilities from 12,106 records and 332 URA subzones (170 pass the existing family-neighbourhood recommendation filter). These are the currently active validated snapshots, not a claim that every source was refreshed today.

| Query | Observed result |
|---|---|
| `238801` / `ION Orchard` | HTTP 200; 2 Orchard Turn ION Orchard, coordinate 1.303979741445055, 103.832032328465 |
| `018961` / `S(018961)` / `Singapore 018961` | HTTP 200; 12 Marina View, Asia Square Tower 2; leading zero retained |
| `Junction 8` | HTTP 200; 9 Bishan Place, Singapore 579837 |
| `Bedok` | HTTP 200; local town match, seven neighbourhoods; OneMap not required |

Browser search at ION Orchard: changing 1 km to 500 m changed childcare count from 8 to 2, kindergarten count from 2 to 1, supermarket count from 11 to 6 and score from 63 to 58. Opening the profile retained the address coordinate, 500 m radius and score 58. Its map origin marker identifies the selected address; its Commute URL carries the same origin.

## Limits and release status

- This patch does not establish that every application feature works in every possible circumstance. External APIs, source coverage and credential expiry remain dependencies. Distances are straight-line, not walking routes or official school catchments.
- Existing saved shortlists/comparisons are neighbourhood-level records, not saved individual property analyses. They continue using neighbourhood reference points; this patch does not change their persistence model.
- Renewed local OneMap token was verified against the real search endpoint without logging it. Its expiry is 1 November 2026, 18:04 Singapore time. OneMap currently documents three-day tokens: https://www.onemap.gov.sg/apidocs/authentication
- Vercel deployment was blocked during verification: both connector and existing CLI lacked access to the configured FamPlan team. The user was given Vercel's team-access consent link. No release should be described as live until access is restored, a new deployment uses the updated variables, and that deployment is verified.
