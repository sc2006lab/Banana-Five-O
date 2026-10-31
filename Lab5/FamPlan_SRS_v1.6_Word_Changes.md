# SRS v1.6: changes to copy into the Word file

`FamPlan_SRS_v1.6.pdf` was built by editing the v1.5 PDF, because the v1.5 Word file is not in this repository. If your team finalises the SRS from Word, make these changes there too. Page numbers refer to v1.5.

Sections 9.2 and 9.3 were left as they are for Ilham's re-render.

## Cover and revision history

- Cover: `Version 1.6 - Lab 5 Final Revision`
- New revision row: Banana Five-O, 31 October 2026, "Lab 5: travel mode per destination; commute scored across all destinations; larger architecture figure; class diagrams updated", version 1.6

## FR-PREF-03 (Section 4.2)

| Column | New text |
|---|---|
| Atomic Requirement | The system shall store up to three priority destinations, each with a travel mode, and shall use all of them for commute scoring and comparison. |
| Input and Required Output | Input: Destination labels, addresses and travel modes. Output: Saved and geocoded destinations or field errors |
| Verification | Test zero through four destinations, duplicates, unresolved addresses, and every travel mode. |

## Business Rules (Section 5.24)

Add a row:

| Rule | Value | Requirements |
|---|---|---|
| Commute time | Average across all destinations, each by its travel mode | FR-PREF-03; FR-DEC-01 |

## Data Dictionary (Section 6): Priority Destination

- Definition: Saved place and travel mode used for commute scoring and comparison.
- Key Attributes: slot 1 to 3; label; query_text; geolocation; travel_mode

## System Architecture (Section 8.2)

- Put the figure on its own landscape page straight after the 8.2 heading, using `figures/FamPlan_System_Architecture_v1.6.png` (300 dpi) or the `.pdf` version. Add this caption:

  > Layered architecture: dashed arrows are calls and dependencies; solid arrows show the entity each controller reads or updates; persistent entities are stored in PostgreSQL.
  >
  > Deployment: the React client is served by Vercel; Express runs as serverless Node.js functions in Singapore (sin1); Prisma connects to hosted PostgreSQL; one Vercel Cron job refreshes each of the 9 public data sources daily. Local development runs the same Express app as one long-running server with node-cron.

- PreferenceBoundary, second line: "commute destinations with travel modes, and 0–5 criterion importance weights."
- SyncScheduler: "Runs scheduled data synchronisation at least once every 24 hours without human intervention. It uses node-cron on a long-running server and one Vercel Cron job per source in the serverless production deployment."

## Class diagrams (Sections 9.1 and 9.4)

- 9.1: replace the figure with `figures/FamPlan_Class_Diagram_A_Entity_Model_v2.1.png`. It adds `PriorityDestination.mode` and lists the `TravelMode` values.
- 9.4: replace the figure with `figures/FamPlan_Class_Diagram_D_Design_Layer_v2.1.png`. `evidence()` and `commuteMinutes()` now take `destinations`.

These two figures were corrected directly on the images because the draw.io source for these versions is not in the repository. If you have the source, make the same edits there so they aren't lost at the next export.

## Traceability (Section 9.5): SyncScheduler row

Add after `nextRunAt()`: "; api/cron.ts (Vercel Cron in production)"

## Stale lines

- Section 8 technology table, "Local setup and deployment": "GitHub, Vercel and Neon PostgreSQL"
- End of Section 9.5, replacing the billing and workspaces sentence: "The commercial billing and workspace modules were removed when the project narrowed to personal family planning, so they are not modelled."

## Contents

Update the contents table after inserting the landscape page. Everything after 8.2 moves on by one page.
