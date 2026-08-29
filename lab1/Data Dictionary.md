# FamPlan Data Dictionary

## 1. Accounts and identity

### User Account
**Definition.** A registered person's identity in the system, created by FR-ACC-01,
authenticated by FR-ACC-02, edited by FR-ACC-05, deleted by FR-ACC-06.
**Attributes.**
- `id` (integer, primary key): 4821
- `display_name` (text, editable per FR-ACC-05): "J. Tan"
- `email` (text, unique): "j.tan@example.com"
- `consent_given_at` (timestamp): 2026-08-29T10:15:00
- `created_at` (timestamp)
- `status` (enum: active, deleted): active
**Relationships.** A User Account *has one* Password Credential, *has zero or more* Sessions,
*has at most one* Saved Preference Profile, *has zero or more* Shortlist Entries, *may hold* an
Administrator Role.
**Note.** NFR-PRIV-03 (data minimisation) means this entity carries only what authentication and
the application's own features need. Which fields FR-ACC-05 allows editing is a team decision
this document does not presume; only `display_name` is marked editable above.

### Password Credential
**Definition.** The stored proof of a User Account's password, never the password itself.
**Attributes.**
- `account_id` (integer, foreign key)
- `hash` (text): a salted-hash output, never the plaintext
- `salt` (text)
- `algorithm` (text): "PBKDF2-HMAC-SHA256" or an equivalent current-approved algorithm
- `rounds` (integer): 120000
**Relationships.** *Belongs to* exactly one User Account.
**Note.** NFR-SEC-02 requires that this never appears in an application log. The `algorithm` and
`rounds` fields exist so the hashing cost can be migrated later without breaking existing
accounts.

### Session
**Definition.** A live authenticated login, from FR-ACC-02 (created) to FR-ACC-03 (ended by
logout) or expiry.
**Attributes.**
- `token` (text, opaque, primary key)
- `account_id` (integer, foreign key)
- `created_at` (timestamp)
- `expires_at` (timestamp)
- `invalidated_at` (timestamp, nullable)
**Relationships.** *Belongs to* one User Account.
**Note.** FR-ACC-03 requires that protected pages and APIs reject an old session immediately
after logout, so `invalidated_at` must be checked as well as `expires_at`. Checking only
`expires_at` leaves a logged-out token valid until it expires naturally.

### Login Attempt
**Definition.** One authentication try, recorded so NFR-SEC-04's lockout rule can be enforced.
**Attributes.**
- `email` (text): keyed on the submitted email rather than the account id, since an unknown
  email must fail identically to a wrong password
- `ts` (timestamp)
- `success` (boolean)
**Relationships.** *References* an email address, not necessarily an existing User Account.
**Note.** NFR-SEC-04 specifies that five consecutive failures lock the account for 15 minutes,
and that a success before the fifth failure resets the counter. The entity must support both
"count recent failures" and "clear on success" queries.

### Password Reset Token
**Definition.** A single-use, time-limited credential for FR-ACC-04's password reset flow.
**Attributes.**
- `token` (text, opaque, primary key)
- `account_id` (integer, foreign key)
- `expires_at` (timestamp)
- `used_at` (timestamp, nullable)
**Relationships.** *Belongs to* one User Account.
**Note.** FR-ACC-04 requires a reset message that does not reveal whether the account exists. The
token is issued and emailed the same way whether or not the address is registered, so this
entity's existence must not leak through response timing or content.

### Administrator Role
**Definition.** The elevated privilege FR-ADM-01 gates every administration function behind.
**Attributes.**
- `account_id` (integer, foreign key, unique)
- `granted_at` (timestamp)
**Relationships.** *Held by* at most one row per User Account.
**Note.** NFR-SEC-03 requires this be enforced at the API level rather than hidden in the user
interface. A non-admin calling an admin endpoint directly must still be refused.

### Account Deletion Request
**Definition.** The record of FR-ACC-06's confirmed delete action, which NFR-PRIV-02 turns into
a 24-hour irretrievability guarantee.
**Attributes.**
- `account_id` (integer)
- `requested_at` (timestamp)
- `purged_at` (timestamp, nullable): when the account, preferences, shortlist, and notes became
  unreachable through every path (user interface, API, and direct authorised data-store lookup)
**Relationships.** *References* one former User Account.
**Note.** NFR-PRIV-02 asks for data to be irretrievable through the application, which is a lower
bar than physical erasure. A soft-delete followed by a hard purge job satisfies it, provided the
purge completes inside the 24-hour window. `purged_at` is tracked separately from `requested_at`
so that window can be verified.

---

## 2. Housing preferences

### Budget Range
**Definition.** FR-PREF-01's minimum and maximum indicative purchase budget.
**Attributes.**
- `min_budget_sgd` (integer): 400000
- `max_budget_sgd` (integer): 600000
**Relationships.** *Part of* one Saved Preference Profile.
**Note.** FR-PREF-01's verification list includes "minimum greater than maximum" as a rejected
case, so this pair is validated together rather than as two independent fields.

### Preferred Town/Flat-Type Set
**Definition.** FR-PREF-02's stored towns, flat types, minimum floor area, and minimum remaining
lease.
**Attributes.**
- `towns` (list of text): ["BUKIT MERAH", "TAMPINES"]
- `flat_types` (list of text): ["4 ROOM", "5 ROOM"]
- `min_floor_area_sqm` (number): 90.0
- `min_remaining_lease_years` (integer): 60
**Relationships.** *Part of* one Saved Preference Profile; *narrows* Search Query results
(FR-SRCH-02).

### Priority Destination
**Definition.** One of up to three commute-comparison destinations from FR-PREF-03, such as a
workplace or a relative's home.
**Attributes.**
- `slot` (integer, 1 to 3)
- `label` (text): "Work"
- `query_text` (text): "Raffles Place MRT"
- `resolved_lat`, `resolved_lon` (number, nullable until geocoded)
- `resolved_place_id` (text, nullable): the geocoding provider's own identifier
**Relationships.** *Part of* one Saved Preference Profile; *resolved via* the geocoding step
described under Geolocation (§4); *used as* the destination in a Route Estimate (§4).
**Note.** FR-PREF-03's verification covers an unresolved destination, so null values in
`resolved_lat` and `resolved_lon` are a valid expected state rather than an error.

### Amenity Preference Set
**Definition.** FR-PREF-04's selected daily-amenity categories and barrier-free access choice.
**Attributes.**
- `amenity_categories` (list of enum): ["hawker_centre", "supermarket", "clinic"]
- `barrier_free_access` (boolean)
**Relationships.** *Part of* one Saved Preference Profile; the categories *match* the Nearby
Place categories in §4.

### Criterion Weight
**Definition.** FR-PREF-05's seven user-set importance weights driving the suitability score.
**Attributes.** Seven integer fields, each 0 to 5: `affordability`, `remaining_lease`, `commute`,
`public_transport`, `schools`, `amenities`, `accessibility`.
**Relationships.** *Part of* one Saved Preference Profile; *consumed by* Suitability Score (§5).
**Note.** FR-PREF-05's verification includes the all-zero case. Every weight at 0 is valid input
rather than a rejected state, and the scoring logic in §5 must produce a defined result for it.

### Saved Preference Profile
**Definition.** The container FR-PREF-06 retrieves and updates: one per account, gathering the
five terms above.
**Attributes.** `account_id` (foreign key, unique), plus one Budget Range, one Preferred
Town/Flat-Type Set, up to three Priority Destinations, one Amenity Preference Set, one Criterion
Weight set.
**Relationships.** *Belongs to* one User Account. *Applied to* a Search Query (FR-SRCH-03).

---

## 3. The housing stock and market

### Search Query
**Definition.** One search request: free text plus filters, the input FR-SRCH-01 through
FR-SRCH-06 operate on. Request-scoped, not a stored entity.
**Attributes.** `search_text` (text, nullable); `price_min`/`price_max` (integer, nullable);
`flat_type` (text, nullable); `town` (text, nullable); `floor_area_min`/`floor_area_max` (number,
nullable); `remaining_lease_min_years` (integer, nullable); `sort_by` (enum: suitability_score,
median_price, remaining_lease, commute_time); `sort_direction` (enum: asc, desc).
**Relationships.** *Filters* Block-and-Flat Profile; *pre-filled from* a Saved Preference Profile
(FR-SRCH-03); *orders results by* Suitability Score, Market Aggregate's median price, Remaining
Lease Estimate, or a Route Estimate's duration (FR-SRCH-05).
**Note.** FR-SRCH-06 requires invalid or contradictory criteria to be rejected before the query
runs, for example `price_min > price_max`. The rejection carries a field-specific explanation,
which is the validation-error shape NFR-USAB-02 requires throughout the system: name the field
and state how to correct it. FR-SRCH-05's requirement that unavailable values be placed
consistently also means the sort order must define where a profile with no commute-time data
lands, rather than leaving it undefined.

### Block-and-Flat Profile
**Definition.** One combination of block, street, and flat type that the application can show a
valuation and comparison for. It is built from historical data and is not a live listing
(FR-SRCH-04).
**Attributes.**
- `join_key` (text): normalised block plus street, for example "102|HENDERSON CRES"
- `town` (text): "BUKIT MERAH"
- `flat_type` (text): "4 ROOM"
- `floor_area_info` (text or range): "80 sqm", or a range where units differ
- `lease_commence_year` (integer): 1970
- `remaining_lease_estimate` (text): "43 years 01 months"
- `source_date` (date): the date the estimate was computed from
**Relationships.** *Located in* one Town; *has many* Resale Transactions; *has one* Remaining
Lease Estimate.
**Note.** FR-SRCH-04 requires every result to carry an explicit label identifying it as a profile
rather than a listing. This term is named "Profile" rather than "Listing" or "Unit" so the
distinction stays visible in code as well as in the interface.

### Block
**Definition.** A physical HDB block, and the join point between the resale-transaction data and
the property-information data.
**Attributes.** `blk_no` (text): "102"; `street` (text): "HENDERSON CRES"; `town_code` (text): a
source-specific code, see Note.
**Relationships.** *Has many* Block-and-Flat Profiles, one per flat type present.
**Note.** The two data.gov.sg datasets behind this entity (Assumption A-1) do **not** share a
town key. The resale dataset names towns in full ("BUKIT MERAH") while the property-information
dataset uses a three-letter code ("BM"). The only reliable join is normalised block number plus
normalised street name. The unmatched rate must be measured during implementation and reported
through the administration view (FR-ADM-02), since a silent drop in match rate degrades every
market figure that depends on it.

### Town
**Definition.** The HDB town a Block sits in.
**Attributes.** `name` (text): "BUKIT MERAH".
**Relationships.** *Has many* Blocks; *filters* Search Query (FR-SRCH-01, FR-SRCH-02).

### Flat Type
**Definition.** The size class of a flat: 3 ROOM, 4 ROOM, 5 ROOM, EXECUTIVE, and so on.
**Attributes.** `name` (text).
**Relationships.** *Applies to* many Block-and-Flat Profiles; *filters* Search Query and
Preferred Town/Flat-Type Set.

### Remaining Lease Estimate
**Definition.** FR-MKT-01's estimated remaining lease for a Block-and-Flat Profile, always shown
with the date it was computed from.
**Attributes.** `years_months` (text): "43 years 01 months"; `source_date` (date).
**Relationships.** *Belongs to* one Block-and-Flat Profile; *feeds* the
`min_remaining_lease_years` filter in Preferred Town/Flat-Type Set and the remaining-lease
scoring criterion in §5.
**Note.** Lease commencement in the source dataset is a year with no month, so any derived
remaining-lease figure is accurate only to within twelve months. NFR-DATA-01 requires this to be
stated on screen, not only in this document.

### Resale Transaction
**Definition.** One historical HDB resale sale, and the evidence behind every market figure the
application shows.
**Attributes.**
- `month` (text, YYYY-MM): "2026-07"
- `join_key` (text)
- `flat_type` (text)
- `storey_range` (text): "04 TO 06"
- `floor_area_sqm` (number)
- `resale_price` (integer, SGD)
- `price_psm` (number, derived): `resale_price / floor_area_sqm`
**Relationships.** *Belongs to* one Block-and-Flat Profile; *aggregated into* Market Aggregate.

### Comparable Transaction Set
**Definition.** The subset of Resale Transactions FR-MKT-02 retrieves for a given profile and
Analysis Period.
**Attributes.** A filtered list of Resale Transactions, plus the `join_key`, `flat_type`, and
Analysis Period used to select them.
**Relationships.** *Drawn from* Resale Transaction; *summarised by* Market Aggregate.
**Note.** FR-MKT-02's verification requires confirming that records from other blocks or flat
types are excluded, so the filter is an exact match on block and flat type rather than a nearby
or fuzzy match.

### Market Aggregate
**Definition.** FR-MKT-03's four computed figures for a Comparable Transaction Set, shown
alongside a time series that exposes price direction and volume (FR-MKT-05).
**Attributes.** `count` (integer), `median_price` (integer), `min_price` (integer), `max_price`
(integer), all in SGD and all computed over one Comparable Transaction Set; `trend_points` (list
of `{month, median_price, transaction_count}`), the time-series data behind FR-MKT-05's
visualisation and its required non-visual equivalent; and a Data Provenance Stamp carrying the
source, coverage period, and last-update date FR-MKT-06 requires beside it.
**Relationships.** *Computed from* one Comparable Transaction Set; *carries* one Data Provenance
Stamp (§4); *labelled by* Market Evidence Label.
**Note.** FR-MKT-03's verification names odd, even, one-record, and empty sets as cases to test.
An empty set must produce the Data Availability State below rather than a zero. `trend_points` is
structured data rather than a rendered chart, because FR-MKT-05 requires a non-visual equivalent,
which is only possible if the underlying values remain queryable.

### Analysis Period
**Definition.** FR-MKT-04's selectable window: the latest 12, 36, or 60 months the dataset
covers.
**Attributes.** `months` (enum: 12, 36, 60).
**Relationships.** *Selects* which Resale Transactions form a Comparable Transaction Set.

### Market Evidence Label
**Definition.** The framing FR-MKT-07 requires on every historical price, trend, or aggregate:
indicative market evidence, never an official valuation or prediction.
**Attributes.** A fixed disclosure string rather than user data. It appears here because
NFR-DATA-01 and NFR-TRANS-02 treat it as a required part of every market output's payload rather
than optional interface copy.
**Relationships.** *Attached to* every Market Aggregate and time-series output shown to a user.

### Data Availability State
**Definition.** FR-MKT-08's three-way distinction between no matching transactions, insufficient
data, and source unavailable, replacing a misleading zero.
**Attributes.** `state` (enum: no_match, insufficient_data, source_unavailable, ok).
**Relationships.** *Accompanies* Market Aggregate and Suitability Score whenever the underlying
data cannot support a real figure.
**Note.** FR-MKT-08 exists because a bare `0` or `null` where data is missing cannot be
distinguished from a low or zero value, and the requirement forbids that ambiguity.

---

## 4. Location, travel, and amenities

### Geolocation
**Definition.** A latitude and longitude pair, however obtained: geocoded from an address,
returned by a data source, or entered directly.
**Attributes.** `lat` (number), `lon` (number).
**Relationships.** *Attached to* a Block, a Nearby Place, or a Priority Destination.
**Note.** Per Assumptions A-2 and A-4, neither the HDB property dataset nor the school directory
dataset ships coordinates. Every Block and every school needs a separate geocoding step before it
can appear on a map or have a distance computed.

### Nearby Place
**Definition.** FR-LOC-02's retrieved MRT stations, bus stops, schools, and daily-amenity
category results near a Block.
**Attributes.** `category` (enum): "mrt_station", "bus_stop", "school", "hawker_centre", and so
on; `name` (text); `location` (Geolocation); `source_provider` (text).
**Relationships.** *Near* one Block, within a Proximity Radius; *categorised* to match Amenity
Preference Set's categories.

### Proximity Radius
**Definition.** FR-LOC-03's selectable search radius.
**Attributes.** `metres` (enum: 500, 1000, 2000).
**Relationships.** *Bounds* which Nearby Places are returned for a Block.

### Distance Measurement
**Definition.** FR-LOC-04's calculated straight-line or routed distance from a Block to a Nearby
Place.
**Attributes.** `metres` (number); `basis` (text): "straight-line" or a named routing method.
**Relationships.** *Between* one Block and one Nearby Place.
**Note.** FR-LOC-04 requires the calculation basis to be shown alongside the number, since a
straight-line distance and a walking-route distance can differ substantially. Its verification
compares displayed values against rounding rules, so both the basis and the rounding must be
documented.

### Route Estimate
**Definition.** FR-LOC-05's requested route and travel time from a Block to a Priority
Destination, for a given travel mode.
**Attributes.** `origin` (Geolocation), `destination` (Geolocation), `mode` (enum: walk, drive,
cycle, public_transport), `distance_m` (number, nullable), `duration_s` (number, nullable),
`retrieved_at` (timestamp), `state` (enum: ok, unsupported_mode, invalid_destination, timeout,
no_route).
**Relationships.** *From* one Block *to* one Priority Destination; carries a Data Provenance
Stamp.

### Barrier-Free Route Coverage Flag
**Definition.** FR-LOC-06's signal of whether a barrier-free route was returned or whether
coverage is unavailable for that origin and destination pair.
**Attributes.** `barrier_free_requested` (boolean); `covered` (boolean); `route` (Route Estimate,
nullable when not covered).
**Relationships.** *Extends* Route Estimate when barrier-free routing is requested.
**Note.** OneMap provides barrier-free access routing, introduced in March 2024 and covering
roughly 6,000 km of accessible paths, so FR-LOC-06 is implementable. Coverage is not island-wide
or indoor-complete, so `covered = false` is a common outcome the interface must report as
FR-LOC-06 specifies, rather than falling back silently to a route that is not accessible.

### Data Provenance Stamp
**Definition.** The provider name and retrieval time FR-LOC-07 and NFR-DATA-01 require on every
externally sourced output.
**Attributes.** `provider` (text): "OneMap", "data.gov.sg", "LTA DataMall"; `retrieved_at`
(timestamp).
**Relationships.** *Attached to* Route Estimate, Nearby Place, Remaining Lease Estimate, Market
Aggregate, and HFE Result.
**Note.** `retrieved_at` is also what NFR-PERF-03 needs in order to separate a live route
request's external-provider time from local processing time when measuring latency. The stamp is
defined once here rather than per feature.

---

## 5. Decision support and shortlisting

### Scoring Configuration
**Definition.** The system-wide normalisation constants and criterion definitions the suitability
score is computed with. This is distinct from Criterion Weight, which is each user's personal
0 to 5 importance setting. NFR-MAINT-01 requires these kept as versioned configuration, separate
from workflow code, so one can change without the other.
**Attributes.** `version` (text); `effective_date` (date); per-criterion normalisation method and
constants, for example `{criterion: "affordability", method: "budget_ratio", constants: {...}}`.
**Relationships.** *Referenced by* every Suitability Score alongside `ruleset_version`;
*independent of* Criterion Weight, which a Suitability Score also references.
**Note.** NFR-MAINT-01 names score criteria and normalisation constants as one configuration
category and treats user weights as a separate concern. Updating how commute is normalised
system-wide should not require touching any individual user's saved weight, which is why the two
are separate entities.

### Suitability Score
**Definition.** FR-DEC-01's single computed number for how well a Block-and-Flat Profile matches
a user's Criterion Weight set.
**Attributes.** `profile_id` (foreign key), `account_id` (foreign key), `ruleset_version` (text),
`total_score` (number), `computed_at` (timestamp).
**Relationships.** *Computed from* one Block-and-Flat Profile, one Criterion Weight set, and one
Scoring Configuration; *made of* several Criterion Score Breakdowns.
**Note.** NFR-DATA-03 requires reproducibility: identical profile, weights, ruleset version, and
dataset version must yield an identical score. Both `ruleset_version` and a dataset-version
reference must therefore be stored alongside the score, or the requirement cannot be tested.
NFR-PERF-02 places a 3-second budget on computing this locally, which constrains the computation
rather than the shape of the entity.

### Criterion Score Breakdown
**Definition.** FR-DEC-02's per-criterion detail: the normalised value, the user's weight, and
the resulting contribution to the total.
**Attributes.** `criterion` (enum, one of the seven in Criterion Weight); `normalised_value`
(number, typically 0 to 1); `weight` (integer, 0 to 5); `contribution` (number).
**Relationships.** *Part of* one Suitability Score.
**Note.** FR-DEC-02 requires the contributions to reconcile to the total subject only to
documented rounding. The rounding rule itself should be recorded in the assumptions table once
the team agrees one, since NFR-TRANS-01 makes it testable.

### Missing-Data Treatment
**Definition.** FR-DEC-03's disclosure of how a criterion with insufficient data was handled in
the score.
**Attributes.** `criterion` (enum); `reason` (text), for example "no route data available";
`weight_treatment` (text), for example "excluded and remaining weights renormalised".
**Relationships.** *Attached to* a Criterion Score Breakdown when that criterion's
`normalised_value` could not be computed.

### Profile Comparison Set
**Definition.** FR-DEC-04's transient selection of two to four profiles being compared side by
side.
**Attributes.** `profile_ids` (list, length 2 to 4).
**Relationships.** *References* two to four Block-and-Flat Profiles, each with its own Market
Aggregate, Nearby Place results, and Suitability Score.
**Note.** This is request-scoped and needs no database row of its own. It is listed because
FR-DEC-04's verification (0 to 5 selections, duplicates, missing values) implies validation logic
that has to live somewhere.

### Shortlist Entry
**Definition.** FR-DEC-05's saved and FR-DEC-06's removable profile on a user's shortlist.
**Attributes.** `account_id` (foreign key), `profile_id` (foreign key), `added_at` (timestamp).
**Relationships.** *Belongs to* one User Account; *references* one Block-and-Flat Profile; *has
at most one* Shortlist Note.
**Note.** FR-DEC-05 requires no duplicates, so the natural key is `(account_id, profile_id)`.

### Shortlist Note
**Definition.** FR-DEC-07's private text note on a shortlisted profile.
**Attributes.** `shortlist_entry_id` (foreign key), `text` (text, length-bounded), `updated_at`
(timestamp).
**Relationships.** *Belongs to* one Shortlist Entry.
**Note.** FR-DEC-07's verification includes access from another account, so a note must be
readable only by the owning account and never by `shortlist_entry_id` alone without an ownership
check.

---

## 6. Indicative HFE pre-check

**Every entity in this section exists only for the lifetime of one pre-check session.**
NFR-PRIV-01 states that answers must not be written to the application database, analytics
events, error reports, or application logs. None of the terms below has a persistent table. They
are described here so the in-memory or session-store shape is explicit.

### HFE Session Input
**Definition.** FR-HFE-02's questionnaire answers, held only for the active session.
**Attributes.** `citizenship` (enum), `age` (integer), `applicant_relationship` (enum),
`assessed_household_income` (number), `property_ownership_history` (structured, a list of past
and current ownership records), `disposal_history` (structured),
`previous_hdb_loan_or_grant_history` (structured), `target_remaining_lease_years` (number).
**Relationships.** *Feeds* HFE Result. *Discarded* per FR-HFE-10 on completion, cancellation, or
30 minutes of inactivity, whichever comes first.
**Note.** NOT PERSISTED. This must live in a request-scoped or session-store structure with no
write path to any table, log, or analytics pipeline. A single debug log line containing this
object breaches NFR-PRIV-01.

### HFE Ruleset Version
**Definition.** The versioned set of income, citizenship, ownership, grant, and lease-implication
rules that resale-purchase eligibility (FR-HFE-03), grant categories (FR-HFE-04),
concessionary-loan readiness (FR-HFE-05), and the remaining-lease implication (FR-HFE-06)
classify against.
**Attributes.** `version` (text), `effective_date` (date), and rule tables for resale-purchase
eligibility thresholds, CPF housing-grant category conditions, concessionary-loan readiness
thresholds, and remaining-lease-age implications.
**Relationships.** *Referenced by* every HFE Result, so a past result stays explainable after the
ruleset changes.
**Note.** This is the one entity in this section that is persisted, because the ruleset is
configuration rather than a user's answers. Assumption A-6 records that its values are
illustrative until confirmed against HDB's published criteria.

### HFE Result
**Definition.** The classification produced by FR-HFE-03, FR-HFE-04, FR-HFE-05, and FR-HFE-06,
returned to the user per FR-HFE-07 and then discarded.
**Attributes.** `eligibility_classification` (enum: potentially_eligible, potentially_ineligible,
requires_official_assessment); `reasons` (list of text); `applicable_grant_categories` (list, each
with name, reason, and exclusions); `loan_readiness_classification` (the same three-way enum);
`remaining_lease_implication` (text, nullable); `ruleset_version` (text); `source_links` (list of
URLs to HDB's official pages).
**Relationships.** *Computed from* one HFE Session Input against one HFE Ruleset Version.
**Note.** NOT PERSISTED, under the same rule as HFE Session Input. FR-HFE-07 requires every
result to carry its reason, official source, and ruleset effective date, so `ruleset_version` and
`source_links` are first-class fields rather than values reconstructed afterwards.

### HFE Disclosure Statement
**Definition.** The fixed acknowledgement and exclusion text FR-HFE-01, FR-HFE-08, and FR-HFE-09
require around the pre-check. It is not user data, and appears here for the same reason as the
Market Evidence Label in §3.
**Attributes.** A fixed set of disclosure strings: the acknowledgement that the pre-check is
general guidance and not an official HFE assessment; the exclusion list covering exact amounts,
ethnic and SPR quota, bank underwriting, discretionary cases, and official approval; and the link
to HDB's official HFE information.
**Relationships.** *Shown* before HFE Session Input collection begins and *alongside* every HFE
Result.

---

## 7. Data administration and resilience

### Data Source Registry
**Definition.** FR-ADM-02's configuration and live status for each external dataset the
application depends on.
**Attributes.** `source_id` (text): "hdb_resale", "hdb_property", "moe_schools", "onemap",
"lta_datamall"; `name` (text); `sync_frequency_hours` (integer): 24 per FR-ADM-04;
`freshness_threshold_days` (integer): 31 per NFR-DATA-02; `last_success_sync_at` (timestamp,
nullable); `last_attempt_sync_at` (timestamp, nullable); `record_count` (integer); `status`
(enum: ok, stale, failed, never_run).
**Relationships.** *Has many* Sync History Records.

### Sync Attempt / Sync History Record
**Definition.** FR-ADM-03's manual-refresh request and FR-ADM-05's resulting history entry.
**Attributes.** `source_id` (foreign key); `requested_by` (account_id, nullable when scheduled);
`start_time` (timestamp); `end_time` (timestamp, nullable); `outcome` (enum: success, failure,
in_progress); `records_added` (integer); `records_changed` (integer); `error_summary` (text,
sanitised, see Note).
**Relationships.** *Belongs to* one Data Source Registry entry.
**Note.** FR-ADM-05's verification checks for the absence of secrets in the error summary, so
this field must be sanitised before storage rather than only at display time.

### Validated Dataset Snapshot
**Definition.** FR-RES-01's record of the last dataset version known to have passed validation,
which the system keeps serving when a refresh fails.
**Attributes.** `source_id` (foreign key); `version` (text or timestamp); `validated_at`
(timestamp); `active` (boolean).
**Relationships.** *Belongs to* one Data Source Registry entry.
**Note.** A failed refresh must not leave the system holding a mixture of old and new data. This
term gives the currently-active, known-good version a concrete row, so new data can be swapped in
only after validation succeeds.

### Cache Freshness Marker
**Definition.** NFR-DATA-02's staleness flag and FR-RES-03's cached-data age display, wherever
externally sourced information is shown.
**Attributes.** `source_id` (foreign key); `data_age_days` (number, derived); `stale` (boolean,
derived from `data_age_days > freshness_threshold_days`).
**Relationships.** *Derived from* one Data Source Registry entry's `last_success_sync_at`.

### Service Isolation Boundary
**Definition.** Not a stored row, but the documented map of which functions must keep working
when one external dependency fails, per FR-RES-02 and NFR-REL-03.
**Attributes.** `dependency` (text): "onemap_routing", "onemap_themes"; `affected_functions`
(list): ["route_estimate", "nearby_place"]; `unaffected_functions` (list): ["account",
"shortlist", "cached_market_data"].
**Relationships.** *References* a Data Source Registry entry as the dependency in question.
**Note.** FR-RES-02's verification disables each dependency in turn and checks that every named
unaffected workflow still runs, so the boundary between affected and unaffected has to be an
explicit list. NFR-REL-02's five-minute post-restart recovery applies the same idea to a full
restart: every entity that must survive one has to be genuinely persisted rather than held only
in memory.

---

## 8. Actors and external providers

### Guest / Applicant
**Definition.** An unauthenticated visitor, who can search, view profiles, compare, and run the
HFE pre-check, but cannot save preferences or a shortlist.

### Registered User
**Definition.** An authenticated User Account without the Administrator Role, and the actor
behind every FR whose Actor column reads "Authenticated user" or "User".

### Data Administrator
**Definition.** A User Account with the Administrator Role, and the actor behind every FR in
§9.8 of the requirements document.

### External Data Provider
**Definition.** A named source of data the application does not own, cited wherever NFR-DATA-01
requires attribution.
**Attributes.** `name` (text): one of the three below.

**Proposed providers, each an assumption the team should confirm:**
- **data.gov.sg**: HDB Resale Flat Prices, HDB Property Information, and MOE School Directory and
  Information.
- **OneMap** (Singapore Land Authority): address search and geocoding, routing for walk, drive,
  cycle, and public transport including barrier-free access, and a Themes API for categorised
  nearby places.
- **LTA DataMall**: a supplementary MRT and LRT station dataset carrying coordinates.

---

## Assumptions and constraints

Maintained in §6 of `Functional and Non-Functional Requirements.md`, which is the authoritative
copy. Repeated here because entries above cite these identifiers directly.

| # | Assumption or constraint | Consequence if wrong |
|---|---|---|
| A-1 | data.gov.sg's "HDB Resale Flat Prices" and "HDB Property Information" datasets are the market and property source, joined on normalised block plus street, since the two datasets do not share a town key. | FR-MKT-01, FR-MKT-02, FR-MKT-03, FR-SRCH-01, FR-SRCH-02 and NFR-SCALE-01 all depend on this join. A bad join silently mis-attributes transactions to the wrong block. |
| A-2 | OneMap is the geocoding, routing, and nearby-amenity provider. Address search is free and unauthenticated; routing and protected theme queries require a free token from OneMap's authentication endpoint. | FR-LOC-01 through FR-LOC-07, and FR-PREF-03. |
| A-3 | OneMap's barrier-free access routing has real but partial coverage, so FR-LOC-06's unavailable-coverage path is required rather than optional. | FR-LOC-06. Treating coverage as complete could route a barrier-free request onto an inaccessible path. |
| A-4 | The MOE School Directory dataset carries no coordinates, so every school needs separate geocoding before it can appear as a Nearby Place or contribute to a distance measurement. | FR-LOC-02, FR-LOC-04, and the schools criterion in Criterion Weight and Suitability Score. |
| A-5 | LTA DataMall's static train station dataset supplements OneMap's Themes API for MRT and LRT coordinates where coverage is thin. | FR-LOC-02. |
| A-6 | The HFE Ruleset Version is authored by the team from HDB's published general eligibility information and is illustrative. CPF grant category names (Enhanced CPF Housing Grant, Family Grant (Resale), Proximity Housing Grant) are current, but no exact grant or loan amount is computed or shown as authoritative. | FR-HFE-03 through FR-HFE-08. Presenting an illustrative ruleset as authoritative would breach FR-HFE-08. |
| A-7 | Published resale transactions are a sufficient basis for indicative market evidence. The application reports what has sold, and does not model or predict future prices. | FR-MKT-07. Any wording that implies prediction would misrepresent what the data supports. |
| C-1 | HFE pre-check data (§6) must never reach persistent storage, logs, or analytics, enforced architecturally through a request-scoped object with no serialiser to any sink. | NFR-PRIV-01. A single stray log line breaches the requirement. |
| C-2 | The transaction store must scale to at least 1,000,000 rows with indexed queries on block, flat type, and date. | NFR-SCALE-01, NFR-PERF-01. |
| C-3 | Every externally sourced output carries a Data Provenance Stamp (§4) as a structured field rather than interface text added afterwards. | NFR-DATA-01, NFR-TRANS-01. |
| C-4 | External providers are called within their published rate limits, and a provider failure degrades only the features that depend on it. | FR-RES-02, NFR-REL-03. |
