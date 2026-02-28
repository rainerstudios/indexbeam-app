-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "googleAccessToken" TEXT,
ADD COLUMN     "googleEmail" TEXT,
ADD COLUMN     "googleRefreshToken" TEXT,
ADD COLUMN     "googleScopes" TEXT,
ADD COLUMN     "googleTokenExpiresAt" TIMESTAMP(3);
