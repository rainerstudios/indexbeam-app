/*
  Warnings:

  - You are about to drop the column `eventType` on the `BillingEvent` table. All the data in the column will be lost.
  - Added the required column `type` to the `BillingEvent` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BillingEvent" DROP COLUMN "eventType",
ADD COLUMN     "details" TEXT,
ADD COLUMN     "type" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "SchemaAudit" ADD COLUMN     "hasBreadcrumbSchema" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasFaqSchema" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasOfferSchema" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasOrganizationSchema" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "ga4ApiSecret" TEXT,
ADD COLUMN     "ga4Credentials" TEXT,
ADD COLUMN     "ga4MeasurementId" TEXT,
ADD COLUMN     "ga4PropertyId" TEXT,
ADD COLUMN     "llmsTxtAutoGenerate" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "llmsTxtContent" TEXT,
ADD COLUMN     "yandexWebmasterToken" TEXT;
