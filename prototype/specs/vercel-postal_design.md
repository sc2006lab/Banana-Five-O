# Vercel deployment and Singapore postal search

## Acceptance criteria

- Keep React/Vite, Express, Prisma and PostgreSQL; serve frontend and API on one HTTPS origin.
- An anonymous visitor can enter a six-digit Singapore postal code (including leading zeros), see the matched address on the map and discover its containing neighbourhood.
- Reject malformed postal codes before calling OneMap. No result is different from provider failure. Never invent house coordinates or treat a facility directory as a complete residential address directory.
- OneMap credentials remain server-side. Account/private-note authorisation remains unchanged.
- Cold starts hydrate validated datasets from hosted PostgreSQL. Warm instances detect snapshot changes without starting a persistent scheduler.
- Vercel Cron automatically refreshes individual sources, with a shared database lease and bounded fetch budget. Preserve the last validated snapshot on failure.

## Frontend

Keep the existing Explore search and map. Add Singapore scope, an example and a clear neighbourhood-level scoring explanation. Reuse accessible error/loading states.

## Backend

Deploy Vite static output plus a Node.js API function. Separate serverless initialisation from the local Express listener/node-cron startup. Use pooled hosted PostgreSQL; migrations run once during deployment setup, not during visitors' requests.

Postal lookups use exact OneMap POSTAL matching and the existing expiring geocode cache. General street/address lookup remains supported. Cached matches expire; invalid/unmatched inputs do not become approximate neighbourhood matches.

Daily cron per source avoids one long all-source invocation. Initial MOE geocoding may span several bounded runs; successful geocodes persist, but incomplete/failed snapshot activation never replaces known-good data.

## Security checkpoint

Public search is intentionally anonymous; validate length/format on the server and render returned address text through React. DB operations are parameterised. Cron requires a nonempty CRON_SECRET and constant-time comparison; acquire a database lease to avoid duplicate executions. Never ship .env files, demo accounts, private accounts or notes. Existing session/role/JSON mutation guards remain in force. Deploy behind HTTPS. Configure Vercel rate controls for public geocoding; per-process throttling alone is not a distributed quota guarantee.

## Plan

1. Add deployment configuration and serverless initialisation.
2. Add exact cached postal lookup, input validation and search guidance.
3. Add protected per-source cron and bounded fetches.
4. Test/typecheck/build, then link a free hosted PostgreSQL database and configure secrets privately.
5. Migrate/import public data, deploy, verify the live site and postal search.
