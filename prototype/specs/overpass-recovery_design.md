# Supermarket refresh recovery

## Evidence and intended behaviour

The active supermarket snapshot is retained after an Overpass HTTP 502, but the adapter makes only one request to one public server. A transient provider fault therefore fails the entire daily refresh. Recover transparently where possible without disguising an exhausted refresh as success.

## Change

Use the existing Singapore supermarket query with a 30 second server budget. Try the fixed primary Overpass endpoint, then the documented Private.coffee mirror after a bounded delay for network errors, timeouts, rate limiting, server errors or incomplete/invalid JSON. Each request has a 45 second transport deadline. At most two requests are made, sequentially. Pause 30 seconds after HTTP 406/429, as requested by the primary operator; other transient failures pause one second. Respect the existing shared sync deadline, never retry other permanent HTTP 4xx, and do not accept a 200 response carrying an Overpass runtime error or missing elements.

The existing source adapter transforms the validated response. Snapshot validation, minimum count, regression checks, checksum, atomic activation, previous snapshot retention and source history remain authoritative. Do not alter source status directly to hide an error.

## Frontend and security

No UI, fonts, roles or authentication changes. Admin status reflects the actual recovery outcome. Endpoints and query bounds are constants, not user input, avoiding arbitrary outbound URLs. No credentials go to Overpass. Preserve cron authentication and the database lease; a one-off recovery must use the same validated pipeline and lease.

## Verification

Regression tests cover primary success, 502 and timeout failover, 429, malformed/partial responses, permanent 400, exhausted mirrors and exhausted sync budget. Run source adapter tests, type checks and the production build. Check production history, perform one lease-protected supermarket-only refresh, and verify active records and authenticated admin status afterward. Do not refresh unrelated sources.

Documented public instances: https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances
