-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('INTERESTED', 'PREPARING', 'APPLIED', 'AWARDED', 'PASSED');

-- CreateTable
CREATE TABLE "OpportunityWatch" (
    "catalogId" TEXT NOT NULL,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'INTERESTED',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpportunityWatch_pkey" PRIMARY KEY ("catalogId")
);

-- CreateIndex
CREATE INDEX "OpportunityWatch_status_idx" ON "OpportunityWatch"("status");

-- AlterTable
ALTER TABLE "Startup" ADD COLUMN "outreach" TEXT NOT NULL DEFAULT '',
ADD COLUMN "outreachAt" TIMESTAMP(3);
