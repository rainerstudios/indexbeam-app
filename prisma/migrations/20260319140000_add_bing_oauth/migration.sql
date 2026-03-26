-- AlterTable
ALTER TABLE "Store" ADD COLUMN "bingAccessToken" TEXT,
ADD COLUMN "bingRefreshToken" TEXT,
ADD COLUMN "bingTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "bingEmail" TEXT;
