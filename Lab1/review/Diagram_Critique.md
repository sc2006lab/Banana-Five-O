# Use Case Diagram Critique

**Artifact under review:** `Lab1/diagrams/FamPlan_Use_Case_Diagram.drawio.png`
**Judged against:** `Functional and Non-Functional Requirements.md`, `Use Case Descriptions.md`, `Data Dictionary.md`
**Method:** fresh read of the diagram; no reuse of any earlier critique.

---

## 1. Summary

The diagram is **structurally complete and well-organised** — all 20 use cases present, one package per functional-requirement group, four actors matching §4, and an actor generalization hierarchy that mirrors the "everything the previous role can do, plus…" layering. Its weaknesses are all in **relationship semantics and legibility**: the association lines are badly tangled, the «include»/«extend» stereotypes are garbled or missing, one use case is drawn at the wrong abstraction level, and the system's defining external dependencies (§5) are invisible.

**Overall:** a strong first-pass structure that would mislead a reader on *how the pieces relate*, not on *what the pieces are*.

---

## 2. What the diagram gets right

| Dimension | Assessment |
| --- | --- |
| **Use case coverage** | All 20 use cases from `Use Case Descriptions.md` appear, correctly numbered (1.1–8.3). Nothing dropped, nothing invented. |
| **Package structure** | Eight packages map 1:1 onto the eight §9 functional-requirement groups. Grouping is a genuine aid to tracing diagram → requirements. |
| **Actor roster** | Visitor, Registered User, Data Administrator, System (scheduled process) — exactly the four actors of §4. |
| **Actor generalization** | `Visitor ← Registered User ← Data Administrator` is modelled with generalization, which correctly expresses §4's additive privilege model and resolves the descriptions' abstract "User" actor onto a concrete base actor. |
| **Scheduled process** | System → Run Scheduled Daily Sync (8.3) faithfully models FR-ADM-04's no-user-present trigger. |

---

## 3. Findings (most significant first)

### F1 — Association lines are unreadable, which defeats the diagram's purpose

The primary job of a use case diagram is to make the **actor → goal** mapping obvious at a glance. Here the associations cross so heavily across the centre of the canvas that a reader cannot confirm, by inspection, which actor reaches which use case. A diagram whose central claim (who can do what) cannot be verified visually has failed its main function, however complete its contents.
**Fix:** route edges orthogonally, colour edges per actor, place each actor next to the cluster it uses, and draw each shared goal from the **base** actor only.

### F2 — «include» / «extend» relationships are garbled or missing

`Use Case Descriptions.md` specifies four relationships precisely:

| Relationship | Type | Source |
| --- | --- | --- |
| 4.1 View Flat Profile Details → 6.1 Calculate Suitability Score | **include** | UC 4.1 *Includes* |
| 6.2 Compare Flat Profiles → 6.1 Calculate Suitability Score | **include** | UC 6.2 *Includes* |
| 8.2 Trigger Manual Source Refresh → 8.1 View Data Source Sync Status | **include** | UC 8.2 *Includes* |
| 3.2 Apply Saved Preferences → 3.1 Search and Filter Flats | **extend** | UC 3.1 flow, FR-SRCH-03 |

In the diagram the three includes appear as dashed connectors whose stereotype labels render as `<>` / `<<>>` rather than `«include»`, and arrow direction is not legible. The **3.2 → 3.1 extend is absent** — 3.2 reads as just another actor-associated use case, silently dropping a relationship the spec defines.
**Fix:** label every dashed connector explicitly `«include»` or `«extend»`; point include arrows *to* the included use case and extend arrows *to* the base; add the missing 3.2→3.1 extend.

### F3 — External data providers are not modelled, hiding the system's defining dependency

§5 and Assumptions A-1…A-5 make five public data sources (data.gov.sg ×3, OneMap, LTA DataMall) central, and use cases 2.1, 4.2, 5.1, 5.2, 8.2, 8.3 are built on them. The diagram shows no external/secondary actors, so a reader would conclude the system is self-contained — the single biggest architectural risk (external dependency) is invisible.
**Fix:** add supporting actors (OneMap, data.gov.sg, LTA DataMall) on the right, associated to the live-dependent and ingestion use cases. (Local-query use cases 3.1/4.1 correctly stay unwired, per A-1 / NFR-PERF-01's exclusion of external calls.)

### F4 — Calculate Suitability Score (6.1) is drawn at the wrong abstraction level

UC 6.1's own description reads "Includes: None … included by 4.1 and 6.2." It is a **sub-function** invoked by other use cases, not a standalone user goal. If the diagram gives it a direct primary-actor association (it appears to), it both conflates goal levels and duplicates the include relationship.
**Fix:** model 6.1 as an `«include»` target only, with no primary-actor line, and de-emphasise it visually.

### F5 — Notation needs verification against UML conventions

- **Generalization arrowheads** must be *hollow triangles on the parent end* (pointing to Visitor; pointing to Registered User from Data Administrator). Confirm direction — a reversed triangle inverts the privilege model.
- The garbled stereotype text (F2) suggests the stereotype was typed as literal angle brackets rather than guillemets; use `«…»`.

### F6 — Actor–association correctness cannot be confirmed, and §4 vs Data Dictionary disagree on "User"

Because of F1, the following can't be verified from the render and **must** be checked, especially as the spec itself is internally inconsistent here (see the SRS review, C1): the requirements §4 and Use Case Descriptions say visitors *can* search, view profiles/market, explore location, compare, and run the HFE pre-check, but `Data Dictionary.md` §8 says Registered User "is the actor behind every FR whose Actor column reads … 'User'", which would exclude visitors. **The diagram is the tie-breaker**: if 3.1, 4.1, 4.2, 5.1, 5.2, 6.2 and 7.1 attach to **Visitor** (base actor), the diagram endorses §4 and contradicts the Data Dictionary — a discrepancy to reconcile in the text, not just the drawing.
**Verify:** 1.1 attaches to Visitor only; 1.2–1.5, 2.1, 3.2, 6.3 to Registered User; 8.1, 8.2 to Data Administrator; 8.3 to System; and every public use case attaches to Visitor.

---

## 4. Minor notes

- **Actor naming vs FR-ADM-04.** The diagram's "System (scheduled process)" is the actor for 8.3; FR-ADM-04's Actor column says "System clock". Harmonise the label across artifacts.
- **Package 8 title** ("… and System Resilience") implies resilience behaviour (FR-RES-02/03) that has no use case. Acceptable (resilience is cross-cutting), but the title slightly over-promises what the diagram shows.
- **Redundant associations.** If both Visitor and Registered User connect to a shared use case, the second is redundant under generalization — draw shared goals from Visitor once.

---

## 5. Fix checklist

- [ ] De-tangle: orthogonal routing, per-actor colours, base-actor-only shared associations.
- [ ] Label and direct all «include» edges; add the missing 3.2→3.1 «extend».
- [ ] Add external supporting actors for §5 providers.
- [ ] Demote 6.1 to an include-only sub-function.
- [ ] Verify generalization arrowheads point to the parent.
- [ ] Confirm every public use case reaches Visitor; reconcile the §4 vs Data-Dictionary "User" conflict in the text.

*(A corrected source implementing most of these already exists at `Lab1/diagrams/FamPlan_Use_Case_Diagram_corrected.drawio`.)*
