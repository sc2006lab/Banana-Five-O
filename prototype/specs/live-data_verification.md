# FamPlan real-data demonstration

Verified locally on 1 October 2026. The browser at http://127.0.0.1:5173 uses `famplan_live`, a separate database containing actual provider responses. The earlier sample database is not used by this preview.

## What is loaded

| Source | Validated records | How obtained |
|---|---:|---|
| URA Master Plan 2019 subzones | 332 | data.gov.sg GeoJSON download API |
| ECDA preschool locations | 2,223 | data.gov.sg GeoJSON download API |
| ECDA childcare services | 1,925 | data.gov.sg GeoJSON download API |
| MOE primary/secondary schools | 256 | data.gov.sg CSV API, coordinates from successful OneMap search responses |
| OpenStreetMap supermarkets | 587 | Overpass API |
| MOH CHAS clinics | 1,192 | data.gov.sg GeoJSON download API |
| NParks parks/playgrounds | 462 | data.gov.sg GeoJSON download API |
| LTA MRT stations | 190 | data.gov.sg station exits, aggregated per station |
| LTA bus stops | 5,204 | data.gov.sg GeoJSON download API |

The application deduplicates the 12,039 facility source records into **9,828 facilities**. Its existing residential-area/early-childhood-centre heuristic makes **170 of 332 subzones** searchable. The landing page obtains these counts from the backend.

All nine sources produced an initial validated snapshot. School coverage is partial: **70 of 326 in-scope school rows could not be geocoded**. A subsequent refresh returned OneMap authentication errors and correctly retained the 256-school snapshot; the administrator status now shows that failure. Search, profiles and comparison display incomplete school coverage. Do not claim complete Singapore school coverage.

## Demonstration path

1. Open the home page: show the provider-derived totals and Singapore subzone map.
2. Open Explore and search `Bishan`: Bishan East, Marymount and Upper Thomson appear.
3. Open Bishan East: the map includes Kuo Chuan Presbyterian schools, Bishan MRT, YWCA Bishan Child Development Centre and Sheng Siong. Expand amenity categories for facility names, distances and source information.
4. Compare Bishan East and Marymount. At the verified default 1 km radius their scores were 70 and 66. Changing priorities/radius can change scores. School coverage warnings remain visible alongside the results.
5. Expand the source information in a profile to distinguish retrieval time from the publisher's last update. The latest public files have varying publication dates, including older 2024 preschool/clinic datasets.

Quick comparison: http://127.0.0.1:5173/compare?ids=BSSZ03,BSSZ02

## What “live data” means here

FamPlan downloads real provider data through APIs, validates it, then serves the stored snapshot for fast and resilient searches. Automatic checks run on startup when due and daily at 04:00 Singapore time while the server/computer is running. The currently running preview uses this configuration. A sleeping computer cannot execute the daily job; a later restart checks for overdue sources.

These are periodically published datasets, not real-time school admissions, childcare vacancies or shop opening confirmations. Provider update dates are shown separately from the latest download/validation date.

**OneMap credentials are still required for reliable address search, complete school refreshes and live route directions.** Its documented search API requires a token. During this run some standard public search requests returned valid records, while others returned an authentication error inside HTTP 200. FamPlan rejects responses containing that error and stops the school refresh promptly. It does not treat rejected responses as valid locations or empty successful searches. Without configured credentials, commute routes remain explicitly labelled modelled estimates.

Add your own `ONEMAP_EMAIL` and `ONEMAP_PASSWORD` to the ignored local `.env`, then restart the API. Never commit that file. If loading for the first time, follow the README database setup and let the automatic startup synchronisation complete. The developer `npm run sync -- moe-schools` command can refresh that one source after credentials are configured; this is not an administrator UI action.

## Integration corrections and evidence

- CSV exports now initialise before polling; delayed exports and HTTP 429 responses are retried with a bounded wait.
- Configured OneMap credentials authenticate search as well as routing. Authentication errors stop retries and school activation, preserving the previous snapshot.
- Cached school coordinates expire after seven days; negative geocodes expire after one day.
- Comparison now exposes partial/unavailable/stale amenity coverage and links to source dates.
- HTTP checks returned actual Bishan neighbourhoods, facility data and comparison results. Browser checks confirmed the same data on the landing page, discovery, Bishan East profile/map and comparison.
- Provider regression tests cover download order, rate limiting, pending exports, authentication errors, authenticated search and geocode-cache refresh. **80 backend tests and 7 frontend tests passed**; TypeScript checks and the production build also passed.

## Provider documentation

- [data.gov.sg download sequence](https://guide.data.gov.sg/developer-guide/dataset-apis/download-dataset)
- [MOE school directory dataset](https://data.gov.sg/datasets/d_688b934f82c1059ed0a6993d2a829089/view)
- [OneMap search token requirements](https://www.onemap.gov.sg/apidocs/docs/verifyingsearchapitoken)

This verifies real integrations and selected user flows; it does not replace the load, accessibility and usability acceptance evidence listed in the V1.1 verification report.
