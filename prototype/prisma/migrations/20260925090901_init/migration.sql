-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('REGISTERED_USER', 'DATA_ADMINISTRATOR');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "SyncOutcome" AS ENUM ('RUNNING', 'SUCCESS', 'NO_CHANGES', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncTrigger" AS ENUM ('SCHEDULE', 'STARTUP', 'CLI');

-- CreateTable
CREATE TABLE "UserAccount" (
    "id" UUID NOT NULL,
    "displayName" VARCHAR(60) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'REGISTERED_USER',
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "consentGivenAt" TIMESTAMP(3) NOT NULL,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordCredential" (
    "accountId" UUID NOT NULL,
    "saltedHash" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'argon2id',
    "parameters" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordCredential_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "accountId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invalidatedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "accountId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyPreferenceProfile" (
    "accountId" UUID NOT NULL,
    "familyStages" TEXT[],
    "preferredAreas" TEXT[],
    "amenityThresholds" JSONB NOT NULL DEFAULT '{}',
    "wChildcare" INTEGER NOT NULL DEFAULT 3,
    "wSchools" INTEGER NOT NULL DEFAULT 3,
    "wGroceries" INTEGER NOT NULL DEFAULT 3,
    "wHealthcare" INTEGER NOT NULL DEFAULT 3,
    "wGreenSpaces" INTEGER NOT NULL DEFAULT 3,
    "wPublicTransport" INTEGER NOT NULL DEFAULT 3,
    "wCommute" INTEGER NOT NULL DEFAULT 3,
    "wAccessibility" INTEGER NOT NULL DEFAULT 3,
    "confirmedWeights" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyPreferenceProfile_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "PriorityDestination" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "slot" INTEGER NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "queryText" VARCHAR(200) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PriorityDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Neighbourhood" (
    "id" VARCHAR(12) NOT NULL,
    "name" TEXT NOT NULL,
    "planningArea" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "refLat" DOUBLE PRECISION NOT NULL,
    "refLng" DOUBLE PRECISION NOT NULL,
    "boundaryBasis" TEXT NOT NULL,
    "boundary" JSONB NOT NULL,
    "areaSqm" DOUBLE PRECISION NOT NULL,
    "snapshotId" UUID NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Neighbourhood_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" UUID NOT NULL,
    "snapshotId" UUID NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "address" TEXT,
    "postalCode" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeocodeCache" (
    "key" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "address" TEXT,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeocodeCache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ShortlistEntry" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "neighbourhoodId" VARCHAR(12) NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" VARCHAR(500) NOT NULL DEFAULT '',
    "noteUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "ShortlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSourceRegistry" (
    "id" VARCHAR(40) NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "freshnessThresholdDays" INTEGER NOT NULL DEFAULT 31,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'NEVER_RUN',
    "publisherUpdatedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "DataSourceRegistry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetSnapshot" (
    "id" UUID NOT NULL,
    "sourceId" VARCHAR(40) NOT NULL,
    "version" INTEGER NOT NULL,
    "validatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "recordCount" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,

    CONSTRAINT "DatasetSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncHistoryRecord" (
    "id" UUID NOT NULL,
    "sourceId" VARCHAR(40) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "outcome" "SyncOutcome" NOT NULL DEFAULT 'RUNNING',
    "recordsAdded" INTEGER NOT NULL DEFAULT 0,
    "recordsChanged" INTEGER NOT NULL DEFAULT 0,
    "recordsRemoved" INTEGER NOT NULL DEFAULT 0,
    "sanitisedError" TEXT,
    "trigger" "SyncTrigger" NOT NULL,

    CONSTRAINT "SyncHistoryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_email_key" ON "UserAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_accountId_idx" ON "Session"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PriorityDestination_profileId_slot_key" ON "PriorityDestination"("profileId", "slot");

-- CreateIndex
CREATE INDEX "Neighbourhood_planningArea_idx" ON "Neighbourhood"("planningArea");

-- CreateIndex
CREATE INDEX "Facility_snapshotId_idx" ON "Facility"("snapshotId");

-- CreateIndex
CREATE INDEX "Facility_category_idx" ON "Facility"("category");

-- CreateIndex
CREATE UNIQUE INDEX "ShortlistEntry_accountId_neighbourhoodId_key" ON "ShortlistEntry"("accountId", "neighbourhoodId");

-- CreateIndex
CREATE INDEX "DatasetSnapshot_sourceId_active_idx" ON "DatasetSnapshot"("sourceId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetSnapshot_sourceId_version_key" ON "DatasetSnapshot"("sourceId", "version");

-- CreateIndex
CREATE INDEX "SyncHistoryRecord_sourceId_startedAt_idx" ON "SyncHistoryRecord"("sourceId", "startedAt");

-- AddForeignKey
ALTER TABLE "PasswordCredential" ADD CONSTRAINT "PasswordCredential_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyPreferenceProfile" ADD CONSTRAINT "FamilyPreferenceProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorityDestination" ADD CONSTRAINT "PriorityDestination_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FamilyPreferenceProfile"("accountId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "DatasetSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortlistEntry" ADD CONSTRAINT "ShortlistEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortlistEntry" ADD CONSTRAINT "ShortlistEntry_neighbourhoodId_fkey" FOREIGN KEY ("neighbourhoodId") REFERENCES "Neighbourhood"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetSnapshot" ADD CONSTRAINT "DatasetSnapshot_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSourceRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncHistoryRecord" ADD CONSTRAINT "SyncHistoryRecord_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSourceRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────── Business rules enforced in the database (tech-stack recommendation, SRS §5.24) ─────────

-- Criterion weights are integers 0–5 (FR-PREF-05)
ALTER TABLE "FamilyPreferenceProfile"
  ADD CONSTRAINT "weights_range" CHECK (
    "wChildcare" BETWEEN 0 AND 5 AND "wSchools" BETWEEN 0 AND 5 AND "wGroceries" BETWEEN 0 AND 5 AND
    "wHealthcare" BETWEEN 0 AND 5 AND "wGreenSpaces" BETWEEN 0 AND 5 AND "wPublicTransport" BETWEEN 0 AND 5 AND
    "wCommute" BETWEEN 0 AND 5 AND "wAccessibility" BETWEEN 0 AND 5
  );

-- Up to three priority destinations in slots 1–3 (FR-PREF-03)
ALTER TABLE "PriorityDestination" ADD CONSTRAINT "destination_slot_range" CHECK ("slot" BETWEEN 1 AND 3);

-- Private notes are 0–500 characters (FR-DEC-07)
ALTER TABLE "ShortlistEntry" ADD CONSTRAINT "note_length" CHECK (char_length("note") <= 500);

-- Shortlist capacity of ten per account (FR-DEC-05); guards against concurrent inserts
CREATE FUNCTION enforce_shortlist_capacity() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW."accountId"::text));
  IF (SELECT count(*) FROM "ShortlistEntry" WHERE "accountId" = NEW."accountId") >= 10 THEN
    RAISE EXCEPTION 'SHORTLIST_FULL' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shortlist_capacity BEFORE INSERT ON "ShortlistEntry"
  FOR EACH ROW EXECUTE FUNCTION enforce_shortlist_capacity();

-- Only one active validated snapshot per source (FR-RES-01)
CREATE UNIQUE INDEX "one_active_snapshot_per_source" ON "DatasetSnapshot" ("sourceId") WHERE "active";
