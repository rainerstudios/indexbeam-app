-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "indexnowKey" TEXT,
    "bingWebmasterApiKey" TEXT,
    "gscCredentials" TEXT,
    "bingSearchApiKey" TEXT,
    "firecrawlApiKey" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UrlSubmission" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "responseCode" INTEGER,
    "source" TEXT NOT NULL,
    "engine" TEXT NOT NULL DEFAULT 'bing',
    "errorMessage" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UrlSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UrlIndexStatus" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "bingIndexed" BOOLEAN,
    "bingLastCrawl" TIMESTAMP(3),
    "googleIndexed" BOOLEAN,
    "googleLastCrawl" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "crawlErrors" TEXT,

    CONSTRAINT "UrlIndexStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisibilityQuery" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'daily',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisibilityQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisibilityResult" (
    "id" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "rankPosition" INTEGER,
    "domain" TEXT,
    "mentionsBrand" BOOLEAN NOT NULL DEFAULT false,
    "mentionsCompetitor" BOOLEAN NOT NULL DEFAULT false,
    "snippet" TEXT,
    "source" TEXT NOT NULL DEFAULT 'bing',
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisibilityResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "name" TEXT,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorChange" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchemaAudit" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "hasProductSchema" BOOLEAN NOT NULL DEFAULT false,
    "hasReviewSchema" BOOLEAN NOT NULL DEFAULT false,
    "missingFields" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchemaAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "shopifyChargeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_shopDomain_key" ON "Store"("shopDomain");

-- CreateIndex
CREATE INDEX "UrlSubmission_storeId_submittedAt_idx" ON "UrlSubmission"("storeId", "submittedAt");

-- CreateIndex
CREATE INDEX "UrlSubmission_storeId_status_idx" ON "UrlSubmission"("storeId", "status");

-- CreateIndex
CREATE INDEX "UrlIndexStatus_storeId_idx" ON "UrlIndexStatus"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "UrlIndexStatus_storeId_url_key" ON "UrlIndexStatus"("storeId", "url");

-- CreateIndex
CREATE INDEX "VisibilityQuery_storeId_idx" ON "VisibilityQuery"("storeId");

-- CreateIndex
CREATE INDEX "VisibilityResult_queryId_checkedAt_idx" ON "VisibilityResult"("queryId", "checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Competitor_storeId_domain_key" ON "Competitor"("storeId", "domain");

-- CreateIndex
CREATE INDEX "SchemaAudit_storeId_idx" ON "SchemaAudit"("storeId");

-- CreateIndex
CREATE INDEX "ActivityLog_storeId_createdAt_idx" ON "ActivityLog"("storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "UrlSubmission" ADD CONSTRAINT "UrlSubmission_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UrlIndexStatus" ADD CONSTRAINT "UrlIndexStatus_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisibilityQuery" ADD CONSTRAINT "VisibilityQuery_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisibilityResult" ADD CONSTRAINT "VisibilityResult_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "VisibilityQuery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorChange" ADD CONSTRAINT "CompetitorChange_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchemaAudit" ADD CONSTRAINT "SchemaAudit_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingEvent" ADD CONSTRAINT "BillingEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
