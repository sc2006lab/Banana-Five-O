CREATE TABLE "SyncLease" (
  "sourceId" TEXT PRIMARY KEY,
  "owner" UUID NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
