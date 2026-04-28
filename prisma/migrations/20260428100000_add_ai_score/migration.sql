-- CreateTable
CREATE TABLE "AIScore" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "grade" TEXT NOT NULL,
    "afdocsResults" TEXT NOT NULL DEFAULT '[]',
    "shopifyChecks" TEXT NOT NULL DEFAULT '[]',
    "categoryScores" TEXT NOT NULL DEFAULT '{}',
    "diagnostics" TEXT NOT NULL DEFAULT '[]',
    "resolutions" TEXT NOT NULL DEFAULT '{}',
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AIScore_storeId_key" ON "AIScore"("storeId");

-- AddForeignKey
ALTER TABLE "AIScore" ADD CONSTRAINT "AIScore_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
