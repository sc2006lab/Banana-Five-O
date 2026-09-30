-- Forward-only removal of commercial tenancy. Preserve every saved entry and note.
-- Run during a maintenance window after backup. Shared records require an explicit
-- owner-reviewed export/reconciliation before retrying; never silently reassign them.
BEGIN;
LOCK TABLE "ShortlistEntry", "Workspace", "WorkspaceMember", "WorkspaceInvite", "UserAccount" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "ShortlistEntry" s JOIN "Workspace" w ON w."id" = s."workspaceId"
    WHERE NOT w."personal" OR w."ownerId" <> s."accountId"
  ) THEN
    RAISE EXCEPTION 'PERSONAL_MIGRATION_REVIEW_REQUIRED: export and reconcile shared shortlist entries before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "ShortlistEntry" GROUP BY "accountId", "neighbourhoodId" HAVING count(*) > 1)
     OR EXISTS (SELECT 1 FROM "ShortlistEntry" GROUP BY "accountId" HAVING count(*) > 10) THEN
    RAISE EXCEPTION 'PERSONAL_MIGRATION_REVIEW_REQUIRED: duplicate entries or more than 10 saved neighbourhoods per account';
  END IF;
  IF EXISTS (SELECT 1 FROM "UserAccount" WHERE "stripeSubscriptionId" IS NOT NULL OR "subscriptionStatus" IN ('active', 'past_due')) THEN
    RAISE EXCEPTION 'PERSONAL_MIGRATION_REVIEW_REQUIRED: resolve external subscriptions and archive billing references first';
  END IF;
END $$;

ALTER TABLE "ShortlistEntry" DROP COLUMN "workspaceId";
DROP INDEX "ShortlistEntry_accountId_idx";
CREATE UNIQUE INDEX "ShortlistEntry_accountId_neighbourhoodId_key" ON "ShortlistEntry"("accountId", "neighbourhoodId");

CREATE OR REPLACE FUNCTION enforce_shortlist_capacity() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW."accountId"::text));
  IF (SELECT count(*) FROM "ShortlistEntry" WHERE "accountId" = NEW."accountId") >= 10 THEN
    RAISE EXCEPTION 'SHORTLIST_FULL' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TABLE "WorkspaceInvite";
DROP TABLE "WorkspaceMember";
DROP TABLE "Workspace";
ALTER TABLE "UserAccount"
  DROP COLUMN "activeWorkspaceId", DROP COLUMN "currentPeriodEnd",
  DROP COLUMN "plan", DROP COLUMN "stripeCustomerId",
  DROP COLUMN "stripeSubscriptionId", DROP COLUMN "subscriptionStatus";
COMMIT;
