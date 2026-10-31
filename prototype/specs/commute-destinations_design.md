# Travel modes and multiple commute destinations

## Evidence and intended behaviour

Teacher feedback on the demo: a commute preference must say how the household travels (public transport, car, walk), and saving several commute locations must change the ranking. Before this change every commute estimate assumed public transport, and only the first saved destination reached scoring, sorting or the commute filter.

## Change

- `PriorityDestination.mode` stores a travel mode for each destination; existing rows default to public transport. Modes are the existing `TRAVEL_MODES` (public transport, walk, car, cycle).
- The scoring context carries every destination as a JSON `destinations` query parameter, replacing `destLat`, `destLng` and `destLabel`. The route endpoint still takes one destination.
- The commute criterion, commute sort and maximum-commute filter use the average of the modelled time to each destination, rounded to a whole minute. Each destination counts equally. `commuteLegs` reports each trip so the breakdown can explain the average.
- `SCORING_CONFIG` moves to `famplan-score-v1.2` because identical inputs now give different scores (NFR-DATA-03). `calculateScore()` is unchanged: it still receives one commute value.
- The Commute page starts from the saved mode. Choosing another mode there previews a route and says the score still uses the saved mode.

## Decisions

An average was chosen over a per-destination weight because it needs no new input and is easy to explain in a breakdown. A family that cares more about one destination cannot express that yet.

The same 20 to 75 minute scale applies to every mode, so a long walk scores poorly on purpose: the score measures time spent travelling, not how pleasant the trip is.

Estimates remain straight-line models for search and scoring. Live OneMap routes are still only requested on the Commute page, so ranking 170 neighbourhoods costs no provider calls.

## Related fix

OneMap now returns public search results with a "token missing" notice when no credentials are sent. `searchAddress()` treated that notice as a failure, which broke address search on any machine without OneMap credentials. It now accepts those results when no credentials are configured. It still rejects the notice when credentials are configured or no results came back.
