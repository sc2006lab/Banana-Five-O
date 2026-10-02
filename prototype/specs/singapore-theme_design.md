# Singapore red-and-white visual refresh

## Acceptance criteria
- White/light-grey surfaces, Singapore-inspired red actions and charcoal body text; no implication that this student project is an official government service.
- Consistent navigation, cards, forms, map markers and landing page.
- Plain sans-serif headings and concise Singapore-specific copy; remove decorative marquee/pulsing/long entrance motion.
- Keep real-data search, authentication, scoring, error states, labels and API contracts unchanged.
- Verify contrast, mobile map/results navigation, typecheck, tests and production build; deploy to the existing Vercel project.

## Frontend
Retheme central CSS tokens (keep token names to avoid a risky app-wide rename), favicon and explicit chart/map colours. Simplify landing headings/source strip and result-card decoration. Red is for identity/actions, with neutral readable headings; score/status labels retain their independent meaning.

## Backend and security checkpoint
No backend/schema/auth/provider changes. No additional user data collection, APIs or credentials. Existing React text escaping and authorisation remain intact. Existing focus indicators and reduced-motion support are retained. Check red/white text contrast instead of relying on appearance alone.

## Requested microfrontends skill
Reviewed the skill's independent-deployment/routing model. FamPlan is one small cohesive app; no independent ownership/deployment need justifies splitting it. Keep one project/origin and shared design tokens, with no microfrontend dependencies or billing changes.
