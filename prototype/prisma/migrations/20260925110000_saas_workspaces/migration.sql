-- SaaS tenancy: workspaces, members, invites, account-level plans.

-- Plans on accounts
ALTER TABLE "UserAccount"
  ADD COLUMN "activeWorkspaceId" UUID,
  ADD COLUMN "currentPeriodEnd" TIMESTAMP(3),
  ADD COLUMN "plan" VARCHAR(20) NOT NULL DEFAULT 'household',
  ADD COLUMN "stripeCustomerId" TEXT,
  ADD COLUMN "stripeSubscriptionId" TEXT,
  ADD COLUMN "subscriptionStatus" VARCHAR(20) NOT NULL DEFAULT 'none';
ALTER TABLE "UserAccount" ADD CONSTRAINT "plan_known" CHECK ("plan" IN ('household', 'family', 'advisor'));
ALTER TABLE "UserAccount" ADD CONSTRAINT "subscription_status_known" CHECK ("subscriptionStatus" IN ('none', 'active', 'past_due', 'canceled'));

CREATE TABLE "Workspace" (
    "id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "ownerId" UUID NOT NULL,
    "personal" BOOLEAN NOT NULL DEFAULT false,
    "shortlistLimit" INTEGER NOT NULL DEFAULT 10,
    "memberLimit" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workspace_limits_positive" CHECK ("shortlistLimit" BETWEEN 1 AND 100 AND "memberLimit" BETWEEN 1 AND 50)
);

CREATE TABLE "WorkspaceMember" (
    "workspaceId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "role" VARCHAR(10) NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("workspaceId","accountId"),
    CONSTRAINT "member_role_known" CHECK ("role" IN ('OWNER', 'ADMIN', 'MEMBER'))
);

CREATE TABLE "WorkspaceInvite" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "role" VARCHAR(10) NOT NULL DEFAULT 'MEMBER',
    "tokenHash" TEXT NOT NULL,
    "invitedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    CONSTRAINT "WorkspaceInvite_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invite_role_known" CHECK ("role" IN ('ADMIN', 'MEMBER'))
);

-- Backfill: every existing account gets a personal workspace that holds its shortlist.
INSERT INTO "Workspace" ("id", "name", "ownerId", "personal")
  SELECT gen_random_uuid(), left(a."displayName" || '''s household', 60), a."id", true FROM "UserAccount" a;
INSERT INTO "WorkspaceMember" ("workspaceId", "accountId", "role")
  SELECT w."id", w."ownerId", 'OWNER' FROM "Workspace" w;
UPDATE "UserAccount" a SET "activeWorkspaceId" = w."id" FROM "Workspace" w WHERE w."ownerId" = a."id" AND w."personal";

ALTER TABLE "ShortlistEntry" ADD COLUMN "workspaceId" UUID;
UPDATE "ShortlistEntry" s SET "workspaceId" = w."id" FROM "Workspace" w WHERE w."ownerId" = s."accountId" AND w."personal";
ALTER TABLE "ShortlistEntry" ALTER COLUMN "workspaceId" SET NOT NULL;
DROP INDEX "ShortlistEntry_accountId_neighbourhoodId_key";

CREATE INDEX "Workspace_ownerId_idx" ON "Workspace"("ownerId");
CREATE INDEX "WorkspaceMember_accountId_idx" ON "WorkspaceMember"("accountId");
CREATE UNIQUE INDEX "WorkspaceInvite_tokenHash_key" ON "WorkspaceInvite"("tokenHash");
CREATE INDEX "WorkspaceInvite_workspaceId_idx" ON "WorkspaceInvite"("workspaceId");
CREATE INDEX "ShortlistEntry_accountId_idx" ON "ShortlistEntry"("accountId");
CREATE UNIQUE INDEX "ShortlistEntry_workspaceId_neighbourhoodId_key" ON "ShortlistEntry"("workspaceId", "neighbourhoodId");
CREATE UNIQUE INDEX "UserAccount_stripeCustomerId_key" ON "UserAccount"("stripeCustomerId");
CREATE UNIQUE INDEX "UserAccount_stripeSubscriptionId_key" ON "UserAccount"("stripeSubscriptionId");

ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShortlistEntry" ADD CONSTRAINT "ShortlistEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Shortlist capacity now follows the workspace's plan limit (FR-DEC-05 generalised per plan).
CREATE OR REPLACE FUNCTION enforce_shortlist_capacity() RETURNS trigger AS $$
DECLARE lim INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW."workspaceId"::text));
  SELECT "shortlistLimit" INTO lim FROM "Workspace" WHERE "id" = NEW."workspaceId";
  IF (SELECT count(*) FROM "ShortlistEntry" WHERE "workspaceId" = NEW."workspaceId") >= COALESCE(lim, 10) THEN
    RAISE EXCEPTION 'SHORTLIST_FULL' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
