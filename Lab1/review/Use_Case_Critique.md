# Use Case Descriptions Critique

**Artifact under review:** `Lab1/Use Case Descriptions.md` (use cases 1.1–8.3)
**Judged against:** use-case authoring best practice — Cockburn, *Writing Effective Use Cases*; Larman, *Applying UML and Patterns*; the UML «include»/«extend» semantics — cross-checked against `Functional and Non-Functional Requirements.md`.
**Scope:** the *use cases themselves* as engineering artifacts — goal level, precondition rigor, scenario structure, relationship semantics, black-box discipline. This is deliberately **not** a re-run of the diagram critique (`Diagram_Critique.md`), the IEEE 830 SRS review (`SRS_Review_IEEE830.md`), or the actor-vocabulary work (`CONTEXT.md`); those findings are referenced, not repeated.
**Method:** fresh read of every use case; each tested against a named best-practice rule.

---

## 1. Summary

These are **above-average use cases** — the template is disciplined, alternative flows are tied to step numbers, Exceptions are cleanly separated from Alternative Flows, and every use case carries success *and* failure postconditions plus explicit NFR traceability. That structural quality is real and worth preserving.

The weaknesses are not in coverage but in **use-case discipline**: a systemic misuse of the *Preconditions* field (things the use case actually validates are listed as assumptions it may not check), two use cases that **bundle more than one goal**, one use case written at the **wrong goal level**, relationship fields (`Includes`) that are **asymmetric and occasionally misused**, and **branching / implementation detail leaking into the main success scenario**. None is fatal; all are the kind of defect an SC2006 grader trained on Cockburn will circle.

**Overall:** a well-formed set whose main-flow *contents* are strong, but whose *contracts* (preconditions, relationships, goal levels) need tightening.

---

## 2. What the descriptions get right

| Dimension | Assessment |
| --- | --- |
| **Template completeness** | Every use case carries ID, actor, description, pre/postconditions, priority, frequency, main flow, alternative flows, exceptions, includes, special requirements, assumptions, and notes. Few student sets are this complete. |
| **Exceptions vs Alternative Flows** | Business variations (`Alternative Flows`) are correctly separated from system/technical failures (`Exceptions`) — exactly Cockburn's distinction. Consistently applied across all 19. |
| **Step-anchored alternates** | Alternatives are keyed to the step they diverge from (`AF-S4.1`, `AF-S7`), which is the right way to make them traceable. |
| **Dual postconditions** | Each use case states both a success guarantee and a failure guarantee — close to Cockburn's success/minimal-guarantee pairing. |
| **NFR traceability** | Special Requirements cite the exact NFR each flow must satisfy (NFR-SEC-02, NFR-PRIV-01, NFR-PERF-01…), giving forward traceability from behaviour to quality attribute. |
| **Abstract actor handled explicitly** | `User (Visitor or Registered User)` is used consistently, and 6.1 even spells out "session defaults for a Visitor" — the descriptions sit on the **correct** side of the §4-vs-Data-Dictionary "User" contradiction (see `SRS_Review_IEEE830.md` C4). The use cases are not the source of that defect. |

---

## 3. Findings (most significant first)

### F1 — Preconditions are used for conditions the use case actually validates (systemic)

A precondition, by definition, is a state the system may **assume true and will not re-check**; if a use case can fail because the condition is false, it is not a precondition — it is an input the main or alternative flow must validate. Several use cases list as *preconditions* exactly the things they then check, and provide an **alternative flow for the precondition being false** — a direct contradiction:

| Use case | Stated precondition | Contradicting flow/alternate |
| --- | --- | --- |
| **6.2 Compare Flat Profiles** | "At least two profiles have been selected" | `AF-S1`: "Fewer than two … selected → rejected" — cannot occur if the precondition holds |
| **7.1 Perform Indicative HFE Pre-check** | "User acknowledges the pre-check is general guidance" | Acknowledgement **is step 1** of the main flow, and `AF-S1` handles non-acknowledgement |
| **3.2 Apply Saved Preferences** | "has at least one saved preference value" | `AF-S3`: "No saved preferences exist → action disabled" |
| **1.2 Login / Logout** | "User holds a registered account (for login)" | `AF-S3`: "Unknown account → generic failure" |
| **1.3 Reset Password** | "User holds a registered account with a valid email on file" | Step 3.2 / `AF-S3.2`: unknown email path |

**Why it matters:** this is the most common precondition error in use-case writing, and it is here five times, so it reads as a pattern, not a slip. It also weakens testability — a reader cannot tell what the system *guarantees* going in versus what it *enforces*.
**Fix:** demote each of these to the flow. Replace the precondition with the genuine, unchecked assumption (e.g. 6.2: "The user is in the comparison feature"; 7.1: "The pre-check entry point is reachable"), and let the count/acknowledgement/existence check live as a validated step with its alternative. A precondition should never have a matching alternative flow.

### F2 — Two use cases bundle more than one goal

A use case should capture **one** primary actor achieving **one** goal in one sitting (Cockburn, user-goal / "sea" level).

- **1.2 Login / Logout** fuses two distinct goals with different preconditions and postconditions into a single flow whose steps 1–4 are login and 5–7 are logout — a sequence **no actor performs in one sitting**. The requirements already split them (FR-ACC-02 authenticate, FR-ACC-03 logout), so the use case is *coarser than its own FRs*, breaking 1:1 traceability.
- **6.3 Manage Shortlist and Notes** bundles four operations — add, remove, create/edit/clear note — across **two different priorities** ("Must (shortlist); Should (notes)"). Its main flow chains add → note → remove as one scenario. Mixing a Must and a Should in one use case makes the priority field meaningless for scope negotiation and prevents the Should-notes behaviour from being dropped independently. FR-DEC-05/06/07 correctly separate them.

**Fix:** split 1.2 into *Log In* and *Log Out*. Either split 6.3 into *Manage Shortlist* (Must) and *Annotate Shortlisted Profile* (Should), or keep the CRUD grouping but record the two priorities per-operation and stop chaining them into one narrative scenario. (2.1 Manage Housing Preferences is also broad but remains a **single** goal — setting preferences — so it is acceptable as a CRUD-style use case.)

### F3 — 6.1 Calculate Suitability Score is written at the wrong goal level

6.1's own fields give it away: *Includes:* "None — included by 4.1 … and 6.2"; *Frequency:* "invoked by 4.1, 6.2, and shortlist views." It is a **sub-function** ("fish" level) — a step other use cases invoke, not a standalone goal a user sits down to achieve. Yet it is given a primary **Actor** (`User`), a **Priority** (Must), and a white-box main flow describing the normalisation-and-sum **algorithm** step by step. This both over-promotes it to a user goal and pulls internal computation into a use case. (The diagram critique flags the same node at F4; this is the *description-level* half of that defect.)
**Fix:** keep 6.1 as an included sub-function: drop the primary-actor association, let its priority be inherited from its includers, and frame it as "the behaviour invoked by 4.1/6.2." The itemised, user-visible explanation (contributions, weights, missing-data treatment) stays, since that is observable; the "normalise × weight, then sum" narration is internal design and can be compressed.

### F4 — Relationship fields are asymmetric and partly misused

The template records `Includes` but has **no `Extends` / `Included by` / `Trigger` field**, so relationships land inconsistently:

- **The 3.2 → 3.1 «extend» is unrecorded.** 3.1's flow step 3 says "Apply saved preferences … which extends this use case," but **both** 3.2 and 3.1 have `Includes: None` and neither carries the extend in a structured field. A relationship the spec relies on lives only in prose. (Diagram critique F2 reaches the same conclusion from the drawing.)
- **8.2 → 8.1 «include» is likely the wrong stereotype.** 8.2 "Trigger Manual Source Refresh" declares it *includes* 8.1 "View Data Source Sync Status," and step 1 is "opens the source-status view." Triggering a refresh does not *execute the whole view-status use case as a mandatory sub-step*; the status view is **navigational context / a precondition** ("source-status view is available," which 8.2 already lists). This is the classic misuse of «include» for UI sequencing.
- **6.1's claimed callers don't all declare it.** 6.1 says it is "invoked by … shortlist views," but 6.3 declares no include of 6.1. Either 6.3 should include it or the claim should be dropped.

**Fix:** add explicit `Trigger`, `Extends`, and `Included by` rows to the template; record every relationship in a structured field (not prose); reclassify 8.2→8.1 as a precondition rather than an include; reconcile 6.1's caller list with the callers' own `Includes`.

### F5 — Branching and duplication inside the main success scenario

The main success scenario should be **one typical, branch-free path**; conditionals belong in extensions, stated **once**. Several flows violate this:

- **Inline conditionals duplicated as alternates (double-spec, drift risk).** 1.3 step 3 embeds the "if email matches / if not" branch *and* repeats it as `AF-S3.2`. 4.2 step 3.1 embeds "If the comparable set is empty …" *and* repeats it as `AF-S3`. The same rule now lives in two places and can drift.
- **Over-optional main flow.** 3.1 Search and Filter Flats has steps 2, 3, and 4 all marked "optionally," so the *main* scenario never commits to what a typical successful search looks like — the happy path is under-defined.

**Fix:** write each main flow as a single concrete success path; move every conditional to an extension and state it once; give 3.1 a definite typical scenario (e.g. "user enters a town and applies a price filter") and push the truly optional steps to extensions.

### F6 — Duplicate alternative-flow identifiers break unique citation

Several use cases reuse one label for **different** alternatives, so an alternate cannot be cited or tested uniquely:

- **1.2** has three distinct `AF-S3` entries (wrong password, unknown account, lockout).
- **1.3** has two `AF-S7` entries (expired token, reused token).
- **6.2** has two `AF-S1` entries (bad count, duplicate).
- **5.2** has two `AF-S1` entries (unsupported mode, invalid destination).

**Fix:** give every alternative a unique suffix (`AF-S3.1`, `AF-S3.2`, `AF-S3.3`) — the convention already used correctly in 1.1 (`AF-S4.1…4.4`). This directly enables one test per alternate.

### F7 — Implementation ("how") leaks into black-box behavioural steps

Use case flows should describe **observable** behaviour, not mechanism. A few steps state design:

- **1.1** step 5: "creates the account record with a **hashed password** (NFR-SEC-02)."
- **1.2** step 6: "invalidates the session **token server-side**."
- **7.1** step 2: questionnaire "held only in **request-scoped session state** (never persisted — see C-1)."

Each mechanism is already captured where it belongs (Special Requirements / constraint C-1), so the flow can stay black-box.
**Fix:** in the flow write the observable effect ("the account is created," "the session ends," "answers are collected for this session only"); leave hashing, token scope, and request-scoping to the referenced NFR/constraint.

### F8 — Use-case count and FR coverage need reconciling

- **Count discrepancy.** These descriptions contain **19** use cases (1.1–1.5, 2.1, 3.1–3.2, 4.1–4.2, 5.1–5.2, 6.1–6.3, 7.1, 8.1–8.3). `Diagram_Critique.md` asserts "all 20 use cases" **twice**. One artifact is wrong — verify against the diagram and correct whichever is off.
- **FRs with no owning use case.** FR-RES-02 (fault isolation) and FR-RES-03 (stale-data warning) trace to no use case. This is defensible — they are cross-cutting — but it should be **stated** in the use case set (a short "cross-cutting behaviours, verified by NFR-REL/NFR-DATA tests" note), not left as a silent gap. (Matches `SRS_Review_IEEE830.md` C3.)

**Fix:** reconcile the 19/20 count across the two artifacts; add a one-line note recording FR-RES-02/03 as intentionally use-case-less cross-cutting requirements.

---

## 4. Minor notes

- **No explicit `Trigger` field.** Cockburn treats the trigger as a first-class element; here it is implied by "step 1." Adding it makes the scheduled use case (8.3) and the user-initiated ones uniformly readable. (Folded into F4's fix.)
- **Rigid use-case pipeline.** 4.1, 4.2, 5.1, 5.2 each precondition on "a profile has been **selected** (see 3.1/4.1)," so they are not independently invocable — they presume a specific prior use case. This is realistic for a UI flow, but worth noting that several use cases are steps in a chain rather than free-standing goals.
- **Undefined thresholds block use-case-level acceptance.** 6.3's note "length boundary" and 4.2's "below configured threshold" are validated in-flow but never valued, so those alternatives cannot be tested as written (cross-ref `SRS_Review_IEEE830.md` B3). A use case that checks an undefined limit is not yet verifiable.
- **6.1's crammed relationship field.** "Includes: None — included by 4.1 … and 6.2" overloads one field with two opposite relationships; the `Included by` row from F4 resolves this.
- **Actor vocabulary is already settled** in `CONTEXT.md` (Visitor / Registered User / Data Administrator / System; abstract "User" = Visitor OR Registered User). The descriptions comply, so it is not re-litigated here.

---

## 5. Fix checklist

- [ ] **F1** Demote every "precondition" that has a matching alternative flow (6.2, 7.1, 3.2, 1.2, 1.3) into a validated step; leave only genuinely unchecked assumptions as preconditions.
- [ ] **F2** Split 1.2 into Log In / Log Out; split or per-operation-prioritise 6.3 so Must-shortlist and Should-notes are independently traceable.
- [ ] **F3** Reclassify 6.1 as an include-only sub-function: no primary actor, inherited priority, compressed internal algorithm.
- [ ] **F4** Add `Trigger` / `Extends` / `Included by` template rows; record 3.2→3.1 «extend» in a field; reclassify 8.2→8.1 as a precondition, not an include; reconcile 6.1's caller list.
- [ ] **F5** Rewrite main flows as single branch-free success paths; move inline conditionals (1.3 s3, 4.2 s3.1) to extensions stated once; give 3.1 a definite typical scenario.
- [ ] **F6** Make every alternative-flow ID unique (`AF-S3.1/.2/.3`).
- [ ] **F7** Remove mechanism (hashed password, server-side token, request-scoped state) from flows; rely on the already-cited NFR/constraint.
- [ ] **F8** Reconcile the 19-vs-20 use-case count with the diagram; annotate FR-RES-02/03 as intentional cross-cutting requirements.

*Ordering rationale: F1–F3 change the meaning of the contracts (what is guaranteed, what the goal is); F4–F5 fix how relationships and scenarios are expressed; F6–F8 are precision and bookkeeping. Items F1, F2, and F6 are small edits with high grader-visible payoff.*
