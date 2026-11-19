-- CreateTable
CREATE TABLE "OpportunityWatch" (
    "catalogId" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'INTERESTED',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "OpportunityWatch_status_idx" ON "OpportunityWatch"("status");

-- AlterTable
ALTER TABLE "Startup" ADD COLUMN "outreach" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Startup" ADD COLUMN "outreachAt" DATETIME;
