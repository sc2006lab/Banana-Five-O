# Reference UI verification - 26 October 2026

## References and boundary

- GitHub main inspected at ea13a3d; used Lab1/ui_mockups and Lab2/DialogMap_Text.pdf as read-only references.
- SaaS branch used for visual language only: warm palette, Public Sans UI, Instrument Serif editorial headings and DM Mono metadata.
- Kept the family-neighbourhood feature branch. Did not merge main, revive SaaS routes or edit Lab 1 report changes.

## Checks completed

| Check | Evidence |
| --- | --- |
| Frontend regressions | 15 tests passed across 3 files, including eight navigation/flow tests |
| Static types | npm run typecheck passed for client and server |
| Production assets | npm run build passed |
| Actual fonts | Browser computed Public Sans body and Instrument Serif landing heading |
| Header search | Toa Payoh navigated to Explore?q=Toa+Payoh; 10 real results rendered |
| Map/results | Desktop map-left, results-right; actual OneMap tiles and real facility counts |
| Comparison | Selected Braddell and Toa Payoh Central; side-by-side real family metrics rendered |
| Profile | Opened Braddell from Compare; map, amenities, score tabs and bottom actions present |
| Preferences | Visitor guidance, household stages, areas, destinations and eight weight sliders visible |
| Authentication | Mobile tabbed sign-in card inspected; successful return-to-shortlist covered with mocked API test |
| Mobile | 390x844 viewport: header measured 126px, no document horizontal overflow; Show map / Show results remained visible |
| Backend health | Existing public /api/health returned {ok:true}; no backend changes made |

## Known external limitation (not concealed)

Public postal/address lookup currently returns 'Address search is temporarily unavailable. Search by town or area name instead.' The previously provided OneMap token was stated to expire on 5 October 2026. The user explicitly chose to finish the UI before renewing it. The integration and six-digit/leading-zero validation remain intact; no fabricated address match is substituted. Town and planning-area lookup are verified working.

Authenticated account mutations, SMTP delivery, live authenticated route estimation and administrator actions were not exercised against production accounts in this UI-only pass. The backend and its existing protections were left unchanged.

## Local visual preview

Default development still uses http://localhost:3001. To inspect UI against the existing hosted public data, FAMPLAN_DEV_API_TARGET=https://famplan-amber.vercel.app npm run dev -w client overrides only Vite's server-side proxy target. It is not a client-exposed credential. Use a local backend for account-writing tests; this pass used the hosted proxy for read-only data and visitor interactions.
