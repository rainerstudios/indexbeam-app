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
  Collapsible,
  Icon,
  Divider,
} from "@shopify/polaris";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ChatIcon,
  SearchIcon,
  PersonIcon,
  ChartVerticalIcon,
  TargetIcon,
} from "@shopify/polaris-icons";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await prisma.store.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!store)
    return {
      queries: [],
      hasPerplexity: false,
      aiTraffic: null as null | {
        totalAISessions: number;
        totalAIUsers: number;
        aiShareOfTotal: number;
        sources: { source: string; sessions: number }[];
        topPages: { pagePath: string; sessions: number }[];
      },
      aiMentionsByKeyword: [] as {
        keyword: string;
        mentioned: boolean;
        responseSnippet: string | null;
        competitorsMentioned: string[];
        checkedAt: string;
      }[],
      aiMentionScore: null as number | null,
      storePlan: "free",
    };

  // Fetch tracked keywords (for "Check All Keywords" count)
  const queries = await prisma.visibilityQuery.findMany({
    where: { storeId: store.id },
    select: { id: true, keyword: true },
  });

  // Fetch AI traffic if GA4 is connected
  let aiTraffic: null | {
    totalAISessions: number;
    totalAIUsers: number;
    aiShareOfTotal: number;
    sources: { source: string; sessions: number }[];
    topPages: { pagePath: string; sessions: number }[];
  } = null;
  const hasGa4 =
    !!store.ga4PropertyId &&
    (!!store.ga4Credentials || !!store.googleRefreshToken);
  if (hasGa4) {
    try {
      const { getAITrafficSummary, getAITrafficByPage } = await import(
        "../services/ga4.server"
      );
      const { getGoogleAccessToken } = await import(
        "../lib/google-oauth.server"
      );
      const { decrypt } = await import("../lib/encryption.server");
      const oauthToken = await getGoogleAccessToken(store.id);
      const creds =
        oauthToken || JSON.parse(decrypt(store.ga4Credentials!));

      const [summary, pages] = await Promise.all([
        getAITrafficSummary(creds, store.ga4PropertyId!, 30),
        getAITrafficByPage(creds, store.ga4PropertyId!, 30),
      ]);

      aiTraffic = {
        totalAISessions: summary.totalAISessions,
        totalAIUsers: summary.totalAIUsers,
        aiShareOfTotal: summary.aiShareOfTotal,
        sources: summary.sources.map((s) => ({
          source: s.source,
          sessions: s.sessions,
        })),
        topPages: pages
          .slice(0, 10)
          .map((p) => ({ pagePath: p.pagePath, sessions: p.sessions })),
      };
    } catch {}
  }

  // Fetch AI mention results grouped by keyword
  const aiMentionResults = await prisma.aIMentionResult.findMany({
    where: { storeId: store.id },
    orderBy: { checkedAt: "desc" },
    take: 100,
  });

  const aiMentionsByKeywordMap: Record<
    string,
    {
      keyword: string;
      mentioned: boolean;
      responseSnippet: string | null;
      competitorsMentioned: string[];
      checkedAt: string;
    }
  > = {};
  for (const result of aiMentionResults) {
    if (!aiMentionsByKeywordMap[result.keyword]) {
      aiMentionsByKeywordMap[result.keyword] = {
        keyword: result.keyword,
        mentioned: result.mentioned,
        responseSnippet: result.responseSnippet,
        competitorsMentioned: result.competitorsMentioned
          ? JSON.parse(result.competitorsMentioned)
          : [],
        checkedAt: result.checkedAt.toISOString(),
      };
    }
  }

  const aiMentionsByKeyword = Object.values(aiMentionsByKeywordMap);
  const aiMentionScore =
    aiMentionsByKeyword.length > 0
      ? Math.round(
          (aiMentionsByKeyword.filter((r) => r.mentioned).length /
            aiMentionsByKeyword.length) *
            100,
        )
      : null;

  return {
    queries,
    hasPerplexity: !!process.env.PERPLEXITY_API_KEY,
    aiTraffic,
    aiMentionsByKeyword,
    aiMentionScore,
    storePlan: store.plan,
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

  if (intent === "check-ai-mentions") {
    const keyword = formData.get("keyword") as string;
    if (!keyword) return { error: "Keyword is required." };

    if (!process.env.PERPLEXITY_API_KEY) {
      return { error: "AI mention checking is not configured." };
    }

    try {
      const { checkAIMentionLimit } = await import(
        "../lib/plan-limits.server"
      );
      const limit = await checkAIMentionLimit(store.id, store.plan);
      if (!limit.allowed) {
        return {
          error: `AI mention limit reached (${limit.current}/${limit.max}). Upgrade your plan.`,
        };
      }

      const { checkAIMention } = await import(
        "../services/perplexity.server"
      );
      const result = await checkAIMention(keyword, store.shopDomain);

      await prisma.aIMentionResult.create({
        data: {
          storeId: store.id,
          keyword,
          mentioned: result.mentioned,
          responseSnippet: result.responseSnippet,
          competitorsMentioned: JSON.stringify(
            result.competitorsMentioned,
          ),
          citations: JSON.stringify(result.citations),
        },
      });

      await prisma.activityLog.create({
        data: {
          storeId: store.id,
          type: "ai_mention_check",
          message: `AI mention check for "${keyword}": ${result.mentioned ? "MENTIONED" : "not mentioned"}`,
          metadata: JSON.stringify({
            keyword,
            mentioned: result.mentioned,
          }),
        },
      });

      return {
        success: true,
        message: result.mentioned
          ? `AI mentions your brand for "${keyword}"`
          : `AI does not mention your brand for "${keyword}"`,
      };
    } catch (err) {
      return { error: `AI check failed: ${(err as Error).message}` };
    }
  }

  if (intent === "check-all-ai-mentions") {
    if (!process.env.PERPLEXITY_API_KEY) {
      return { error: "AI mention checking is not configured." };
    }

    const allQueries = await prisma.visibilityQuery.findMany({
      where: { storeId: store.id },
    });

    if (allQueries.length === 0) {
      return { error: "No keywords to check. Add keywords in the SEO page first." };
    }

    try {
      const { checkAIMentionLimit } = await import(
        "../lib/plan-limits.server"
      );
      const limit = await checkAIMentionLimit(store.id, store.plan);
      if (!limit.allowed) {
        return {
          error: `AI mention limit reached (${limit.current}/${limit.max}). Upgrade your plan.`,
        };
      }

      const { checkAIMention } = await import(
        "../services/perplexity.server"
      );
      let mentioned = 0;
      let checked = 0;

      for (const q of allQueries) {
        const currentLimit = await checkAIMentionLimit(
          store.id,
          store.plan,
        );
        if (!currentLimit.allowed) break;

        try {
          await new Promise((r) => setTimeout(r, 300));
          const result = await checkAIMention(
            q.keyword,
            store.shopDomain,
          );

          await prisma.aIMentionResult.create({
            data: {
              storeId: store.id,
              keyword: q.keyword,
              mentioned: result.mentioned,
              responseSnippet: result.responseSnippet,
              competitorsMentioned: JSON.stringify(
                result.competitorsMentioned,
              ),
              citations: JSON.stringify(result.citations),
            },
          });

          if (result.mentioned) mentioned++;
          checked++;
        } catch (err) {
          console.error(
            `AI mention check failed for "${q.keyword}":`,
            err,
          );
        }
      }

      return {
        success: true,
        message: `AI check complete: ${mentioned}/${checked} keywords mention your brand`,
      };
    } catch (err) {
      return {
        error: `Batch AI check failed: ${(err as Error).message}`,
      };
    }
  }

  return null;
};

export default function VisibilityPage() {
  const {
    queries,
    hasPerplexity,
    aiTraffic,
    aiMentionsByKeyword,
    aiMentionScore,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";
  const actionData = fetcher.data as any;
  const [aiCheckKeyword, setAiCheckKeyword] = useState("");
  const [aiTrafficOpen, setAiTrafficOpen] = useState(false);
  const [expandedAiRow, setExpandedAiRow] = useState<string | null>(null);

  useEffect(() => {
    if (actionData?.success && actionData.message) {
      (window as any).shopify?.toast?.show?.(actionData.message);
      if (actionData.message.includes("AI")) setAiCheckKeyword("");
    }
    if (actionData?.error) {
      (window as any).shopify?.toast?.show?.(actionData.error, {
        isError: true,
      });
    }
  }, [actionData]);

  // AI Mention unique competitors count
  const allAiCompetitors = new Set<string>();
  for (const m of aiMentionsByKeyword) {
    for (const c of m.competitorsMentioned) {
      allAiCompetitors.add(c);
    }
  }

  return (
    <s-page heading="AI Visibility">
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
              {/* ═══════ SECTION 1: AI MENTIONS ═══════ */}
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg">
                  AI Mentions
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Check if AI platforms like ChatGPT and Perplexity
                  recommend your brand when asked about your keywords.
                </Text>

                {!hasPerplexity && (
                  <Banner
                    title="AI mention checking not configured"
                    tone="warning"
                  >
                    <Text as="p" variant="bodyMd">
                      Set the PERPLEXITY_API_KEY environment variable to
                      enable AI mention checking.
                    </Text>
                  </Banner>
                )}

                {/* AI Mention Stats */}
                <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
                  <Card>
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center">
                        <div
                          style={{
                            background: "#e8f5e9",
                            borderRadius: "6px",
                            width: "24px",
                            height: "24px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <Icon source={TargetIcon} />
                        </div>
                        <Text as="p" variant="bodySm" tone="subdued">
                          AI Mention Rate
                        </Text>
                      </InlineStack>
                      <Text as="p" variant="heading2xl">
                        <span
                          style={{
                            color:
                              aiMentionScore === null
                                ? "#6b7280"
                                : aiMentionScore >= 50
                                  ? "#22c55e"
                                  : aiMentionScore >= 20
                                    ? "#eab308"
                                    : "#ef4444",
                          }}
                        >
                          {aiMentionScore !== null
                            ? `${aiMentionScore}%`
                            : "\u2014"}
                        </span>
                      </Text>
                      {aiMentionScore !== null && (
                        <ProgressBar
                          progress={aiMentionScore}
                          size="small"
                          tone={
                            aiMentionScore >= 50
                              ? "primary"
                              : ("highlight" as any)
                          }
                        />
                      )}
                    </BlockStack>
                  </Card>
                  <Card>
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center">
                        <div
                          style={{
                            background: "#e0f0ff",
                            borderRadius: "6px",
                            width: "24px",
                            height: "24px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <Icon source={SearchIcon} />
                        </div>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Keywords Checked
                        </Text>
                      </InlineStack>
                      <Text as="p" variant="heading2xl">
                        {aiMentionsByKeyword.length}
                      </Text>
                    </BlockStack>
                  </Card>
                  <Card>
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center">
                        <div
                          style={{
                            background: "#fff3e0",
                            borderRadius: "6px",
                            width: "24px",
                            height: "24px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <Icon source={PersonIcon} />
                        </div>
                        <Text as="p" variant="bodySm" tone="subdued">
                          AI Competitors Found
                        </Text>
                      </InlineStack>
                      <Text as="p" variant="heading2xl">
                        {allAiCompetitors.size}
                      </Text>
                    </BlockStack>
                  </Card>
                </InlineGrid>

                {/* Check AI Mention Form */}
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                      Check AI Mention
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Ask AI &quot;What are the best [keyword]?&quot; and
                      check if your brand is mentioned in the response.
                    </Text>
                    <fetcher.Form method="post">
                      <input
                        type="hidden"
                        name="intent"
                        value="check-ai-mentions"
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
                            value={aiCheckKeyword}
                            onChange={setAiCheckKeyword}
                            placeholder="best wireless headphones 2026"
                            autoComplete="off"
                            disabled={!hasPerplexity}
                            connectedRight={
                              <Button
                                variant="primary"
                                submit
                                disabled={!hasPerplexity}
                                loading={
                                  isSubmitting &&
                                  fetcher.formData?.get("intent") ===
                                    "check-ai-mentions"
                                }
                              >
                                Check
                              </Button>
                            }
                          />
                        </div>
                      </InlineStack>
                    </fetcher.Form>
                    {queries.length > 0 && (
                      <fetcher.Form method="post">
                        <input
                          type="hidden"
                          name="intent"
                          value="check-all-ai-mentions"
                        />
                        <Button
                          submit
                          disabled={!hasPerplexity}
                          loading={
                            isSubmitting &&
                            fetcher.formData?.get("intent") ===
                              "check-all-ai-mentions"
                          }
                        >
                          Check All Keywords ({queries.length})
                        </Button>
                      </fetcher.Form>
                    )}
                  </BlockStack>
                </Card>

                {/* AI Mention Results */}
                <Card padding="0">
                  <Box padding="400" paddingBlockEnd="0">
                    <Text as="h2" variant="headingMd">
                      AI Mention Results
                    </Text>
                  </Box>
                  {aiMentionsByKeyword.length > 0 ? (
                    <BlockStack>
                      <DataTable
                        columnContentTypes={[
                          "text",
                          "text",
                          "text",
                          "text",
                          "text",
                        ]}
                        headings={[
                          "Keyword",
                          "AI Mentions You",
                          "Competitors in AI",
                          "Last Checked",
                          "",
                        ]}
                        rows={aiMentionsByKeyword.map((m) => [
                          <Text
                            as="span"
                            variant="bodyMd"
                            fontWeight="semibold"
                            key={m.keyword}
                          >
                            {m.keyword}
                          </Text>,
                          <Badge
                            key={`ai-${m.keyword}`}
                            tone={m.mentioned ? "success" : "critical"}
                          >
                            {m.mentioned ? "Yes" : "No"}
                          </Badge>,
                          <InlineStack
                            key={`comps-${m.keyword}`}
                            gap="100"
                            wrap
                          >
                            {m.competitorsMentioned.length > 0 ? (
                              <>
                                {m.competitorsMentioned
                                  .slice(0, 3)
                                  .map((c) => (
                                    <Badge
                                      key={c}
                                      tone="attention"
                                      size="small"
                                    >
                                      {c}
                                    </Badge>
                                  ))}
                                {m.competitorsMentioned.length > 3 && (
                                  <Badge tone="info" size="small">
                                    +
                                    {m.competitorsMentioned.length - 3}{" "}
                                    more
                                  </Badge>
                                )}
                              </>
                            ) : (
                              <Text
                                as="span"
                                variant="bodySm"
                                tone="subdued"
                              >
                                None
                              </Text>
                            )}
                          </InlineStack>,
                          new Date(m.checkedAt).toLocaleDateString(),
                          <Button
                            key={`expand-${m.keyword}`}
                            variant="plain"
                            onClick={() =>
                              setExpandedAiRow(
                                expandedAiRow === m.keyword
                                  ? null
                                  : m.keyword,
                              )
                            }
                          >
                            {expandedAiRow === m.keyword
                              ? "Hide"
                              : "View AI Response"}
                          </Button>,
                        ])}
                        hoverable
                      />
                      {/* Expanded AI response */}
                      {expandedAiRow && (() => {
                        const mention = aiMentionsByKeyword.find(
                          (m) => m.keyword === expandedAiRow,
                        );
                        if (!mention) return null;
                        return (
                          <Box
                            padding="400"
                            background="bg-surface-secondary"
                          >
                            <BlockStack gap="400">
                              <Text as="h3" variant="headingSm">
                                AI Response for &quot;{expandedAiRow}&quot;
                              </Text>
                              <Text as="p" variant="bodySm">
                                {mention.responseSnippet || "No response available."}
                              </Text>

                              {mention.competitorsMentioned.length > 0 && (
                                <BlockStack gap="200">
                                  <Text as="h3" variant="headingSm">
                                    Who AI Recommends Instead
                                  </Text>
                                  <InlineStack gap="200" wrap>
                                    {mention.competitorsMentioned.map((c) => (
                                      <Badge key={c} tone="attention">{c}</Badge>
                                    ))}
                                  </InlineStack>
                                </BlockStack>
                              )}

                              {!mention.mentioned && (
                                <Banner title="How to Get Recommended by AI" tone="info">
                                  <BlockStack gap="200">
                                    <Text as="p" variant="bodySm">
                                      AI platforms recommend brands they find across authoritative sources. Here&apos;s what to do:
                                    </Text>
                                    <Text as="p" variant="bodySm">
                                      1. <strong>Add schema markup</strong> to your product pages (use the Schema Audit on the SEO page to check)
                                    </Text>
                                    <Text as="p" variant="bodySm">
                                      2. <strong>Set up your llms.txt file</strong> in Settings — this tells AI crawlers about your store
                                    </Text>
                                    <Text as="p" variant="bodySm">
                                      3. <strong>Create content around &quot;{expandedAiRow}&quot;</strong> — blog posts, FAQs, and guides that AI platforms can cite
                                    </Text>
                                    <Text as="p" variant="bodySm">
                                      4. <strong>Get mentioned on review sites</strong> — AI pulls recommendations from third-party reviews and comparisons
                                    </Text>
                                    <Text as="p" variant="bodySm">
                                      5. <strong>Build backlinks</strong> — the more authoritative sites link to you, the more likely AI will recommend you
                                    </Text>
                                  </BlockStack>
                                </Banner>
                              )}

                              {mention.mentioned && (
                                <Banner title="Your brand is being recommended!" tone="success">
                                  <Text as="p" variant="bodySm">
                                    AI platforms are mentioning your brand for this keyword. Keep your schema markup updated and continue creating relevant content to maintain your visibility.
                                  </Text>
                                </Banner>
                              )}
                            </BlockStack>
                          </Box>
                        );
                      })()}
                    </BlockStack>
                  ) : (
                    <Box padding="800">
                      <EmptyState
                        heading="No AI mentions checked yet"
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                      >
                        <Text as="p" tone="subdued">
                          Enter a keyword above to check if AI platforms
                          recommend your brand.
                        </Text>
                      </EmptyState>
                    </Box>
                  )}
                </Card>
              </BlockStack>

              <Divider />

              {/* ═══════ SECTION 2: AI TRAFFIC (COLLAPSIBLE) ═══════ */}
              <Card>
                <div
                  onClick={() => setAiTrafficOpen(!aiTrafficOpen)}
                  style={{ cursor: "pointer" }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      setAiTrafficOpen(!aiTrafficOpen);
                  }}
                >
                  <InlineStack
                    align="space-between"
                    blockAlign="center"
                  >
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingMd">
                        AI Traffic from Analytics
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {aiTraffic
                          ? `${aiTraffic.totalAISessions.toLocaleString()} AI sessions in last 30 days`
                          : "Connect GA4 to see traffic from ChatGPT, Perplexity, Gemini"}
                      </Text>
                    </BlockStack>
                    <Icon
                      source={
                        aiTrafficOpen ? ChevronUpIcon : ChevronDownIcon
                      }
                    />
                  </InlineStack>
                </div>
                <Collapsible
                  open={aiTrafficOpen}
                  id="ai-traffic-section"
                >
                  <Box paddingBlockStart="400">
                    {!aiTraffic ? (
                      <Banner
                        title="Connect Google Analytics"
                        tone="info"
                      >
                        <Text as="p" variant="bodyMd">
                          Connect your Google account in Settings and
                          select a GA4 property to see AI-referred
                          traffic data.
                        </Text>
                      </Banner>
                    ) : (
                      <BlockStack gap="400">
                        <InlineGrid
                          columns={{ xs: 1, sm: 3 }}
                          gap="400"
                        >
                          <Card>
                            <BlockStack gap="200">
                              <InlineStack gap="200" blockAlign="center">
                                <div
                                  style={{
                                    background: "#f3e8ff",
                                    borderRadius: "6px",
                                    width: "24px",
                                    height: "24px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                  }}
                                >
                                  <Icon source={ChatIcon} />
                                </div>
                                <Text
                                  as="p"
                                  variant="bodySm"
                                  tone="subdued"
                                >
                                  AI Sessions (30d)
                                </Text>
                              </InlineStack>
                              <Text as="p" variant="heading2xl">
                                {aiTraffic.totalAISessions.toLocaleString()}
                              </Text>
                            </BlockStack>
                          </Card>
                          <Card>
                            <BlockStack gap="200">
                              <InlineStack gap="200" blockAlign="center">
                                <div
                                  style={{
                                    background: "#e0f0ff",
                                    borderRadius: "6px",
                                    width: "24px",
                                    height: "24px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                  }}
                                >
                                  <Icon source={PersonIcon} />
                                </div>
                                <Text
                                  as="p"
                                  variant="bodySm"
                                  tone="subdued"
                                >
                                  AI Users (30d)
                                </Text>
                              </InlineStack>
                              <Text as="p" variant="heading2xl">
                                {aiTraffic.totalAIUsers.toLocaleString()}
                              </Text>
                            </BlockStack>
                          </Card>
                          <Card>
                            <BlockStack gap="200">
                              <InlineStack gap="200" blockAlign="center">
                                <div
                                  style={{
                                    background: "#e8f5e9",
                                    borderRadius: "6px",
                                    width: "24px",
                                    height: "24px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                  }}
                                >
                                  <Icon source={ChartVerticalIcon} />
                                </div>
                                <Text
                                  as="p"
                                  variant="bodySm"
                                  tone="subdued"
                                >
                                  AI Share of Traffic
                                </Text>
                              </InlineStack>
                              <Text as="p" variant="heading2xl">
                                <span
                                  style={{
                                    color:
                                      aiTraffic.aiShareOfTotal >= 5
                                        ? "#22c55e"
                                        : aiTraffic.aiShareOfTotal >= 1
                                          ? "#eab308"
                                          : "#6b7280",
                                  }}
                                >
                                  {aiTraffic.aiShareOfTotal}%
                                </span>
                              </Text>
                              <ProgressBar
                                progress={Math.min(
                                  aiTraffic.aiShareOfTotal * 5,
                                  100,
                                )}
                                size="small"
                                tone="primary"
                              />
                            </BlockStack>
                          </Card>
                        </InlineGrid>

                        <Card padding="0">
                          <Box padding="400" paddingBlockEnd="0">
                            <Text as="h2" variant="headingMd">
                              Traffic by AI Platform
                            </Text>
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
                              <EmptyState
                                heading="No AI traffic detected yet"
                                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                              >
                                <Text as="p" tone="subdued">
                                  As AI platforms like ChatGPT,
                                  Perplexity, and Gemini start
                                  referencing your store, traffic will
                                  appear here.
                                </Text>
                              </EmptyState>
                            </Box>
                          )}
                        </Card>

                        {aiTraffic.topPages.length > 0 && (
                          <Card padding="0">
                            <Box padding="400" paddingBlockEnd="0">
                              <Text as="h2" variant="headingMd">
                                Top Pages from AI Traffic
                              </Text>
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
                      </BlockStack>
                    )}
                  </Box>
                </Collapsible>
              </Card>
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
