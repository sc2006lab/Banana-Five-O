# Traceability Matrix — Requirements ↔ Use Cases ↔ Diagram

Backs the *Complete* (c) and *Traceable* (h) scores in `SRS_Review_IEEE830.md`.
**Legend:** UC = use case in `Use Case Descriptions.md`; **Dgm** = present in `FamPlan_Use_Case_Diagram.drawio.png` (✅ yes / ➖ n/a).

## Functional requirements → use case → diagram

| FR ID | Requirement (short) | UC | Dgm | Note |
|---|---|---|---|---|
| FR-ACC-01 | Register account | 1.1 | ✅ | |
| FR-ACC-02 | Authenticate | 1.2 | ✅ | login half |
| FR-ACC-03 | Logout | 1.2 | ✅ | logout half |
| FR-ACC-04 | Password reset | 1.3 | ✅ | |
| FR-ACC-05 | Update account details | 1.4 | ✅ | editable-field list is a TBD (C1) |
| FR-ACC-06 | Delete account | 1.5 | ✅ | |
| FR-PREF-01 | Budget range | 2.1 | ✅ | 6 FRs fold into 1 UC |
| FR-PREF-02 | Towns/flat types/thresholds | 2.1 | ✅ | |
| FR-PREF-03 | Priority destinations | 2.1 | ✅ | uses OneMap geocoding |
| FR-PREF-04 | Amenity + barrier-free prefs | 2.1 | ✅ | |
| FR-PREF-05 | Criterion weights 0–5 | 2.1 | ✅ | |
| FR-PREF-06 | Retrieve/update prefs | 2.1 | ✅ | |
| FR-SRCH-01 | Search by town/street/block | 3.1 | ✅ | Actor "User" — see C4 |
| FR-SRCH-02 | Filter results | 3.1 | ✅ | |
| FR-SRCH-03 | Apply saved preferences | 3.2 | ✅ | extends 3.1 (missing on diagram) |
| FR-SRCH-04 | Label as profile not listing | 3.1 | ✅ | |
| FR-SRCH-05 | Sort results | 3.1 | ✅ | |
| FR-SRCH-06 | Reject invalid criteria | 3.1 | ✅ | |
| FR-MKT-01 | Block/flat attributes | 4.1 | ✅ | |
| FR-MKT-02 | Comparable transactions | 4.2 | ✅ | |
| FR-MKT-03 | Count/median/min/max | 4.2 | ✅ | |
| FR-MKT-04 | 12/36/60-month period | 4.2 | ✅ | |
| FR-MKT-05 | Trend time series | 4.2 | ✅ | |
| FR-MKT-06 | Source/coverage/date | 4.2 | ✅ | |
| FR-MKT-07 | Indicative-evidence label | 4.2 | ✅ | |
| FR-MKT-08 | No-data vs zero distinction | 4.2 | ✅ | "insufficient" threshold is a TBD (B3) |
| FR-LOC-01 | Block on map | 5.1 | ✅ | |
| FR-LOC-02 | Nearby MRT/bus/school/amenity | 5.1 | ✅ | OneMap + LTA + geocoded schools |
| FR-LOC-03 | 500m/1km/2km radius | 5.1 | ✅ | |
| FR-LOC-04 | Distance to each place | 5.1 | ✅ | |
| FR-LOC-05 | Route + travel time | 5.2 | ✅ | |
| FR-LOC-06 | Barrier-free routing/coverage | 5.2 | ✅ | |
| FR-LOC-07 | Provider + retrieval time | 5.1 / 5.2 | ✅ | |
| FR-DEC-01 | Suitability score | 6.1 | ✅ | include-only sub-function (F4) |
| FR-DEC-02 | Score breakdown | 6.1 | ✅ | "documented rounding" TBD (B3) |
| FR-DEC-03 | Missing-data treatment | 6.1 | ✅ | |
| FR-DEC-04 | Compare 2–4 profiles | 6.2 | ✅ | |
| FR-DEC-05 | Add to shortlist | 6.3 | ✅ | |
| FR-DEC-06 | Remove from shortlist | 6.3 | ✅ | |
| FR-DEC-07 | Private notes | 6.3 | ✅ | length boundary is a TBD (B3) |
| FR-HFE-01…10 | Indicative HFE pre-check | 7.1 | ✅ | 10 FRs fold into 1 UC |
| FR-ADM-01 | Require admin role | 8.1 / 8.2 | ✅ | gating precondition |
| FR-ADM-02 | Source status view | 8.1 | ✅ | |
| FR-ADM-03 | Manual refresh | 8.2 | ✅ | |
| FR-ADM-04 | 24-hour scheduled check | 8.3 | ✅ | Actor "System clock" vs diagram label |
| FR-ADM-05 | Sync history | 8.1 | ✅ | folded into 8.1's flow |
| FR-RES-01 | Preserve last valid dataset | 8.3 | ✅ | |
| FR-RES-02 | Fault isolation | — | ➖ | cross-cutting; verified by NFR-REL-03 (C3) |
| FR-RES-03 | Stale-data warning | — | ➖ | cross-cutting; verified by NFR-DATA-02 (C3) |

**Forward coverage:** every FR except the two cross-cutting resilience items (FR-RES-02/03) maps to a use case, and every use case appears on the diagram. No orphan use cases.

## Non-functional requirements → binding requirement/use case

NFRs are cross-cutting; they trace to the FRs/UCs they constrain rather than to a use case of their own.

| NFR | Binds to |
|---|---|
| NFR-PERF-01 / SCALE-01 | FR-SRCH-01/02 (UC 3.1) |
| NFR-PERF-02 | FR-DEC-01/04 (UC 6.1/6.2) |
| NFR-PERF-03 | FR-LOC-05 (UC 5.2) |
| NFR-USAB-01 | UC 3.1 → 6.2 flow |
| NFR-USAB-02 | every validation-bearing FR |
| NFR-ACC-01/02 | core workflows (UC 1.x, 3.1, 4.x, 6.x, 7.1) |
| NFR-SEC-01…05 | FR-ACC-02 (UC 1.2), FR-ADM-01 (UC 8.1), all input |
| NFR-DATA-01…03 | every externally sourced output (UC 4.x, 5.x, 8.x) |
| NFR-PRIV-01 | FR-HFE-* (UC 7.1) |
| NFR-PRIV-02 | FR-ACC-06 (UC 1.5) |
| NFR-PRIV-03 | FR-ACC-01 (UC 1.1), FR-PREF-* (UC 2.1) |
| NFR-MAINT-01/02, TRANS-01/02, REL-01…03 | scoring, HFE, sync, resilience clusters |

## Data dictionary → requirements (spot check of backward traceability)

Every Data Dictionary entity cites the FR(s) it serves (e.g. *Suitability Score* → FR-DEC-01; *Sync History Record* → FR-ADM-05; *HFE Session Input* → FR-HFE-02). Backward traceability from data model to requirements is **complete** — a genuine strength. The one correction needed is the actor definition in Data Dictionary §8 (see C4).
