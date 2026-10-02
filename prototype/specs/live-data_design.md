# Real public data integration

## Acceptance criteria

- The local demonstration uses a separate database populated by real public provider responses, without synthetic neighbourhoods or facilities.
- Discovery, profile maps and comparison use validated provider snapshots and expose retrieval dates, publisher dates, coverage and missing-data states.
- Automatic synchronisation runs on startup and daily; a failed source retains its last valid snapshot.
- OneMap authenticated features report unavailable when credentials are absent; provider error JSON must never be treated as an empty successful search.
- Record observed source counts and a reproducible demonstration path. Do not describe periodically published datasets as real-time measurements.

## Frontend

Retain the family planning workflow, source attribution, freshness information and unavailable states. Verify actual neighbourhood names and facility counts in the browser after import.

## Backend

Use existing source adapters and transactional synchronisation. Correct the data.gov.sg CSV initialise/poll download sequence and quota handling. Correct OneMap token use for search and routing. Load public sources into `famplan_live`; keep the previous sample preview database available separately. Investigate a public school-location source where authentication is unavailable, accepting only reliable matches and disclosing coverage.

## Security

Provider credentials remain in ignored local environment configuration. Requests target configured providers, use timeouts and validate records before activation. Existing administrator routes remain read-only. Public dataset downloads contain no user account data. Tests use an isolated test database.

## Verification

Run real imports, check source histories and active record counts, verify search/profile/comparison responses and visible UI, and test changed provider response handling. Preserve evidence of failures and required credentials in the handover.
