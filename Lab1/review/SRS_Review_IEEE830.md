# SRS Review — IEEE 830-1998

**Specification under review (graded as one distributed SRS):**
`Functional and Non-Functional Requirements.md` + `Use Case Descriptions.md` + `Data Dictionary.md` + `diagrams/FamPlan_Use_Case_Diagram.drawio.png`
**Standard:** IEEE Std 830-1998, *Recommended Practice for Software Requirements Specifications* — §4.3 quality characteristics of a good SRS.

---

## 1. Scorecard

Each of IEEE 830 §4.3's eight characteristics, rated **Strong / Adequate / Weak**.

| # | Characteristic | Rating | One-line basis |
|---|---|---|---|
| a | **Correct** | **Strong** | Requirements are grounded in real HDB/data.gov.sg/OneMap behaviour; illustrative parts (HFE ruleset) are explicitly flagged as such (A-6). |
| b | **Unambiguous** | **Adequate** | Atomic requirements with Input/Output/Verification columns are excellent, but the "Must" convention is self-contradictory and actor terms diverge across artifacts. |
| c | **Complete** | **Adequate** | FR/NFR/data/assumptions/scope coverage is thorough; several quantitative limits are left as un-filled TBDs and classic 830 interface/overall-description sections are absent. |
| d | **Consistent** | **Adequate** | Cross-references are unusually disciplined, but one substantive contradiction ("User" actor scope) and one naming drift (Visitor vs Guest) remain. |
| e | **Ranked for importance and stability** | **Weak** | Importance is present (Must/Should priority); **stability/volatility ranking is entirely absent**, though volatile items clearly exist. |
| f | **Verifiable** | **Strong** | Every FR carries concrete verification cases; NFRs are quantified (percentiles, counts, thresholds). A model strength. |
| g | **Modifiable** | **Strong** | Modular sections, stable IDs, config isolation (NFR-MAINT-01); one deliberate duplication (assumptions copied into the data dictionary) is a small drift risk. |
| h | **Traceable** | **Strong** | FR IDs are cited from data-dictionary entities and assumptions; verification gives forward traceability. Only a consolidated matrix is missing (now supplied). |

**Headline:** an unusually rigorous, verifiable, traceable specification whose weak point is **ranking (no stability dimension)**, with fixable ambiguity/consistency defects concentrated in the actor vocabulary and the modal-verb convention.

---

## 2. Detailed findings

Findings are keyed by the characteristic they most affect. Each has a concrete fix.

### Unambiguous (b)

**B1 — The "Must" convention is defined twice, with two different meanings.**
§8 *Requirement Conventions* states both:
- "**Must** states a mandatory constraint." (a modal verb, like Shall)
- "**Must** means essential for the agreed minimum viable product; **Should** means important but negotiable…" (a **priority** level)

The Priority column then uses Must/Should as priority. So "Must" is overloaded between *constraint modality* and *priority rank*, and a reader cannot tell which sense applies where.
**Fix:** separate the two axes. Use *Shall* for capabilities and *Must* for constraints in requirement **text**; rename the Priority column values to **Essential / Desirable** (or High/Low) so priority never reuses a modal verb.

**B2 — The unauthenticated actor has three names.**
"Visitor" (requirements §4, diagram) vs "Guest / Applicant" (Data Dictionary §8). Same concept, inconsistent label — an ambiguity under 830 §4.3.2, which asks that each term have one meaning and one name.
**Fix:** pick one canonical term (recommend **Visitor**) and use it everywhere. Captured in `review/CONTEXT.md`.

**B3 — Soft thresholds referenced but not yet valued.** "insufficient data (below configured threshold)" (FR-MKT-08 / UC 4.2), "documented rounding" (FR-DEC-02), note "length boundary" (FR-DEC-07), shortlist "documented limit" (§4). These are referenced as if defined but their values are not in the spec.
**Fix:** give each a concrete value or a single "Configurable parameters" table, so verification cases are executable.

### Complete (c)

**C1 — Unquantified limits (TBDs) are present but not marked or tracked.** IEEE 830 §4.3.3 says an SRS is complete only if TBDs are labelled and a resolution process exists. The spec has genuine TBDs — shortlist size limit, note length, rounding rule, editable-field list for FR-ACC-05 (Data Dictionary explicitly defers it) — but they are scattered in prose rather than flagged as TBD.
**Fix:** add a short **Open Items / TBD** register listing each, its owner, and its resolution deadline.

**C2 — Classic 830 structural sections are missing.** Judged as a whole the set is content-complete, but it lacks 830's *Overall Description* (product perspective, product functions summary, user characteristics as a first-class subsection, operating environment, design/implementation constraints) and an explicit *External Interface Requirements* section (user/hardware/software/communications interfaces). UI mockups exist under `ui_mockups/` but are not referenced from the spec as the UI-interface requirement.
**Fix:** add a brief §Overall Description and an §External Interfaces that points at the mockups and names the five provider APIs as software interfaces.

**C3 — Two functional requirements have no home use case (acceptable, but note it).** FR-RES-02 (fault isolation) and FR-RES-03 (stale-data warning) trace to no use case — they are cross-cutting behaviours. This is defensible, but 830 completeness prefers every requirement be reachable; state explicitly that these are cross-cutting and verified by the NFR-REL/NFR-DATA tests.

### Consistent (d)

**C4 — "User" actor scope is internally contradictory (the most important consistency defect).**
- `Functional and Non-Functional Requirements.md` §4 and `Use Case Descriptions.md`: **"User (Visitor or Registered User)"** — visitors are included in every `Actor = User` requirement (search, market, location, scoring, compare, HFE).
- `Data Dictionary.md` §8: **"Registered User … the actor behind every FR whose Actor column reads 'Authenticated user' or 'User'"** — which **excludes visitors** from those same requirements.

These cannot both be true. It changes whether an unauthenticated visitor may run FR-SRCH/FR-MKT/FR-LOC/FR-DEC(scoring, compare)/FR-HFE at all.
**Fix:** adopt §4's meaning (visitors included), and correct the Data Dictionary §8 definition of Registered User to "the actor behind every FR whose Actor column reads 'Authenticated user'; requirements marked 'User' are available to Visitors too." The diagram's Visitor associations should match.

**C5 — Duplicated assumptions table can drift.** Assumptions A-1…C-4 are maintained in the requirements doc **and** copied into the Data Dictionary. The Data Dictionary names the requirements doc authoritative, which is good practice, but a duplicated table is a live inconsistency risk.
**Fix:** keep one copy; have the Data Dictionary link to it rather than reproduce it (this also improves *modifiability*, g).

### Ranked for importance and stability (e) — weakest characteristic

**E1 — No stability/volatility ranking anywhere.** 830 §4.3.5 asks each requirement be ranked on **two** axes: importance *and* stability (expected likelihood of change). The spec ranks importance (Priority = Must/Should) but never stability — even though volatile items are obvious: the HFE ruleset is illustrative and will change (A-6); provider APIs and tokens may change (A-2); soft thresholds are unset (B3).
**Fix:** add a **Stability** column (Stable / Volatile) or tag volatile requirements. At minimum, flag every A-6/A-2-dependent requirement as Volatile.

**E2 — Importance is nearly monotone.** Almost every FR is "Must", which weakens ranking's usefulness for scope negotiation. Consider whether some Musts are truly essential for MVP or are actually Desirable.

### Verifiable (f) — strength, with one caveat

**F1 — Verifiability depends on the unset thresholds in B3.** Verification cases such as FR-MKT-08's "insufficient data" or FR-DEC-02's "documented rounding" cannot be executed until those values exist. Resolving B3 closes this. Otherwise verifiability is exemplary and should be preserved as the spec evolves.

### Modifiable (g) / Traceable (h) — strengths

**G1/H1 — Preserve what is working.** Stable IDs, per-requirement verification, config isolation (NFR-MAINT-01), and FR-ID citations from the data dictionary are exactly what 830 §4.3.6–4.3.8 reward. The only additions needed are the consolidated traceability matrix (supplied in `review/Traceability_Matrix.md`) and removing the duplicated assumptions table (C5).

---

## 3. Priority of fixes

1. **C4** — resolve the "User"/visitor contradiction (correctness of scope).
2. **B1** — fix the double-defined "Must" convention (affects reading of every row).
3. **E1** — add a stability ranking (the one weak characteristic).
4. **B2 / C5** — unify actor vocabulary; de-duplicate assumptions.
5. **B3 / C1** — value the soft thresholds and open a TBD register.
6. **C2** — add Overall Description + External Interfaces sections.

Items 1–2 are small text edits with large clarity payoff; item 3 is the only structural gap against 830.
