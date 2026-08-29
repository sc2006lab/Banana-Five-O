# FamPlan

**Course:** SC2006 Software Engineering
**Deliverable:** Lab #1, Functional and Non-Functional Requirements

---

# 1. Project name

**FamPlan.**

A web application that helps a Singapore household decide which HDB resale flats are worth
considering, by bringing market history, location and travel measures, and an indicative
financing pre-check into one comparable view.

---

# 2. Mission statement

FamPlan exists to let a household compare candidate HDB resale flats against its own priorities
rather than against price alone.

The application gathers what is already published about a block and flat type, historical resale
transactions, nearby schools, transport and daily amenities, travel time to the places the
household actually goes, and general financing eligibility, and presents them together with a
suitability score the household weights itself. Every figure it shows carries its source and the
date it was retrieved, every gap in the evidence is named rather than hidden, and every output
that touches money or eligibility is labelled as indicative rather than official.

---

# 3. Problem being solved

Choosing an HDB resale flat requires reconciling information that is published in separate places
and never assembled for the buyer.

- **Price is comparable; nothing else is.** Resale transaction data is public, so buyers compare
  flats on price and price per square metre. Remaining lease, commute time, school access,
  amenity coverage and barrier-free access all bear on the decision, but each lives in a
  different portal and none of them is expressed in a form that can be traded off against price.
- **Priorities differ between households and no tool takes them as input.** A family with young
  children, a couple both commuting to the city, and a household with a wheelchair user are
  looking at the same listings and weighing them very differently. Existing tools rank by price
  or recency, never by what a particular household cares about.
- **Eligibility is discovered late.** Home Financing Eligibility, grant categories and loan
  readiness are assessed through a separate official process. A household can shortlist flats for
  weeks before finding out that its budget assumptions, or a flat's remaining lease, do not work.
- **Absent data is presented as zero.** Where a source has no matching record, tools commonly
  display a blank or a zero, which reads as a real value. A buyer cannot tell "no transactions in
  this block" from "this block is cheap".

FamPlan addresses these four by scoring flats against household-set weights (§9.6), exposing the
criterion values and weights behind every score (NFR-TRANS-01), offering an indicative HFE
pre-check before the household commits time to a shortlist (§9.7), and distinguishing missing
data from low values everywhere it reports (FR-MKT-08, FR-DEC-03).

---

# 4. Users

| User | Description | What they can do |
|---|---|---|
| Visitor | An unauthenticated member of the public. | Search and filter flats, view block-and-flat profiles and market history, view nearby places and routes, compare profiles, and run the indicative HFE pre-check. Cannot save anything. |
| Registered user | A visitor who has created an account (FR-ACC-01). | Everything a visitor can do, plus saved housing preferences and criterion weights, a shortlist of up to the documented limit, and private notes against shortlisted flats. |
| Data administrator | A registered user holding the administrator role (FR-ADM-01). | Everything a registered user can do, plus source synchronisation status, manual refresh of one source at a time, and synchronisation history. |
| System | Scheduled processes acting without a user present. | Check each configured source for updates at least every 24 hours (FR-ADM-04) and preserve the last validated dataset when a refresh fails (FR-RES-01). |

Within the visitor and registered-user groups, three household situations shaped the requirements
and are worth naming because they drive specific criteria:

- **Households with school-age children**, for whom school proximity is a weighted criterion
  (FR-PREF-05) and nearby schools are a retrieved category (FR-LOC-02).
- **Commuting households**, who set up to three priority destinations and compare estimated
  travel time across candidate flats (FR-PREF-03, FR-LOC-05).
- **Households with accessibility needs**, who set a barrier-free access preference (FR-PREF-04)
  and receive barrier-free routing where the provider covers it, or an explicit statement that it
  does not (FR-LOC-06).

---

# 5. Data sources

All five sources are public. None requires payment. Assumptions A-1 to A-5 in §6 record what
each is relied on for and what breaks if the reliance is wrong.

| Source | Provider | Used for | Access |
|---|---|---|---|
| HDB Resale Flat Prices | data.gov.sg | Historical resale transactions: month, town, block, street, flat type, storey range, floor area, lease commencement, remaining lease, resale price. Behind FR-MKT-02 to FR-MKT-05. | Open API, no key |
| HDB Property Information | data.gov.sg | Block-level attributes: block number, street, town code, maximum floor level, year completed, dwelling units. Behind FR-MKT-01. | Open API, no key |
| School Directory and Information | data.gov.sg (Ministry of Education) | School names and addresses for the schools criterion and nearby-school retrieval. Carries no coordinates, so schools are geocoded before use. Behind FR-LOC-02. | Open API, no key |
| OneMap | Singapore Land Authority | Address search and geocoding, map display, routing for walk, drive, cycle and public transport, barrier-free access routing, and categorised nearby places. Behind FR-LOC-01 to FR-LOC-07 and FR-PREF-03. | Free registration; token required for routing and protected theme queries |
| DataMall static train station dataset | Land Transport Authority | MRT and LRT station coordinates, supplementing OneMap where its coverage of stations is thin. Behind FR-LOC-02. | Free registration |

Two properties of these sources shape the data model directly:

- **The two HDB datasets share no town key.** The resale dataset names towns in full
  ("BUKIT MERAH"); the property dataset uses a three-letter code. The join is on normalised block
  number plus normalised street name, and the unmatched rate is measured and reported through the
  administration view rather than assumed to be zero.
- **Remaining lease is derived from a year.** Lease commencement is published as a year with no
  month, so any remaining-lease figure is accurate only to within twelve months. This is stated
  on screen wherever the figure appears, per NFR-DATA-01.

---

# 6. Assumptions and constraints

Assumptions (A) are beliefs about the world that the requirements rest on. Constraints (C) are
limits the implementation must respect. Both are stated so that a wrong assumption is caught
deliberately rather than discovered in testing.

| # | Assumption or constraint | Consequence if wrong |
|---|---|---|
| A-1 | data.gov.sg's HDB Resale Flat Prices and HDB Property Information datasets are the market and property source, joined on normalised block plus street, since the two datasets share no town key. | FR-MKT-01, FR-MKT-02, FR-MKT-03, FR-SRCH-01, FR-SRCH-02 and NFR-SCALE-01 all depend on this join. A bad join silently attributes transactions to the wrong block. |
| A-2 | OneMap is the geocoding, routing and nearby-amenity provider. Address search is free and unauthenticated; routing and protected theme queries require a free token. | FR-LOC-01 to FR-LOC-07, and FR-PREF-03. If the token terms change, every location feature is affected at once. |
| A-3 | OneMap's barrier-free access routing has real but partial coverage, so FR-LOC-06's unavailable-coverage path is required rather than optional. | FR-LOC-06. Treating coverage as complete could route a barrier-free request onto an inaccessible path. |
| A-4 | The MOE School Directory carries no coordinates, so every school is geocoded before it can appear as a nearby place or contribute to a distance. | FR-LOC-02, FR-LOC-04, and the schools criterion in FR-PREF-05 and FR-DEC-01. |
| A-5 | LTA DataMall's static train station dataset supplements OneMap for MRT and LRT coordinates where coverage is thin. | FR-LOC-02. |
| A-6 | The HFE ruleset is authored by the team from HDB's published general eligibility information and is illustrative. CPF grant category names are current, but no exact grant or loan amount is computed or presented as authoritative. | FR-HFE-03 to FR-HFE-08. Presenting an illustrative ruleset as authoritative would breach FR-HFE-08 directly. |
| A-7 | Published resale transactions are a sufficient basis for indicative market evidence. FamPlan reports what has sold, and does not model or predict future prices. | FR-MKT-07. Any wording that implies prediction would misrepresent what the data supports. |
| C-1 | HFE pre-check answers must never reach persistent storage, logs or analytics. This is enforced architecturally, through a request-scoped object with no serialiser to any sink, rather than by convention. | NFR-PRIV-01. A single stray log line breaches the requirement. |
| C-2 | The transaction store must scale to at least 1,000,000 rows with indexed queries on block, flat type and date. | NFR-SCALE-01, NFR-PERF-01. |
| C-3 | Every externally sourced output carries its provider and retrieval or update date as a structured field, not as interface text added afterwards. | NFR-DATA-01, NFR-TRANS-01. |
| C-4 | External providers are called within their published rate limits, and a provider failure degrades only the features that depend on it. | FR-RES-02, NFR-REL-03. |

---

# 7. Out of scope

The following are outside this project deliberately. Each is listed because it is a reasonable
thing to expect from a housing application, and its absence should be a documented decision
rather than an apparent gap.

**Not a property marketplace.**

- No live listings. Every result is a block-and-flat profile assembled from historical
  transactions, and is labelled as such (FR-SRCH-04). FamPlan does not show flats currently for
  sale, and carries no seller or agent inventory.
- No transacting. No offers, bookings, appointments, payments or document submission.
- No contact with sellers or agents, and no agent directory.

**Not an official or financial authority.**

- No official HFE assessment. The pre-check is indicative guidance and links out to HDB's own
  process (FR-HFE-01, FR-HFE-09).
- No exact grant or loan amounts, no bank underwriting, no ethnic integration or SPR quota
  availability, and no discretionary or appeal cases (FR-HFE-08).
- No property valuation and no future-price prediction. Market outputs are historical evidence
  only (FR-MKT-07, assumption A-7).
- No financial advice, mortgage brokerage or product comparison.

**Outside the housing segment covered.**

- BTO, Sale of Balance Flats and other non-resale HDB channels.
- Private residential property, executive condominiums and the rental market.

**Outside the data the project uses.**

- Unit-level condition, renovation state, interior photographs or floor plans, none of which are
  published in the source datasets.
- User-contributed reviews, ratings or discussion.
- Notification delivery. Alerts and stale-data warnings appear in the application; no email,
  push or messaging channel is wired up.
- Native mobile applications. The interface is a responsive web application (NFR-COMP-01).

---

# 8. Requirement Conventions

- **Shall** states a required system capability.
- **Must** states a mandatory constraint.
- **Must** means essential for the agreed minimum viable product; **Should** means important but negotiable if schedule or data feasibility requires a documented scope decision.
- Each identifier refers to one independently traceable requirement. Verification describes the minimum evidence needed for acceptance.
- External-service response time is excluded from a local performance target only where the requirement explicitly says so; the system must still show a controlled loading, timeout, or unavailable state.

# 9. Functional Requirements

## 9.1 Account Management

| ID        | Priority | Actor              | Atomic requirement                                                                                                        | Input                                                         | Required output                                                                                                | Verification                                                                                     |
| --------- | -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| FR-ACC-01 | Must     | Visitor            | The system shall create a user account after receiving valid registration details and consent to the stated data use.     | Name or display name, unique email address, password, consent | Account confirmation or field-specific rejection                                                               | Register with valid, duplicate-email, malformed-email, weak-password, and missing-consent cases. |
| FR-ACC-02 | Must     | Registered user    | The system shall authenticate a registered user with valid credentials.                                                   | Email address and password                                    | Authenticated session or generic authentication failure                                                        | Test valid, incorrect-password, unknown-account, and locked-account cases.                       |
| FR-ACC-03 | Must     | Authenticated user | The system shall end the current authenticated session when the user logs out.                                            | Logout action                                                 | Invalidated session and return to a public page                                                                | Confirm protected pages and APIs reject the old session after logout.                            |
| FR-ACC-04 | Should   | Registered user    | The system shall support password reset through a time-limited, single-use link sent to the registered email address.     | Registered email address and new password                     | Reset message without revealing whether the account exists; successful password change when the token is valid | Test known and unknown emails, expired token, reused token, and successful reset.                |
| FR-ACC-05 | Must     | Authenticated user | The system shall allow the user to update stored non-sensitive account details.                                           | Editable account fields                                       | Updated account record and confirmation or validation errors                                                   | Edit each allowed field and confirm disallowed or invalid changes are rejected.                  |
| FR-ACC-06 | Must     | Authenticated user | The system shall delete the user's account, saved preferences, shortlists, and private notes after explicit confirmation. | Delete request and confirmation                               | Deletion acknowledgement and loss of account access                                                            | Create linked records, confirm deletion, and verify they are no longer retrievable.              |

## 9.2 Housing Preferences

| ID | Priority | Actor | Atomic requirement | Input | Required output | Verification |
|---|---|---|---|---|---|---|
| FR-PREF-01 | Must | Authenticated user | The system shall store a minimum and maximum indicative purchase budget as part of the user's housing preferences. | Minimum and maximum SGD amount | Saved budget or field-specific validation error | Test valid bounds, negative values, non-numeric values, and minimum greater than maximum. |
| FR-PREF-02 | Must | Authenticated user | The system shall store preferred towns, flat types, minimum floor area, and minimum remaining lease. | Selected towns and flat types; numeric thresholds | Saved housing criteria or validation errors | Save, reload, edit, and clear each criterion. |
| FR-PREF-03 | Must | Authenticated user | The system shall store up to three priority destinations for commute comparison. | Selected or searched destinations | Saved destinations with resolved locations | Test zero through three destinations, a fourth destination, duplicates, and unresolved locations. |
| FR-PREF-04 | Must | Authenticated user | The system shall store the user's amenity categories and barrier-free access preference. | Amenity selections and accessibility choice | Saved location preferences | Save and retrieve every supported selection and an empty selection. |
| FR-PREF-05 | Must | Authenticated user | The system shall store an integer importance weight from 0 to 5 for affordability, remaining lease, commute, public transport, schools, amenities, and accessibility. | Seven criterion weights | Saved weights or field-specific validation errors | Test every boundary, non-integer values, omitted values, and the all-zero case. |
| FR-PREF-06 | Must | Authenticated user | The system shall retrieve and update the user's saved preferences. | View or edit action | Current stored values and confirmed updates | Compare displayed values with persistence before and after an update. |

## 9.3 Search and Discovery

| ID | Priority | Actor | Atomic requirement | Input | Required output | Verification |
|---|---|---|---|---|---|---|
| FR-SRCH-01 | Must | User | The system shall search HDB resale profiles by town, street name, or block. | Search text | Matching block-and-flat profiles or a no-results state | Test exact, partial, case-insensitive, ambiguous, unknown, and empty queries. |
| FR-SRCH-02 | Must | User | The system shall filter search results by price range, flat type, town, floor-area range, and remaining-lease threshold. | One or more filter values | Profiles satisfying every active filter | Use a controlled dataset to verify single and combined filters and cleared filters. |
| FR-SRCH-03 | Must | Authenticated user | The system shall allow saved housing preferences to be applied to the current search. | Apply-preferences action | Search criteria populated from the saved preference set | Compare applied filters with the current saved values. |
| FR-SRCH-04 | Must | User | The system shall identify every search result as a block-and-flat profile rather than a live property listing. | Search results | Block, street, town, flat type, and explicit profile label | Inspect all result-card variants and their accessible labels. |
| FR-SRCH-05 | Must | User | The system shall sort results by suitability score, historical median price, remaining lease, or estimated commute time where the chosen value is available. | Sort criterion and direction | Results in the selected order with unavailable values placed consistently | Test ascending and descending order, ties, and missing values for each criterion. |
| FR-SRCH-06 | Must | User | The system shall reject invalid or contradictory search criteria before executing a search. | Search and filter values | Field-specific explanation and no invalid request execution | Test malformed values and each contradictory-boundary combination. |

## 9.4 Property and Historical Market Information

| ID | Priority | Actor | Atomic requirement | Input | Required output | Verification |
|---|---|---|---|---|---|---|
| FR-MKT-01 | Must | User | The system shall display the available block and flat-profile attributes for a selected result. | Selected profile | Address, town, flat type, available floor-area information, lease commencement year, and estimated remaining lease with source date | Compare displayed attributes with controlled source records. |
| FR-MKT-02 | Must | User | The system shall retrieve historical resale transactions comparable by the selected block and flat type. | Selected profile and period | Matching transaction set or explicit no-data state | Test exact matching and verify records from other blocks or flat types are excluded. |
| FR-MKT-03 | Must | User | The system shall calculate the transaction count, median price, minimum price, and maximum price for the selected comparable set. | Comparable transaction set | Four labelled aggregate values | Compare results with independently calculated fixtures, including odd, even, one-record, and empty sets. |
| FR-MKT-04 | Must | User | The system shall allow the historical analysis period to be changed among the latest 12, 36, and 60 months covered by the dataset. | Period selection | Recalculated records and aggregates for the selected period | Use dated boundary records to verify inclusion and exclusion for all periods. |
| FR-MKT-05 | Must | User | The system shall present the comparable transaction history as a time series that exposes price direction and transaction volume. | Comparable records | Accessible trend visualisation with time, price summary, and volume values | Compare plotted/table values with fixtures and verify a non-visual text or table equivalent. |
| FR-MKT-06 | Must | User | The system shall display the source, transaction coverage period, and last data-update date beside the historical analysis. | Dataset metadata | Visible attribution and dates | Inspect populated, stale, and unavailable metadata states. |
| FR-MKT-07 | Must | User | The system shall label every historical price range, trend, and aggregate as indicative market evidence rather than an official valuation or future-price prediction. | Market output | Visible limitation notice | Inspect every page and export where market outputs appear. |
| FR-MKT-08 | Must | User | The system shall distinguish no matching transactions, insufficient data, and source unavailability instead of presenting a misleading zero value. | Empty, small, or failed dataset result | Correct explanatory state | Inject each condition and verify the corresponding message and suppressed aggregates. |

## 9.5 Location, Travel, Amenities, and Accessibility

| ID | Priority | Actor | Atomic requirement | Input | Required output | Verification |
|---|---|---|---|---|---|---|
| FR-LOC-01 | Must | User | The system shall display the selected block on an interactive map. | Selected profile coordinates | Map centred on a labelled block marker | Test correct coordinates, keyboard access, and missing-coordinate behaviour. |
| FR-LOC-02 | Must | User | The system shall retrieve nearby MRT stations, bus stops, schools, and supported daily-amenity categories for a selected block. | Block coordinates and active categories | Categorised nearby-place results or category-specific unavailable states | Compare returned places with controlled API fixtures for every category. |
| FR-LOC-03 | Must | User | The system shall allow nearby-place results to be limited to a 500 m, 1 km, or 2 km radius. | Radius selection | Results within the selected radius | Test places just inside, exactly on, and just outside each boundary. |
| FR-LOC-04 | Must | User | The system shall display the calculated distance from the selected block to each nearby place. | Block and place coordinates | Distance with unit and calculation basis | Compare displayed values with known coordinate fixtures and rounding rules. |
| FR-LOC-05 | Must | User | The system shall request a route and estimated travel time from the selected block to each chosen priority destination for the supported travel modes. | Origin, destination, and travel mode | Route, distance, duration, retrieval time, or an unavailable state | Test successful route, unsupported mode, invalid destination, timeout, and no-route responses. |
| FR-LOC-06 | Must | User | When barrier-free routing is requested, the system shall show a barrier-free route where the authorised provider supplies one, or state that coverage is unavailable. | Origin, destination, barrier-free option | Supported route with accessibility label or explicit coverage limitation | Test supported, unsupported, and partially covered route fixtures. |
| FR-LOC-07 | Must | User | The system shall display the provider and retrieval time for route and nearby-place information. | External response metadata | Visible provider attribution and retrieval time | Inspect fresh, cached, and unavailable results. |

## 9.6 Decision Support and Shortlisting

| ID | Priority | Actor | Atomic requirement | Input | Required output | Verification |
|---|---|---|---|---|---|---|
| FR-DEC-01 | Must | User | The system shall calculate a suitability score for each profile from the selected criterion weights and the disclosed normalisation rules. | Profile evidence and criterion weights | Total score on the documented scale | Compare results with hand-calculated boundary and representative fixtures. |
| FR-DEC-02 | Must | User | The system shall display each criterion's normalised value, user weight, and contribution so that the contributions reconcile with the total score subject only to documented rounding. | Score calculation | Itemised score explanation and total | Sum displayed contributions across boundary, typical, and rounded cases. |
| FR-DEC-03 | Must | User | The system shall identify every criterion lacking sufficient data and disclose how its weight was treated in the score. | Profile with missing criterion data | Missing-data label and adjusted-weight explanation | Remove each criterion in turn and verify the total and explanation follow the documented rule. |
| FR-DEC-04 | Must | User | The system shall compare between two and four selected profiles in a common view. | Two to four profile selections | Side-by-side attributes, market evidence, location measures, and score breakdowns | Test 0–5 selections, removal, duplicate selection, and missing values. |
| FR-DEC-05 | Must | Authenticated user | The system shall add a selected profile to the user's shortlist without creating a duplicate entry. | Add-to-shortlist action | Persisted shortlist entry or already-saved state | Add a new profile, add it twice, sign out, and confirm persistence after sign-in. |
| FR-DEC-06 | Must | Authenticated user | The system shall remove a selected profile from the user's shortlist. | Remove action | Updated shortlist and confirmation | Remove an existing and a non-existing entry and verify persistent state. |
| FR-DEC-07 | Should | Authenticated user | The system shall allow a private text note to be created, edited, and cleared for each shortlisted profile. | Shortlist profile and note text | Persisted note or validation error | Test create, update, clear, length boundary, unsafe markup, and access from another account. |

## 9.7 Indicative HFE Pre-check

| ID | Priority | Actor | Atomic requirement | Input | Required output | Verification |
|---|---|---|---|---|---|---|
| FR-HFE-01 | Must | User | The system shall start the indicative HFE pre-check only after the user acknowledges that it is general guidance and not an official HFE assessment. | Acknowledgement action | Started pre-check or continued explanatory screen | Test acknowledged and unacknowledged paths. |
| FR-HFE-02 | Must | User | The system shall collect, for the active pre-check session only, the citizenship, age, applicant relationship, assessed household income, relevant property ownership or disposal history, previous HDB loan or grant history, and target flat's remaining lease needed by the approved ruleset. | Guided questionnaire responses | Validated session state or field-specific errors | Test every field, conditional branch, omitted required answer, invalid range, and session-storage boundary. |
| FR-HFE-03 | Must | User | The system shall classify general HDB resale-purchase eligibility as potentially eligible, potentially ineligible, or requiring official assessment under the versioned ruleset. | Valid session answers | Classification with reasons and limitations | Run team-approved eligible, ineligible, boundary, and uncertain decision-table cases. |
| FR-HFE-04 | Must | User | The system shall identify which supported common CPF housing-grant categories may warrant further official checking. | Valid session answers | Potentially applicable categories, reasons, exclusions, and official link | Run a decision table covering every supported category and exclusion boundary. |
| FR-HFE-05 | Must | User | The system shall classify general HDB concessionary-loan readiness as potentially eligible, potentially ineligible, or requiring official assessment. | Valid session answers | Classification with reasons and limitations | Run team-approved income, ownership, loan-history, and uncertain cases. |
| FR-HFE-06 | Must | User | The system shall explain any identified remaining-lease implication for the intended purchase under the versioned ruleset. | Applicant age and target remaining lease | Applicable implication, reason, and official source | Test values below, on, and above every approved boundary. |
| FR-HFE-07 | Must | User | The system shall show the reason, official source, and ruleset effective date for each pre-check result. | Pre-check result | Traceable explanation and dated source link | Inspect every outcome branch and simulate unavailable rule metadata. |
| FR-HFE-08 | Must | User | The system shall state that the pre-check excludes exact grant or loan amounts, ethnic and SPR quota availability, bank underwriting, discretionary cases, and official approval. | Pre-check screen and result | Visible exclusion notice | Inspect the entry, questionnaire, and result views at supported screen sizes. |
| FR-HFE-09 | Must | User | The system shall provide a direct link to HDB's official HFE information or application path from the pre-check result. | Completed or stopped pre-check | Clearly labelled official-HDB link | Verify the configured target, label, and safe external-link behaviour. |
| FR-HFE-10 | Must | User | The system shall discard all pre-check answers when the user completes or cancels the check, or after 30 minutes of inactivity. | Completion, cancellation, or inactivity timeout | Cleared session answers | Inspect storage and logs after each event and at 29- and 30-minute boundaries. |

## 9.8 Data Administration and Service Resilience

| ID | Priority | Actor | Atomic requirement | Input | Required output | Verification |
|---|---|---|---|---|---|---|
| FR-ADM-01 | Must | Data administrator | The system shall require an authenticated administrator role before displaying or executing administration functions. | Authenticated session and requested function | Authorised page or access denial | Test anonymous, ordinary-user, expired-admin, and active-admin sessions at UI and API levels. |
| FR-ADM-02 | Must | Data administrator | The system shall display each configured source's latest successful synchronisation time, latest attempted synchronisation time, record count, and current status. | Administration-page request | Source-status summary | Compare the view with controlled successful, failed, never-run, and partial states. |
| FR-ADM-03 | Must | Data administrator | The system shall allow a manual refresh to be requested for one configured source at a time. | Source selection and refresh action | Accepted job identifier or reason for rejection | Test valid source, unknown source, concurrent request, unauthorised request, success, and failure. |
| FR-ADM-04 | Must | System clock | The system shall check each configured source for an available update at least once every 24 hours. | Scheduled trigger | Recorded update check and refresh decision | Advance a test clock across the boundary and inspect schedule records. |
| FR-ADM-05 | Must | Data administrator | The system shall display synchronisation history containing source, start time, end time, outcome, records added or changed, and sanitised error summary. | Source and optional date filter | Matching history in reverse chronological order | Generate successes and failures and verify fields, ordering, filtering, and absence of secrets. |
| FR-RES-01 | Must | System | The system shall preserve the last validated local dataset when a refresh fails validation or cannot complete. | Failed refresh | Previous active version remains queryable and failure is recorded | Query before and after injected download, schema, and validation failures. |
| FR-RES-02 | Must | System | The system shall isolate an external route or nearby-place service failure so that account, saved shortlist, and locally cached housing-data functions remain usable. | Simulated dependency failure | Controlled unavailable state for affected feature; unrelated functions remain operational | Disable each dependency and execute all named unaffected workflows. |
| FR-RES-03 | Must | User | The system shall show the age of cached external information and a stale-data warning when the configured freshness threshold is exceeded. | Cached result metadata | Data age and, where applicable, stale warning | Test values immediately below, on, and above the configured threshold. |

# 10. Non-functional Requirements

| ID | Category | Priority | Measurable requirement | Verification |
|---|---|---|---|---|
| NFR-PERF-01 | Performance | Must | The 95th-percentile server response time for search and filter requests must not exceed 2 seconds during a 15-minute test with 100 concurrent simulated users against a database containing at least 1,000,000 historical transaction records, excluding external API calls. | Load-test report containing dataset size, concurrency, request count, errors, and percentile timings. |
| NFR-PERF-02 | Performance | Must | The 95th-percentile response time for locally calculated scoring and comparison requests must not exceed 3 seconds under the NFR-PERF-01 workload. | Load-test report for representative two-, three-, and four-profile comparisons. |
| NFR-PERF-03 | Performance | Should | The 95th-percentile end-to-end response time for a live route request must not exceed 5 seconds while the provider is within its documented normal operating conditions. | Timed integration tests with provider responses distinguished from local processing and controlled timeout tests. |
| NFR-SCALE-01 | Scalability | Must | The deployed application must store, index, and query at least 1,000,000 historical transaction records without violating NFR-PERF-01 or NFR-PERF-02. | Seed the required volume, record index configuration, and execute the performance tests. |
| NFR-SCALE-02 | Scalability | Must | The deployed application must support at least 100 concurrent active users performing the representative search, profile, score, compare, shortlist, and cached-map workload without violating the applicable performance targets. | Mixed-workload load test with response and error statistics by operation. |
| NFR-USAB-01 | Usability | Should | At least 80% of first-time representative users in a moderated test of at least 10 participants must complete search, select two profiles, and open their comparison within 3 minutes without facilitator assistance. | Signed usability protocol, anonymised observations, task times, completion rate, and issues. |
| NFR-USAB-02 | Usability | Must | Every rejected user input must identify the affected field or action and state how the user can correct it; a generic error code alone is insufficient. | UI and API acceptance tests covering every documented validation error. |
| NFR-ACC-01 | Accessibility | Must | The search, profile, comparison, shortlist, authentication, and indicative HFE workflows must conform to WCAG 2.1 Level AA. | Automated accessibility scan plus documented manual checks for labels, headings, contrast, errors, zoom, and screen-reader output. |
| NFR-ACC-02 | Accessibility | Must | Every interactive function in the core workflows must be operable using only a keyboard and must expose a visible focus indicator. | Manual keyboard traversal using a documented checklist with no pointer input. |
| NFR-COMP-01 | Compatibility | Must | Core pages must remain usable from 360 px to 1440 px viewport widths without horizontal scrolling of the primary page content. | Screenshot or browser test evidence at agreed boundary and intermediate widths. |
| NFR-COMP-02 | Compatibility | Should | Core workflows must operate on the latest two stable versions available at test time of Chrome, Safari, Firefox, and Edge. | Compatibility matrix recording browser versions and pass or fail results. |
| NFR-REL-01 | Reliability | Must | At least 99% of core requests must complete successfully during a continuous one-hour representative-load test, excluding requests whose sole failure is an injected or confirmed external-provider outage. | One-hour test report with request totals, failure classification, and evidence for exclusions. |
| NFR-REL-02 | Recoverability | Must | Following an application restart, locally stored search, profile, account, preference, shortlist, and administration functions must become operational within 5 minutes without manual reconstruction of persistent data. | Timed restart-and-recovery exercise followed by data-integrity and smoke tests. |
| NFR-REL-03 | Fault isolation | Must | Failure of one external dependency must not prevent use of unrelated functions backed by validated local data. | Dependency-failure matrix showing affected and unaffected workflows. |
| NFR-DATA-01 | Data quality | Must | Every market, property, school, amenity, route, and eligibility output must display or link to its source and the applicable update, retrieval, or ruleset date. | Automated presence checks plus manual inspection of every output type and error state. |
| NFR-DATA-02 | Data freshness | Must | Locally cached housing data older than 31 complete days must be visibly marked as stale until a newer validated dataset becomes active. | Set test data ages to 30, 31, and 32 complete days and verify boundary behaviour. |
| NFR-DATA-03 | Reproducibility | Must | Identical profile inputs, user weights, ruleset version, and dataset version must produce identical aggregates, eligibility classifications, and suitability scores. | Repeat deterministic fixture tests across process restarts. |
| NFR-SEC-01 | Transport security | Must | Every production client-server connection must use HTTPS with TLS 1.2 or newer, and plain HTTP must redirect to HTTPS without accepting credentials. | Protocol scan, redirect test, and attempted authentication over plain HTTP. |
| NFR-SEC-02 | Credential security | Must | Passwords must be stored only as salted hashes using a current approved password-hashing algorithm and must never appear in application logs. | Inspect schema and configuration; scan logs after registration, login, failure, and reset tests. |
| NFR-SEC-03 | Authorisation | Must | A non-administrator must be unable to read or invoke administration functions even when directly calling their endpoints. | Role-based access-control tests at both UI and API levels. |
| NFR-SEC-04 | Authentication security | Must | An account must be locked from password authentication for 15 minutes after five consecutive failed login attempts; a successful login before the threshold must reset the counter. | Test attempts 1–6, successful reset, and 14-, 15-, and 16-minute boundaries. |
| NFR-SEC-05 | Input security | Must | All user-controlled input must be allow-list or structurally validated before it is used in a database query, calculation, stored note, or external-service request. | Security tests for injection, unsafe markup, malformed coordinates, invalid ranges, and unexpected types. |
| NFR-PRIV-01 | Privacy | Must | Answers to the indicative HFE pre-check must not be written to the application database, analytics events, error reports, or application logs. | Instrument storage and logging during every questionnaire branch and scan for submitted unique marker values. |
| NFR-PRIV-02 | Privacy | Must | Account details, saved preferences, shortlists, and notes must become irretrievable through the application within 24 hours after confirmed account deletion. | Delete a seeded account and test UI, API, and direct authorised data-store lookup at the deadline. |
| NFR-PRIV-03 | Data minimisation | Must | Registration and preferences must not require personal information that is unnecessary for authentication, saved housing preferences, shortlisting, or declared course analytics. | Compare required fields with the approved data dictionary and attempt submission without optional fields. |
| NFR-MAINT-01 | Maintainability | Must | Data-source endpoints and freshness thresholds, score criteria and normalisation constants, and indicative-HFE rules and source dates must be maintained as versioned configuration or isolated modules so that one category can be updated without changing unrelated workflow code. | Code review plus tests that replace one configuration category and show unaffected workflow tests still pass. |
| NFR-MAINT-02 | Testability | Should | Automated tests must achieve at least 80% branch coverage for scoring, eligibility rules, transaction aggregation, and external-data transformation modules. | Coverage report generated by the project's documented test command. |
| NFR-TRANS-01 | Transparency | Must | Every suitability score must expose the criterion values, weights, contributions, data versions, and missing-data treatment needed to reproduce it subject to documented rounding. | Recalculate representative outputs independently from the displayed explanation. |
| NFR-TRANS-02 | Responsible guidance | Must | The user interface must visually and textually distinguish application-generated guidance from an official HDB eligibility decision, HFE letter, valuation, or financial recommendation. | Content review of every entry point, result, comparison, saved view, and printable or shareable output. |
