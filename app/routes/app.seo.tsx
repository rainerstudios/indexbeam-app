import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useEffect, useState } from "react";
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
  Banner,
  Box,
  ProgressBar,
  EmptyState,
  Icon,
} from "@shopify/polaris";
import {
  TargetIcon,
  HashtagIcon,
  SearchIcon,
} from "@shopify/polaris-icons";

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
    (r) => r.mentionsCompetitor,
  ).length;
  const mentionScore =
    allResults.length > 0
      ? Math.round((brandMentions / allResults.length) * 100)
      : 0;

  const competitorStats: Record<
    string,
    { mentions: number; avgRank: number | null }
  > = {};
  for (const comp of store.competitors) {
    const compResults = allResults.filter(
      (r) =>
        r.mentionsCompetitor && r.domain && r.domain.includes(comp.domain),
    );
    const ranks = compResults
      .map((r) => r.rankPosition)
      .filter((r): r is number => r !== null);
    competitorStats[comp.domain] = {
      mentions: compResults.length,
      avgRank:
        ranks.length > 0
          ? Math.round(
              (ranks.reduce((a, b) => a + b, 0) / ranks.length) * 10,
            ) / 10
          : null,
    };
  }

  return {
    queries,
    mentionScore,
    storePlan: store.plan,
    competitors: store.competitors,
    competitorStats,
    hasBingSearch: !!store.bingSearchApiKey || !!process.env.SEARXNG_URL,
    brandMentionCount: brandMentions,
    competitorMentionCount: competitorMentions,
    totalResultsScanned: allResults.length,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const store = await prisma.store.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!store) return { error: "Store not found" };

  if (intent === "add-keyword") {
    const keyword = formData.get("keyword") as string;
    if (!keyword) return { error: "Keyword is required" };

    const { checkKeywordLimit } = await import(
      "../lib/plan-limits.server"
    );
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
    if (!store.bingSearchApiKey && !process.env.SEARXNG_URL) {
      return {
        error:
          "Search scanning is not available. Please contact support.",
      };
    }
    try {
      const { runVisibilityScan } = await import(
        "../services/visibility.server"
      );
      await runVisibilityScan(store.id);
      return {
        success: true,
        message: "Search scan complete. Results updated.",
      };
    } catch (err) {
      return { error: `Scan failed: ${(err as Error).message}` };
    }
  }

  return null;
};

export default function SeoPage() {
  const {
    queries,
    mentionScore,
    competitors,
    competitorStats,
    hasBingSearch,
    brandMentionCount,
    competitorMentionCount,
    totalResultsScanned,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";
  const actionData = fetcher.data as any;
  const [keywordValue, setKeywordValue] = useState("");

  useEffect(() => {
    if (actionData?.success && actionData.message) {
      (window as any).shopify?.toast?.show?.(actionData.message);
      if (actionData.message.includes("added")) setKeywordValue("");
    }
    if (actionData?.error) {
      (window as any).shopify?.toast?.show?.(actionData.error, {
        isError: true,
      });
    }
  }, [actionData]);

  // Keyword table rows
  const keywordRows = queries.map((q: any) => {
    const results = q.results || [];
    const brandResult = results.find((r: any) => r.mentionsBrand);
    const compResult = results.find((r: any) => r.mentionsCompetitor);
    const latestResult = results[0];
    return [
      <Text as="span" variant="bodyMd" fontWeight="semibold" key={q.id}>
        {q.keyword}
      </Text>,
      <Badge
        key={`brand-${q.id}`}
        tone={brandResult ? "success" : "critical"}
      >
        {brandResult ? "Yes" : "No"}
      </Badge>,
      brandResult?.rankPosition ?? "\u2014",
      compResult ? (
        <Badge key={`comp-${q.id}`} tone="attention">
          {compResult.domain} (#{compResult.rankPosition})
        </Badge>
      ) : (
        <Badge key={`comp-${q.id}`} tone="success">
          None
        </Badge>
      ),
      latestResult?.checkedAt
        ? new Date(latestResult.checkedAt).toLocaleDateString()
        : "Never",
      <fetcher.Form
        method="post"
        key={`rm-${q.id}`}
        style={{ display: "inline" }}
      >
        <input type="hidden" name="intent" value="remove-keyword" />
        <input type="hidden" name="queryId" value={q.id} />
        <Button variant="plain" tone="critical" submit>
          Remove
        </Button>
      </fetcher.Form>,
    ];
  });

  // Competitor comparison rows
  const competitorRows = [
    [
      <Text as="span" fontWeight="bold" key="you">
        Your Store
      </Text>,
      String(brandMentionCount || 0),
      "\u2014",
      <Badge key="you-badge" tone="success">
        You
      </Badge>,
    ],
    ...(competitors as any[]).map((comp) => {
      const stats = (competitorStats as any)[comp.domain];
      const diff =
        stats?.mentions != null
          ? (brandMentionCount as number) - stats.mentions
          : null;
      return [
        comp.domain,
        String(stats?.mentions ?? 0),
        stats?.avgRank ?? "\u2014",
        diff !== null ? (
          <Badge
            key={`diff-${comp.id}`}
            tone={
              diff > 0 ? "success" : diff < 0 ? "critical" : "attention"
            }
          >
            {diff > 0
              ? `You lead by ${diff}`
              : diff < 0
                ? `Behind by ${Math.abs(diff)}`
                : "Tied"}
          </Badge>
        ) : (
          "\u2014"
        ),
      ];
    }),
  ];

  return (
    <s-page heading="SEO">
      <ClientOnly
        fallback={
          <s-card>
            <s-box padding="base">
              <s-text>Loading...</s-text>
            </s-box>
          </s-card>
        }
      >
        {() => (
          <PolarisProvider>
            <BlockStack gap="600">
              {/* ═══════ SECTION 1: SEARCH RANKINGS ═══════ */}
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">
                  Search Rankings
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Track where your store ranks in web search results
                  across Google, Bing, and DuckDuckGo.
                </Text>

                {!hasBingSearch && (
                  <Banner
                    title="Search scanning unavailable"
                    tone="warning"
                  >
                    <Text as="p" variant="bodyMd">
                      Search ranking scanning is being configured.
                    </Text>
                  </Banner>
                )}

                {/* Score Cards */}
                <InlineGrid columns={{ xs: 2, md: 4 }} gap="400">
                  <Card>
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center">
                        <div style={{ background: "#e8f5e9", borderRadius: "6px", width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon source={TargetIcon} />
                        </div>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Brand Mention Score
                        </Text>
                      </InlineStack>
                      <Text as="p" variant="heading2xl">
                        <span
                          style={{
                            color:
                              mentionScore >= 50
                                ? "#22c55e"
                                : mentionScore >= 20
                                  ? "#eab308"
                                  : "#ef4444",
                          }}
                        >
                          {mentionScore}%
                        </span>
                      </Text>
                      <ProgressBar
                        progress={mentionScore}
                        size="small"
                        tone={
                          mentionScore >= 50
                            ? "primary"
                            : ("highlight" as any)
                        }
                      />
                    </BlockStack>
                  </Card>
                  <Card>
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center">
                        <div style={{ background: "#e0f0ff", borderRadius: "6px", width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon source={HashtagIcon} />
                        </div>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Keywords Tracked
                        </Text>
                      </InlineStack>
                      <Text as="p" variant="heading2xl">
                        {queries.length}
                      </Text>
                    </BlockStack>
                  </Card>
                  <Card>
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center">
                        <div style={{ background: "#e0f0ff", borderRadius: "6px", width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon source={SearchIcon} />
                        </div>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Brand Appearances
                        </Text>
                      </InlineStack>
                      <Text as="p" variant="heading2xl">
                        {brandMentionCount || 0}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        out of {totalResultsScanned || 0} results
                      </Text>
                    </BlockStack>
                  </Card>
                  <Card>
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center">
                        <div style={{ background: "#fce4ec", borderRadius: "6px", width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon source={TargetIcon} />
                        </div>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Competitor Appearances
                        </Text>
                      </InlineStack>
                      <Text as="p" variant="heading2xl">
                        {competitorMentionCount || 0}
                      </Text>
                    </BlockStack>
                  </Card>
                </InlineGrid>

                {/* Competitor Comparison */}
                {(competitors as any[]).length > 0 && (
                  <Card padding="0">
                    <Box padding="400" paddingBlockEnd="0">
                      <Text as="h2" variant="headingMd">
                        Competitor Visibility
                      </Text>
                    </Box>
                    <DataTable
                      columnContentTypes={[
                        "text",
                        "numeric",
                        "numeric",
                        "text",
                      ]}
                      headings={[
                        "Domain",
                        "Appearances",
                        "Avg Rank",
                        "vs You",
                      ]}
                      rows={competitorRows}
                      hoverable
                    />
                  </Card>
                )}

                {/* Add Keyword */}
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                      Add Keyword
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Track how your brand and competitors appear in web
                      search results for these terms.
                    </Text>
                    <fetcher.Form method="post">
                      <input
                        type="hidden"
                        name="intent"
                        value="add-keyword"
                      />
                      <InlineStack
                        gap="300"
                        blockAlign="end"
                        wrap={false}
                      >
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
                                loading={
                                  isSubmitting &&
                                  fetcher.formData?.get("intent") ===
                                    "add-keyword"
                                }
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
                    <InlineStack
                      align="space-between"
                      blockAlign="center"
                    >
                      <Text as="h2" variant="headingMd">
                        Tracked Keywords
                      </Text>
                      <fetcher.Form method="post">
                        <input
                          type="hidden"
                          name="intent"
                          value="run-scan"
                        />
                        <Button
                          submit
                          disabled={!hasBingSearch}
                          loading={
                            isSubmitting &&
                            fetcher.formData?.get("intent") ===
                              "run-scan"
                          }
                        >
                          Run Scan Now
                        </Button>
                      </fetcher.Form>
                    </InlineStack>
                  </Box>
                  {keywordRows.length > 0 ? (
                    <DataTable
                      columnContentTypes={[
                        "text",
                        "text",
                        "numeric",
                        "text",
                        "text",
                        "text",
                      ]}
                      headings={[
                        "Keyword",
                        "Brand Found",
                        "Best Rank",
                        "Competitor",
                        "Last Checked",
                        "",
                      ]}
                      rows={keywordRows}
                      hoverable
                    />
                  ) : (
                    <Box padding="800">
                      <EmptyState
                        heading="No keywords tracked yet"
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                      >
                        <Text as="p" tone="subdued">
                          Add a keyword above to start monitoring your
                          search rankings.
                        </Text>
                      </EmptyState>
                    </Box>
                  )}
                </Card>
              </BlockStack>
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
