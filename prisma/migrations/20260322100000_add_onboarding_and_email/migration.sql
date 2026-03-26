-- AlterTable
ALTER TABLE "Store" ADD COLUMN "onboardingDismissed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Store" ADD COLUMN "lastDashboardVisit" TIMESTAMP(3);
ALTER TABLE "Store" ADD COLUMN "emailDigestEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Store" ADD COLUMN "merchantEmail" TEXT;
