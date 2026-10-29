# Exact-address discovery and radius fixes

Baseline: origin/fix/family-planning-v1-1 plus origin/main, fetched 29 October 2026. Preserve existing UI classes/fonts and unrelated coursework.

## Reproduced faults

- Live `GET /api/neighbourhoods?q=238801` returns 503; local OneMap token expired 5 October. Credentials must be renewed for live verification.
- Geocoding only selects neighbouring zones: amenity calculations, profile circles and scores still use zone centroids.
- Name matching prioritises partial/fuzzy zone matches over actual building names, and ambiguous provider results are silently truncated to one.
- Rounded distances can include facilities just outside a radius. Stale asynchronous searches can overwrite newer input and leave old results selectable.

## Acceptance criteria

1. Six-digit postcodes retain leading zeros; supported prefixes normalise consistently on client/server. Invalid postcode-only input receives 400, no match is distinct from provider failure.
2. Town searches continue to work locally. Building/address searches use OneMap; multiple distinct locations require selection rather than silently selecting the first.
3. Address discovery and profile retain a validated, explicit origin in navigation. Radius, counts, filters, score evidence, route origin and map circle all use that same coordinate. Ordinary town profiles continue using their reference point.
4. Exact address analysis uses the containing zone as context, including zones excluded from the family-neighbourhood recommendation list. Outside known boundaries, the closest zone is context only; the address coordinate is never moved.
5. Inclusion uses unrounded great-circle distance, inclusive of the boundary (floating-point tolerance <=1 micrometre); rounding is display-only. Datasets may contain their own positional inaccuracies; these are straight-line distances, not walking/catchment distances.
6. Obsolete/aborted responses never replace current results. Editing address input clears previous choices; errors do not leave stale choices active.

## Implementation and security

- Frontend: preserve styling; carry the selected coordinate/address/radius through the profile link; display choices and correct origin wording in existing components. Cancel outdated requests.
- Backend: validate origin coordinates as a complete Singapore-bounded pair, label length and postal format. Index all validated facilities around an arbitrary point without mutating global zone data. Selected coordinates are public analysis inputs, not authorisation evidence.
- Provider: validate response fields before conversion, deduplicate locations, filter exact postal results, keep authentication on the server and refresh rejected tokens only when account credentials exist. Never cache an outage as not-found.
- No auth/database migrations required. Public discovery stays public, existing protected endpoints stay protected; React escapes provider labels. No API keys in URLs, logs, browser bundles or commits.
- Regression tests cover boundary inclusion, address-vs-centroid disagreement, leading zeros, malformed/duplicate provider records, ambiguity, provider failures and client request races. Run the team's existing tests, type checks and production build too.
