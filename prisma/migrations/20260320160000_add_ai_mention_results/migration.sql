-- CreateTable
CREATE TABLE "AIMentionResult" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "mentioned" BOOLEAN NOT NULL DEFAULT false,
    "responseSnippet" TEXT,
    "competitorsMentioned" TEXT,
    "citations" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIMentionResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIMentionResult_storeId_checkedAt_idx" ON "AIMentionResult"("storeId", "checkedAt");

-- CreateIndex
CREATE INDEX "AIMentionResult_storeId_keyword_idx" ON "AIMentionResult"("storeId", "keyword");

-- AddForeignKey
ALTER TABLE "AIMentionResult" ADD CONSTRAINT "AIMentionResult_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
