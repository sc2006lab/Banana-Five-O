# FamPlan reference-aligned UI

## Acceptance criteria

- Use the SaaS branch's visual language (Public Sans UI, Instrument Serif editorial headings, DM Mono metadata; burgundy/cinnabar and warm paper surfaces) without restoring SaaS behaviour.
- Follow the GitHub Lab 1 mockups' map-left/details-right layout, compact filters, cards, tabbed authentication, preference panels and comparison table.
- Follow origin/main's Lab2/DialogMap_Text.pdf for navigation between Landing, Explore, Profile, Compare, Shortlist, Preferences, Commute, account and administrator monitoring.
- Preserve current postal/address search, live data, source/coverage warnings, scoring, personal saved preferences, 10-entry shortlist and 500-character notes.
- Do not restore billing, plans, workspaces, HFE, price history, child-name collection, fabricated listings or manual sync.
- Keep mobile controls usable and keyboard focus visible; avoid animated ancestors that break sticky/fixed positioning.

## Frontend

Restore shared palette/typography, retain restrained motion, and align the landing page and result panels with the reference. Add the mockup's desktop location search to the header, with URL-backed query navigation to Explore. Preserve the current screen when signing in, and provide safe back-to-Explore fallback for directly opened detail/comparison routes.

## Backend

No API, schema, scoring, data synchronisation or deployment-runtime changes. Continue using the existing endpoints. The newer main-branch Lab 3/4 work is inspected read-only, not merged as part of this UI task.

## Security checkpoint

Existing server authentication/ownership checks, input validation, source warnings, rate limits and encoded React output remain unchanged. Search is encoded using URLSearchParams; internal return paths are never generated from a remote destination. No credentials are copied into client code. Visitor preferences remain session-only; saving requires authentication.

## Verification

Typecheck, production build, frontend tests for navigation/search/auth continuation and existing no-SaaS regressions. Inspect the actual responsive UI against the source screenshots and dialog map. Record unavailable upstream services honestly, especially the previously supplied OneMap token's stated 5 October 2026 expiry.
