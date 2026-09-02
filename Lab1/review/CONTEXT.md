# FamPlan — Recommended Canonical Glossary

Produced by the domain-modeling pass of this review. This is a **glossary only** — no
implementation detail. It records the terms that were *contested or fuzzy* across the Lab 1
artifacts and the single canonical form recommended for each. Items marked **⚠ decision pending**
are recommendations the team should ratify, then propagate to the requirements doc, use case
descriptions, data dictionary, and diagram so all four agree.

Adopt by moving this file to the repo root (or `Lab1/`) once ratified.

---

## Actors

### Visitor  ⚠ decision pending (naming)
An unauthenticated member of the public. May search, view block-and-flat profiles and market
history, view nearby places and routes, compare profiles, and run the indicative HFE pre-check.
Cannot save anything.
**Resolves the conflict:** the requirements and diagram say **Visitor**; the Data Dictionary §8
calls the same actor **"Guest / Applicant"**. Use **Visitor** everywhere; retire "Guest" and
"Applicant".

### Registered User
A Visitor who has created an account (FR-ACC-01). Everything a Visitor can do, **plus** saved
preferences and weights, a shortlist, and private notes.
**Correction required:** Data Dictionary §8 currently defines Registered User as "the actor
behind every FR whose Actor column reads … 'User'." That wrongly excludes Visitors from
`Actor = User` requirements. A Registered User is **not** the actor for `User` requirements — see
**User** below.

### Data Administrator
A Registered User holding the administrator role (FR-ADM-01). Everything a Registered User can
do, plus source sync status, manual refresh, and sync history.

### User (abstract)  ⚠ decision pending (scope)
The abstract superset **Visitor OR Registered User**. Any requirement whose Actor column reads
"User" is available to **both** — including unauthenticated Visitors. This is §4's meaning and the
one recommended. (This is the single most important term to ratify: it decides whether a Visitor
can search, view market data, compare, and run the HFE pre-check. Recommended answer: **yes**.)

### System (scheduled process)  ⚠ decision pending (naming)
Scheduled processes acting with no user present (FR-ADM-04, FR-RES-01).
**Resolves the conflict:** FR-ADM-04's Actor column says **"System clock"**; the diagram and UC
8.3 say **"System (scheduled process)"**. Use one label — recommended **System (scheduled
process)**.

### External Data Provider (supporting actor)
A named source the application does not own: **data.gov.sg** (HDB Resale, HDB Property, MOE
Schools), **OneMap** (SLA — geocoding, routing, barrier-free routing, nearby-place themes),
**LTA DataMall** (MRT/LRT station coordinates). A secondary actor, not a user role. Currently
absent from the use case diagram (see `Diagram_Critique.md` F3).

---

## Core domain terms (already well-defined — recorded to prevent drift)

### Block-and-Flat Profile
One combination of block + street + flat type the app can show market history and a score for.
**Deliberately not** "Listing" or "Unit": it is assembled from historical transactions and is
**not** a live for-sale listing (FR-SRCH-04). Keep the word "Profile" in both UI and code.

### Suitability Score
The single computed number for how well a Block-and-Flat Profile matches a user's weights. Keep
three concepts distinct — they are easy to conflate:
- **Criterion Weight** — the *user's* personal 0–5 importance per criterion.
- **Scoring Configuration** — the *system-wide* versioned normalisation constants.
- **Suitability Score** — the *output* computed from a profile + weights + configuration.

### Indicative (market evidence / HFE pre-check)
A required framing word, not decoration. Every market figure is **indicative market evidence**,
never an official valuation or price prediction (FR-MKT-07); every HFE output is **indicative
guidance**, never an official assessment (FR-HFE-01/08). "Indicative" must appear in the output
payload, not only in interface copy (NFR-DATA-01, NFR-TRANS-02).

### Data Availability State
The three-way distinction **no matching transactions / insufficient data / source unavailable**,
which must replace a bare `0` or `null` (FR-MKT-08). "Missing" is never "zero".

---

## Open vocabulary items (unset values, from SRS review B3/C1)

These terms are *used* in the spec but their values are undefined — resolve and record here:
shortlist **size limit**; note **length boundary**; suitability-score **rounding rule**;
market **"insufficient data" threshold**; FR-ACC-05 **editable-field list**.
