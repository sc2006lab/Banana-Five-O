# Vercel and postal search verification — 2 October 2026

## Deployment

- Project: FamPlan, Vercel account wardy's projects.
- Public URL: https://famplan-amber.vercel.app/explore
- Existing React/Vite + Express/Prisma stack retained; free Neon PostgreSQL provisioned in Singapore.
- All six existing/new migrations applied successfully to the empty hosted database.
- Imported nine active validated public snapshots and 332 neighbourhoods. No accounts, credentials, sessions, preferences, destinations or private notes copied.
- Shared workspace packaging corrected after live logs exposed ERR_MODULE_NOT_FOUND. Production shared schemas now ship as compiled JavaScript.

## Verified public flow

Visitor → Explore search → Express API → OneMap exact postal resolution/cache → URA containing polygon → hosted amenity evidence → neighbourhood results/map.

- Health endpoint: HTTP 200, ok=true.
- 310123: HTTP 200, 123 Lorong 1 Toa Payoh / Toa Payoh View; containing neighbourhood TPSZ01 / Toa Payoh West; 17 surrounding results.
- 018961: HTTP 200, 12 Marina View / Asia Square Tower 2; containing neighbourhood DTSZ11. Leading zero retained.
- 12345: HTTP 400 with six-digit guidance.
- Anonymous cron call: HTTP 401; no refresh performed.
- Cloud worker called against the hosted database and live ECDA preschool API: HTTP-equivalent status 200 / NO_CHANGES; validation timestamp refreshed and existing public snapshot retained.
- Browser: residential postal search visibly displays the matched address, correct first neighbourhood and real amenity counts. Mobile map invalidation and return-to-results control repaired.

## Automated checks

- 94 existing/new backend tests + three serverless hydration tests + seven frontend tests pass (104 total).
- TypeScript checks and production build pass.
- Tests cover malformed and leading-zero postal inputs, exact provider POSTAL filtering, supplied access token, cached geocodes, provider authentication errors, cron secret checks, fetch-budget exhaustion, cold-start single-flight hydration, warm refresh and failed-init retry.
- Ignored .env files are excluded from Git and Vercel upload.

## Limits / follow-up

- Supplied OneMap token expires 5 October 2026. Replacement or account-based automatic renewal is necessary for ongoing uncached postal search and live routing.
- School evidence is still transparently incomplete until remaining schools have been geocoded. Source failure does not mean no schools exist.
- Scores/distances are neighbourhood-level, not house-specific walking accessibility or school admission eligibility.
- Cron is configured and its worker/protection verified; a full overnight automatic run has not yet been observed. Hobby cron windows can vary by up to an hour.
- Provider throttling is per warm process; it is not a distributed public API quota guarantee. Configure platform rate controls if abuse/traffic warrants it.
- SMTP is not configured; real password-reset email requires SMTP_URL and a verified MAIL_FROM.
- Formal NFR load, uptime, usability and full accessibility/browser acceptance evidence remain separate from these tests.
