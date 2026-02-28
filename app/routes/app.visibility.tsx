import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher, useSearchParams } from "react-router";
import { useCallback, useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { ClientOnly } from "../components/ClientOnly";
import { PolarisProvider } from "../components/PolarisProvider";
import {
  Card,
  BlockStack,
  InlineGrid,
  InlineStack,
  Text,
  TextField,
  Button,
  Badge,
  DataTable,
  Tabs,
  Banner,
  Box,
  ProgressBar,
  EmptyState,
  Divider,
} from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await prisma.store.findUnique({
    where: { shopDomain: session.shop },
    include: { competitors: true },
  });
  if (!store)
    return {
      queries: [],
      mentionScore: 0,
      storePlan: "free",
      competitors: [],
      competitorStats: {},
      hasBingSearch: false,
      brandMentionCount: 0,
      competitorMentionCount: 0,
      totalResultsScanned: 0,
      audits: [],
      averageScore: 0,
      aiTraffic: null as null | { totalAISessions: number; totalAIUsers: number; aiShareOfTotal: number; sources: { source: string; sessions: number }[]; topPages: { pagePath: string; sessions: number }[] },
    };

  const queries = await prisma.visibilityQuery.findMany({
    where: { storeId: store.id },
    include: {
      results: { orderBy: { checkedAt: "desc" }, take: 20 },
    },
  });

  const allResults = await prisma.visibilityResult.findMany({
    where: { query: { storeId: store.id } },
    orderBy: { checkedAt: "desc" },
    take: 200,
  });
  const brandMentions = allResults.filter((r) => r.mentionsBrand).length;
  const competitorMentions = allResults.filter(
    (r) => r.mentionsCompetitor
  ).length;
  const mentionScore =
    allResults.length > 0
      ? Math.round((brandMentions / allResults.length) * 100)
      : 0;

  const competitorStats: Record<string, { mentions: number; avgRank: number | null }> = {};
  for (const comp of store.competitors) {
    const compResults = allResults.filter(
      (r) => r.mentionsCompetitor && r.domain && r.domain.includes(comp.domain)
    );
    const ranks = compResults
      .map((r) => r.rankPosition)
      .filter((r): r is number => r !== null);
    competitorStats[comp.domain] = {
      mentions: compResults.length,
      avgRank:
        ranks.length > 0
          ? Math.round((ranks.reduce((a, b) => a + b, 0) / ranks.length) * 10) / 10
          : null,
    };
  }

  const audits = await prisma.schemaAudit.findMany({
    where: { storeId: store.id },
    orderBy: { scannedAt: "desc" },
    take: 50,
  });
  const averageScore =
    audits.length > 0
      ? Math.round(audits.reduce((sum, a) => sum + a.score, 0) / audits.length)
      : 0;

  // Fetch AI traffic if GA4 is connected
  let aiTraffic: null | { totalAISessions: number; totalAIUsers: number; aiShareOfTotal: number; sources: { source: string; sessions: number }[]; topPages: { pagePath: string; sessions: number }[] } = null;
  const hasGa4 = !!store.ga4PropertyId && (!!store.ga4Credentials || !!store.googleRefreshToken);
  if (hasGa4) {
    try {
      const { getAITrafficSummary, getAITrafficByPage } = await import("../services/ga4.server");
      const { getGoogleAccessToken } = await import("../lib/google-oauth.server");
      const { decrypt } = await import("../lib/encryption.server");
      const oauthToken = await getGoogleAccessToken(store.id);
      const creds = oauthToken || JSON.parse(decrypt(store.ga4Credentials!));

      const [summary, pages] = await Promise.all([
        getAITrafficSummary(creds, store.ga4PropertyId!, 30),
        getAITrafficByPage(creds, store.ga4PropertyId!, 30),
      ]);

      aiTraffic = {
        totalAISessions: summary.totalAISessions,
        totalAIUsers: summary.totalAIUsers,
        aiShareOfTotal: summary.aiShareOfTotal,
        sources: summary.sources.map((s) => ({ source: s.source, sessions: s.sessions })),
        topPages: pages.slice(0, 10).map((p) => ({ pagePath: p.pagePath, sessions: p.sessions })),
      };
    } catch {}
  }

  return {
    queries,
    mentionScore,
    storePlan: store.plan,
    competitors: store.competitors,
    competitorStats,
    hasBingSearch: !!store.bingSearchApiKey || !!process.env.BING_SEARCH_API_KEY,
    brandMentionCount: brandMentions,
    competitorMentionCount: competitorMentions,
    totalResultsScanned: allResults.length,
    audits: audits.map((a) => ({
      ...a,
      scannedAt: a.scannedAt.toISOString(),
    })),
    averageScore,
    aiTraffic,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const store = await prisma.store.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!store) return { error: "Store not found" };

  if (intent === "add-keyword") {
    const keyword = formData.get("keyword") as string;
    if (!keyword) return { error: "Keyword is required" };

    const { checkKeywordLimit } = await import("../lib/plan-limits.server");
    const limit = await checkKeywordLimit(store.id, store.plan);
    if (!limit.allowed)
      return {
        error: `Keyword limit reached (${limit.current}/${limit.max}). Upgrade your plan.`,
      };

    await prisma.visibilityQuery.create({
      data: { storeId: store.id, keyword },
    });
    return { success: true, message: `Keyword "${keyword}" added.` };
  }

  if (intent === "remove-keyword") {
    const queryId = formData.get("queryId") as string;
    await prisma.visibilityQuery.delete({ where: { id: queryId } });
    return { success: true, message: "Keyword removed." };
  }

  if (intent === "run-scan") {
    if (!store.bingSearchApiKey && !process.env.BING_SEARCH_API_KEY) {
      return {
        error: "Visibility scanning is not available. Please contact support.",
      };
    }
    const { visibilityScanQueue } = await import("../jobs/queue.server");
    await visibilityScanQueue.add("scan", { storeId: store.id });
    return {
      success: true,
      message: "Visibility scan queued. Results will appear shortly.",
    };
  }

  if (intent === "audit-url") {
    const url = formData.get("url") as string;
    if (!url) return { error: "URL is required" };

    try {
      const { scrapeUrl, analyzeStructuredData } = await import(
        "../services/firecrawl.server"
      );
      const result = await scrapeUrl(url);
      const htmlContent = result.html || result.markdown || "";
      if (!htmlContent) {
        return { error: "Could not scrape the URL. Check that it's accessible." };
      }

      const analysis = analyzeStructuredData(htmlContent);

      await prisma.schemaAudit.create({
        data: {
          storeId: store.id,
          url,
          hasProductSchema: analysis.hasProductSchema,
          hasReviewSchema: analysis.hasReviewSchema,
          hasFaqSchema: analysis.hasFaqSchema,
          hasOrganizationSchema: analysis.hasOrganizationSchema,
          hasBreadcrumbSchema: analysis.hasBreadcrumbSchema,
          hasOfferSchema: analysis.hasOfferSchema,
          missingFields: JSON.stringify(analysis.missingFields),
          score: analysis.score,
        },
      });

      await prisma.activityLog.create({
        data: {
          storeId: store.id,
          type: "schema_audit",
          message: `Schema audit for ${url}: score ${analysis.score}/100`,
        },
      });

      return {
        success: true,
        message: `Schema audit complete: ${analysis.score}/100 score`,
      };
    } catch (err) {
      return { error: `Audit failed: ${(err as Error).message}` };
    }
  }

  if (intent === "audit-all-products") {
    try {
      const response = await admin.graphql(
        `#graphql
        query { products(first: 10) { nodes { handle } } }`
      );
      const data: any = await response.json();
      const products = data.data?.products?.nodes || [];

      if (products.length === 0) {
        return { error: "No products found in your store." };
      }

      const { scrapeUrl, analyzeStructuredData } = await import(
        "../services/firecrawl.server"
      );

      let audited = 0;
      let totalScore = 0;

      for (const product of products) {
        const url = `https://${session.shop}/products/${product.handle}`;
        try {
          const result = await scrapeUrl(url);
          const htmlContent = result.html || result.markdown || "";
          const analysis = analyzeStructuredData(htmlContent);

          await prisma.schemaAudit.create({
            data: {
              storeId: store.id,
              url,
              hasProductSchema: analysis.hasProductSchema,
              hasReviewSchema: analysis.hasReviewSchema,
              hasFaqSchema: analysis.hasFaqSchema,
              hasOrganizationSchema: analysis.hasOrganizationSchema,
              hasBreadcrumbSchema: analysis.hasBreadcrumbSchema,
              hasOfferSchema: analysis.hasOfferSchema,
              missingFields: JSON.stringify(analysis.missingFields),
              score: analysis.score,
            },
          });

          audited++;
          totalScore += analysis.score;
        } catch (err) {
          console.error(`Schema audit failed for ${url}:`, err);
        }
      }

      const avgScore = audited > 0 ? Math.round(totalScore / audited) : 0;

      await prisma.activityLog.create({
        data: {
          storeId: store.id,
          type: "schema_audit",
          message: `Batch schema audit: ${audited} pages, avg score ${avgScore}/100`,
        },
      });

      return {
        success: true,
        message: `Audited ${audited} products. Average schema score: ${avgScore}/100`,
      };
    } catch (err) {
      return { error: `Batch audit failed: ${(err as Error).message}` };
    }
  }

  return null;
};

function ScoreIndicator({ score }: { score: number }) {
  const tone = score >= 80 ? "success" : score >= 40 ? "attention" : "critical";
  return (
    <InlineStack gap="200" blockAlign="center" wrap={false}>
      <div style={{ width: 60 }}>
        <ProgressBar
          progress={score}
          size="small"
          tone={tone === "success" ? "primary" : tone === "attention" ? "highlight" as any : "critical"}
        />
      </div>
      <Badge tone={tone} size="small">{score}%</Badge>
    </InlineStack>
  );
}

export default function VisibilityPage() {
  const {
    queries,
    mentionScore,
    competitors,
    competitorStats,
    hasBingSearch,
    brandMentionCount,
    competitorMentionCount,
    totalResultsScanned,
    audits,
    averageScore,
    aiTraffic,
  } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";
  const actionData = fetcher.data as any;
  const [keywordValue, setKeywordValue] = useState("");
  const [auditUrlValue, setAuditUrlValue] = useState("");
  const [selectedTab, setSelectedTab] = useState(() => {
    const tab = searchParams.get("tab");
    if (tab === "schema") return 1;
    if (tab === "ai-traffic") return 2;
    return 0;
  });

  useEffect(() => {
    if (actionData?.success && actionData.message) {
      (window as any).shopify?.toast?.show?.(actionData.message);
      if (actionData.message.includes("added")) setKeywordValue("");
      if (actionData.message.includes("audit")) setAuditUrlValue("");
    }
    if (actionData?.error) {
      (window as any).shopify?.toast?.show?.(actionData.error, { isError: true });
    }
  }, [actionData]);

  const handleTabChange = useCallback((index: number) => {
    setSelectedTab(index);
    const tabKeys = ["keywords", "schema", "ai-traffic"];
    setSearchParams({ tab: tabKeys[index] || "keywords" });
  }, [setSearchParams]);

  const tabs = [
    { id: "keywords", content: "Keywords & Mentions" },
    { id: "schema", content: `Schema Audit (${audits.length})` },
    { id: "ai-traffic", content: "AI Traffic" },
  ];

  // Keyword table rows
  const keywordRows = queries.map((q: any) => {
    const results = q.results || [];
    const brandResult = results.find((r: any) => r.mentionsBrand);
    const compResult = results.find((r: any) => r.mentionsCompetitor);
    const latestResult = results[0];
    return [
      <Text as="span" variant="bodyMd" fontWeight="semibold" key={q.id}>{q.keyword}</Text>,
      <Badge key={`brand-${q.id}`} tone={brandResult ? "success" : "critical"}>
        {brandResult ? "Yes" : "No"}
      </Badge>,
      brandResult?.rankPosition ?? "—",
      compResult ? (
        <Badge key={`comp-${q.id}`} tone="attention">
          {compResult.domain} (#{compResult.rankPosition})
        </Badge>
      ) : (
        <Badge key={`comp-${q.id}`} tone="success">None</Badge>
      ),
      latestResult?.checkedAt
        ? new Date(latestResult.checkedAt).toLocaleDateString()
        : "Never",
      <fetcher.Form method="post" key={`rm-${q.id}`} style={{ display: "inline" }}>
        <input type="hidden" name="intent" value="remove-keyword" />
        <input type="hidden" name="queryId" value={q.id} />
        <Button variant="plain" tone="critical" submit>Remove</Button>
      </fetcher.Form>,
    ];
  });

  // Competitor comparison rows
  const competitorRows = [
    [
      <Text as="span" fontWeight="bold" key="you">Your Store</Text>,
      String(brandMentionCount || 0),
      "—",
      <Badge key="you-badge" tone="success">You</Badge>,
    ],
    ...(competitors as any[]).map((comp) => {
      const stats = (competitorStats as any)[comp.domain];
      const diff = stats?.mentions != null ? (brandMentionCount as number) - stats.mentions : null;
      return [
        comp.domain,
        String(stats?.mentions ?? 0),
        stats?.avgRank ?? "—",
        diff !== null ? (
          <Badge
            key={`diff-${comp.id}`}
            tone={diff > 0 ? "success" : diff < 0 ? "critical" : "attention"}
          >
            {diff > 0 ? `You lead by ${diff}` : diff < 0 ? `Behind by ${Math.abs(diff)}` : "Tied"}
          </Badge>
        ) : "—",
      ];
    }),
  ];

  // Audit table rows
  const auditRows = audits.map((audit: any) => {
    const missing = audit.missingFields ? JSON.parse(audit.missingFields) : [];
    const foundSchemas = [
      audit.hasProductSchema && "Product",
      audit.hasReviewSchema && "Review",
      audit.hasFaqSchema && "FAQ",
      audit.hasOrganizationSchema && "Org",
      audit.hasBreadcrumbSchema && "Breadcrumb",
      audit.hasOfferSchema && "Offer",
    ].filter(Boolean);

    return [
      <Text as="span" variant="bodySm" truncate key={audit.id}>
        {audit.url.replace(/^https?:\/\//, "").substring(0, 45)}
        {audit.url.replace(/^https?:\/\//, "").length > 45 ? "..." : ""}
      </Text>,
      <ScoreIndicator key={`score-${audit.id}`} score={audit.score} />,
      <InlineStack key={`found-${audit.id}`} gap="100" wrap>
        {foundSchemas.map((s) => (
          <Badge key={String(s)} tone="success" size="small">{String(s)}</Badge>
        ))}
      </InlineStack>,
      <InlineStack key={`missing-${audit.id}`} gap="100" wrap>
        {missing.length > 0 ? (
          missing.map((m: string) => (
            <Badge key={m} tone="critical" size="small">{m.replace(" schema", "")}</Badge>
          ))
        ) : (
          <Badge tone="success" size="small">All present</Badge>
        )}
      </InlineStack>,
      new Date(audit.scannedAt).toLocaleDateString(),
    ];
  });

  return (
    <s-page heading="AI Visibility">
      <ClientOnly
        fallback={<s-card><s-box padding="base"><s-text>Loading...</s-text></s-box></s-card>}
      >
        {() => (
          <PolarisProvider>
            <BlockStack gap="400">
              <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
                <Box paddingBlockStart="400">
                  {/* ——— Keywords & Mentions Tab ——— */}
                  {selectedTab === 0 && (
                    <BlockStack gap="400">
                      {!hasBingSearch && (
                        <Banner
                          title="Visibility scanning unavailable"
                          tone="warning"
                        >
                          <Text as="p" variant="bodyMd">
                            AI visibility scanning is being set up. Please check back soon.
                          </Text>
                        </Banner>
                      )}

                      {/* Score Cards */}
                      <InlineGrid columns={{ xs: 2, md: 4 }} gap="400">
                        <Card>
                          <BlockStack gap="200">
                            <Text as="p" variant="bodySm" tone="subdued">Brand Mention Score</Text>
                            <Text as="p" variant="heading2xl">
                              <span style={{
                                color: mentionScore >= 50 ? "#22c55e" : mentionScore >= 20 ? "#eab308" : "#ef4444",
                              }}>
                                {mentionScore}%
                              </span>
                            </Text>
                            <ProgressBar
                              progress={mentionScore}
                              size="small"
                              tone={mentionScore >= 50 ? "primary" : "highlight" as any}
                            />
                          </BlockStack>
                        </Card>
                        <Card>
                          <BlockStack gap="200">
                            <Text as="p" variant="bodySm" tone="subdued">Keywords Tracked</Text>
                            <Text as="p" variant="heading2xl">{queries.length}</Text>
                          </BlockStack>
                        </Card>
                        <Card>
                          <BlockStack gap="200">
                            <Text as="p" variant="bodySm" tone="subdued">Brand Appearances</Text>
                            <Text as="p" variant="heading2xl">{brandMentionCount || 0}</Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              out of {totalResultsScanned || 0} results
                            </Text>
                          </BlockStack>
                        </Card>
                        <Card>
                          <BlockStack gap="200">
                            <Text as="p" variant="bodySm" tone="subdued">Competitor Appearances</Text>
                            <Text as="p" variant="heading2xl">{competitorMentionCount || 0}</Text>
                          </BlockStack>
                        </Card>
                      </InlineGrid>

                      {/* Competitor Comparison */}
                      {(competitors as any[]).length > 0 && (
                        <Card padding="0">
                          <Box padding="400" paddingBlockEnd="0">
                            <Text as="h2" variant="headingMd">Competitor Visibility</Text>
                          </Box>
                          <DataTable
                            columnContentTypes={["text", "numeric", "numeric", "text"]}
                            headings={["Domain", "Appearances", "Avg Rank", "vs You"]}
                            rows={competitorRows}
                            hoverable
                          />
                        </Card>
                      )}

                      {/* Add Keyword */}
                      <Card>
                        <BlockStack gap="300">
                          <Text as="h2" variant="headingMd">Add Keyword</Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Track how your brand and competitors appear when people search for these terms in AI search.
                          </Text>
                          <fetcher.Form method="post">
                            <input type="hidden" name="intent" value="add-keyword" />
                            <InlineStack gap="300" blockAlign="end" wrap={false}>
                              <div style={{ flexGrow: 1 }}>
                                <TextField
                                  label="Keyword"
                                  name="keyword"
                                  value={keywordValue}
                                  onChange={setKeywordValue}
                                  placeholder="best wireless headphones 2026"
                                  autoComplete="off"
                                  connectedRight={
                                    <Button
                                      variant="primary"
                                      submit
                                      loading={isSubmitting && fetcher.formData?.get("intent") === "add-keyword"}
                                    >
                                      Add
                                    </Button>
                                  }
                                />
                              </div>
                            </InlineStack>
                          </fetcher.Form>
                        </BlockStack>
                      </Card>

                      {/* Keyword Table */}
                      <Card padding="0">
                        <Box padding="400" paddingBlockEnd="0">
                          <InlineStack align="space-between" blockAlign="center">
                            <Text as="h2" variant="headingMd">Tracked Keywords</Text>
                            <fetcher.Form method="post">
                              <input type="hidden" name="intent" value="run-scan" />
                              <Button
                                submit
                                disabled={!hasBingSearch}
                                loading={isSubmitting && fetcher.formData?.get("intent") === "run-scan"}
                              >
                                Run Scan Now
                              </Button>
                            </fetcher.Form>
                          </InlineStack>
                        </Box>
                        {keywordRows.length > 0 ? (
                          <DataTable
                            columnContentTypes={["text", "text", "numeric", "text", "text", "text"]}
                            headings={["Keyword", "Brand Found", "Best Rank", "Competitor", "Last Checked", ""]}
                            rows={keywordRows}
                            hoverable
                          />
                        ) : (
                          <Box padding="800">
                            <EmptyState heading="No keywords tracked yet" image="">
                              <Text as="p" tone="subdued">
                                Add a keyword above to start monitoring your AI search visibility.
                              </Text>
                            </EmptyState>
                          </Box>
                        )}
                      </Card>
                    </BlockStack>
                  )}

                  {/* ——— Schema Audit Tab ——— */}
                  {selectedTab === 1 && (
                    <BlockStack gap="400">
                      {/* Summary */}
                      <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
                        <Card>
                          <BlockStack gap="200">
                            <Text as="p" variant="bodySm" tone="subdued">Average Schema Score</Text>
                            <Text as="p" variant="heading2xl">{averageScore}/100</Text>
                            <ProgressBar
                              progress={averageScore}
                              size="small"
                              tone={averageScore >= 80 ? "primary" : "highlight" as any}
                            />
                          </BlockStack>
                        </Card>
                        <Card>
                          <BlockStack gap="200">
                            <Text as="p" variant="bodySm" tone="subdued">Pages Audited</Text>
                            <Text as="p" variant="heading2xl">{audits.length}</Text>
                          </BlockStack>
                        </Card>
                        <Card>
                          <BlockStack gap="200">
                            <Text as="p" variant="bodySm" tone="subdued">Schema Health</Text>
                            <ScoreIndicator score={averageScore} />
                          </BlockStack>
                        </Card>
                      </InlineGrid>

                      {/* Audit Form */}
                      <Card>
                        <BlockStack gap="300">
                          <Text as="h2" variant="headingMd">Audit a URL</Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Analyze structured data (JSON-LD) on any page. Checks for Product, Review, FAQ, Organization, and Breadcrumb schemas.
                          </Text>
                          <fetcher.Form method="post">
                            <input type="hidden" name="intent" value="audit-url" />
                            <InlineStack gap="300" blockAlign="end" wrap={false}>
                              <div style={{ flexGrow: 1 }}>
                                <TextField
                                  label="URL"
                                  name="url"
                                  value={auditUrlValue}
                                  onChange={setAuditUrlValue}
                                  placeholder="https://your-store.com/products/example"
                                  autoComplete="off"
                                  connectedRight={
                                    <Button
                                      variant="primary"
                                      submit
                                      loading={isSubmitting && fetcher.formData?.get("intent") === "audit-url"}
                                    >
                                      Audit
                                    </Button>
                                  }
                                />
                              </div>
                            </InlineStack>
                          </fetcher.Form>
                          <fetcher.Form method="post">
                            <input type="hidden" name="intent" value="audit-all-products" />
                            <Button
                              submit
                              loading={isSubmitting && fetcher.formData?.get("intent") === "audit-all-products"}
                            >
                              Audit Top 10 Products
                            </Button>
                          </fetcher.Form>
                        </BlockStack>
                      </Card>

                      {/* Audit Results */}
                      <Card padding="0">
                        <Box padding="400" paddingBlockEnd="0">
                          <Text as="h2" variant="headingMd">Audit Results</Text>
                        </Box>
                        {auditRows.length > 0 ? (
                          <DataTable
                            columnContentTypes={["text", "text", "text", "text", "text"]}
                            headings={["URL", "Score", "Found", "Missing", "Scanned"]}
                            rows={auditRows}
                            hoverable
                          />
                        ) : (
                          <Box padding="800">
                            <EmptyState heading="No audits yet" image="">
                              <Text as="p" tone="subdued">
                                Enter a URL above to check its structured data and get recommendations.
                              </Text>
                            </EmptyState>
                          </Box>
                        )}
                      </Card>
                    </BlockStack>
                  )}

                  {/* ——— AI Traffic Tab ——— */}
                  {selectedTab === 2 && (
                    <BlockStack gap="400">
                      {!aiTraffic ? (
                        <Banner title="Connect Google Analytics" tone="info">
                          <Text as="p" variant="bodyMd">
                            Connect your Google account in Settings and select a GA4 property to see AI-referred traffic data.
                          </Text>
                        </Banner>
                      ) : (
                        <>
                          {/* Summary Cards */}
                          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
                            <Card>
                              <BlockStack gap="200">
                                <Text as="p" variant="bodySm" tone="subdued">AI Sessions (30d)</Text>
                                <Text as="p" variant="heading2xl">{aiTraffic.totalAISessions.toLocaleString()}</Text>
                              </BlockStack>
                            </Card>
                            <Card>
                              <BlockStack gap="200">
                                <Text as="p" variant="bodySm" tone="subdued">AI Users (30d)</Text>
                                <Text as="p" variant="heading2xl">{aiTraffic.totalAIUsers.toLocaleString()}</Text>
                              </BlockStack>
                            </Card>
                            <Card>
                              <BlockStack gap="200">
                                <Text as="p" variant="bodySm" tone="subdued">AI Share of Traffic</Text>
                                <Text as="p" variant="heading2xl">
                                  <span style={{ color: aiTraffic.aiShareOfTotal >= 5 ? "#22c55e" : aiTraffic.aiShareOfTotal >= 1 ? "#eab308" : "#6b7280" }}>
                                    {aiTraffic.aiShareOfTotal}%
                                  </span>
                                </Text>
                                <ProgressBar
                                  progress={Math.min(aiTraffic.aiShareOfTotal * 5, 100)}
                                  size="small"
                                  tone="primary"
                                />
                              </BlockStack>
                            </Card>
                          </InlineGrid>

                          {/* AI Sources Breakdown */}
                          <Card padding="0">
                            <Box padding="400" paddingBlockEnd="0">
                              <Text as="h2" variant="headingMd">Traffic by AI Platform</Text>
                            </Box>
                            {aiTraffic.sources.length > 0 ? (
                              <DataTable
                                columnContentTypes={["text", "numeric"]}
                                headings={["AI Platform", "Sessions"]}
                                rows={aiTraffic.sources.map((s) => [
                                  s.source,
                                  s.sessions.toLocaleString(),
                                ])}
                                hoverable
                              />
                            ) : (
                              <Box padding="800">
                                <EmptyState heading="No AI traffic detected yet" image="">
                                  <Text as="p" tone="subdued">
                                    As AI platforms like ChatGPT, Perplexity, and Gemini start referencing your store, traffic will appear here.
                                  </Text>
                                </EmptyState>
                              </Box>
                            )}
                          </Card>

                          {/* Top Landing Pages from AI */}
                          {aiTraffic.topPages.length > 0 && (
                            <Card padding="0">
                              <Box padding="400" paddingBlockEnd="0">
                                <Text as="h2" variant="headingMd">Top Pages from AI Traffic</Text>
                              </Box>
                              <DataTable
                                columnContentTypes={["text", "numeric"]}
                                headings={["Page", "Sessions"]}
                                rows={aiTraffic.topPages.map((p) => [
                                  p.pagePath,
                                  p.sessions.toLocaleString(),
                                ])}
                                hoverable
                              />
                            </Card>
                          )}
                        </>
                      )}
                    </BlockStack>
                  )}
                </Box>
              </Tabs>
            </BlockStack>
          </PolarisProvider>
        )}
      </ClientOnly>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
