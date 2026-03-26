import type { HeadersFunction, LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { ClientOnly } from "../components/ClientOnly";
import { PolarisProvider } from "../components/PolarisProvider";
import { StatBox } from "../components/StatBox";
import { Timeline, type TimelineItem } from "../components/Timeline";
import { SetupGuide, type SetupGuideItem } from "../components/SetupGuide";
import {
  Badge,
  Text,
  Card,
  BlockStack,
  InlineGrid,
  InlineStack,
  Box,
  Button,
  ButtonGroup,
  Icon,
  ProgressBar,
  Banner,
  Divider,
  EmptyState,
} from "@shopify/polaris";
import {
  SearchIcon,
  ViewIcon,
  SettingsIcon,
  SendIcon,
  CheckIcon,
  ChartVerticalIcon,
  HashtagIcon,
} from "@shopify/polaris-icons";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "dismiss-onboarding") {
    await prisma.store.update({
      where: { shopDomain: session.shop },
      data: { onboardingDismissed: true },
    });
    return { ok: true };
  }

  return { ok: true };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const store = await prisma.store.findUnique({
    where: { shopDomain: session.shop },
  });

  if (!store) {
    return {
      stats: {
        totalSubmissions: 0,
        successRate: 0,
        indexingHealth: 0,
        trackedKeywords: 0,
        indexedUrls: 0,
        totalTrackedUrls: 0,
      },
      traffic: { bingClicks: 0, yandexClicks: 0, ga4Organic: 0 },
      aiTraffic: { totalAISessions: 0, totalAIUsers: 0, aiShareOfTotal: 0, sources: [] as { source: string; sessions: number }[] },
      recentActivity: [],
      setupSteps: {
        installed: true,
        firstSubmit: false,
        gscConnected: false,
        keywordsAdded: false,
        bingConnected: false,
      },
      schemaAuditCount: 0,
      dailySubmissions: [],
      engines: { hasBing: false, hasYandex: false, hasGa4: false },
      bingKeywords: [] as { query: string; clicks: number; impressions: number; avgPosition: number }[],
      crawlIssueCount: 0,
      showOnboarding: false,
      autoIndexBanner: null as { count: number; latestUrl: string } | null,
    };
  }

  // Copy merchant email from session if not yet stored
  if (!store.merchantEmail) {
    const offlineSession = await prisma.session.findFirst({
      where: { shop: session.shop, email: { not: null } },
      select: { email: true },
    });
    if (offlineSession?.email) {
      await prisma.store.update({
        where: { id: store.id },
        data: { merchantEmail: offlineSession.email },
      });
    }
  }

  // Check for auto-indexed URLs since last dashboard visit
  const recentWebhookSubmissions = await prisma.urlSubmission.findMany({
    where: {
      storeId: store.id,
      source: "webhook",
      ...(store.lastDashboardVisit
        ? { submittedAt: { gt: store.lastDashboardVisit } }
        : { submittedAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
    },
    orderBy: { submittedAt: "desc" },
    take: 1,
    select: { url: true },
  });
  const autoIndexCount = await prisma.urlSubmission.count({
    where: {
      storeId: store.id,
      source: "webhook",
      ...(store.lastDashboardVisit
        ? { submittedAt: { gt: store.lastDashboardVisit } }
        : { submittedAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
    },
  });
  const autoIndexBanner = autoIndexCount > 0 && recentWebhookSubmissions[0]
    ? { count: autoIndexCount, latestUrl: recentWebhookSubmissions[0].url }
    : null;

  // Update last dashboard visit
  await prisma.store.update({
    where: { id: store.id },
    data: { lastDashboardVisit: new Date() },
  });

  // Show onboarding if installed within 7 days and not dismissed
  const daysSinceInstall = (Date.now() - store.installedAt.getTime()) / (1000 * 60 * 60 * 24);
  const showOnboarding = !store.onboardingDismissed && daysSinceInstall <= 7;

  const [
    totalSubmissions,
    successfulSubmissions,
    indexedUrls,
    totalTrackedUrls,
    trackedKeywords,
    schemaAuditCount,
    recentActivity,
    dailySubmissions,
  ] = await Promise.all([
    prisma.urlSubmission.count({ where: { storeId: store.id } }),
    prisma.urlSubmission.count({
      where: { storeId: store.id, status: "sent" },
    }),
    prisma.urlIndexStatus.count({
      where: { storeId: store.id, bingIndexed: true },
    }),
    prisma.urlIndexStatus.count({ where: { storeId: store.id } }),
    prisma.visibilityQuery.count({ where: { storeId: store.id } }),
    prisma.schemaAudit.count({ where: { storeId: store.id } }),
    prisma.activityLog.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT DATE("submittedAt") as day, COUNT(*)::int as count
      FROM "UrlSubmission"
      WHERE "storeId" = ${store.id}
        AND "submittedAt" >= NOW() - INTERVAL '7 days'
      GROUP BY DATE("submittedAt")
      ORDER BY day ASC
    `.catch(() => []),
  ]);

  const successRate =
    totalSubmissions > 0
      ? Math.round((successfulSubmissions / totalSubmissions) * 100)
      : 0;
  const indexingHealth =
    totalTrackedUrls > 0
      ? Math.round((indexedUrls / totalTrackedUrls) * 100)
      : 0;

  const now = new Date();
  const sparkline: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const match = (dailySubmissions as any[]).find(
      (r) => new Date(r.day).toISOString().split("T")[0] === dateStr
    );
    sparkline.push(match ? Number(match.count) : 0);
  }

  const hasBing = !!store.bingWebmasterApiKey || !!store.bingRefreshToken;
  const hasYandex = !!store.yandexWebmasterToken;
  const hasGa4 = !!store.ga4PropertyId && (!!store.ga4Credentials || !!store.googleRefreshToken);

  let bingClicks = 0;
  let yandexClicks = 0;
  let ga4Organic = 0;
  let aiTraffic = { totalAISessions: 0, totalAIUsers: 0, aiShareOfTotal: 0, sources: [] as { source: string; sessions: number }[] };
  let bingKeywords: { query: string; clicks: number; impressions: number; avgPosition: number }[] = [];
  let crawlIssueCount = 0;

  const { decrypt } = await import("../lib/encryption.server");

  if (hasBing) {
    try {
      const { getBingAccessToken } = await import("../lib/bing-oauth.server");
      const { getSearchTraffic, getQueryStats, getCrawlIssues, addSite, submitFeed } = await import("../services/bing-webmaster.server");
      const bingOAuthToken = await getBingAccessToken(store.id);
      const bingAuth = bingOAuthToken
        ? { oauthToken: bingOAuthToken }
        : store.bingWebmasterApiKey
          ? { apiKey: decrypt(store.bingWebmasterApiKey!) }
          : null;
      if (bingAuth) {
        const siteUrl = `https://${store.shopDomain}`;
        const [traffic, keywords, issues] = await Promise.all([
          getSearchTraffic(bingAuth, siteUrl),
          getQueryStats(bingAuth, siteUrl).catch(() => []),
          getCrawlIssues(bingAuth, siteUrl).catch(() => []),
        ]);
        bingClicks = traffic.reduce((s, t) => s + t.clicks, 0);
        bingKeywords = keywords.slice(0, 10).map((k) => ({
          query: k.query,
          clicks: k.clicks,
          impressions: k.impressions,
          avgPosition: k.avgPosition,
        }));
        crawlIssueCount = issues.length;

        // Auto-onboarding: register site + submit sitemap on first OAuth load
        if (bingOAuthToken && !store.bingAutoSetup) {
          try {
            await addSite(bingAuth, siteUrl);
          } catch {}
          try {
            await submitFeed(bingAuth, siteUrl, `${siteUrl}/sitemap.xml`);
          } catch {}
          await prisma.store.update({
            where: { id: store.id },
            data: { bingAutoSetup: true },
          });
        }
      }
    } catch {}
  }

  if (hasYandex) {
    try {
      const { getSearchTraffic: yt, getHosts } = await import(
        "../services/yandex-webmaster.server"
      );
      const token = decrypt(store.yandexWebmasterToken!);
      const hosts = await getHosts(token);
      const host = hosts.find((h) =>
        h.asciiHostUrl.includes(store.shopDomain)
      );
      if (host) {
        const traffic = await yt(token, "me", host.hostId);
        yandexClicks = traffic.reduce((s, t) => s + t.clicks, 0);
      }
    } catch {}
  }

  if (hasGa4) {
    try {
      const { getOverallTrafficSummary, getAITrafficSummary } = await import(
        "../services/ga4.server"
      );
      const { getGoogleAccessToken } = await import(
        "../lib/google-oauth.server"
      );
      // Prefer OAuth token, fall back to service account credentials
      const oauthToken = await getGoogleAccessToken(store.id);
      const credentialsOrToken = oauthToken
        ? oauthToken
        : JSON.parse(decrypt(store.ga4Credentials!));

      const [summary, aiSummary] = await Promise.all([
        getOverallTrafficSummary(credentialsOrToken, store.ga4PropertyId!, 30),
        getAITrafficSummary(credentialsOrToken, store.ga4PropertyId!, 30).catch(() => null),
      ]);

      ga4Organic = summary.organicSessions;

      if (aiSummary) {
        aiTraffic = {
          totalAISessions: aiSummary.totalAISessions,
          totalAIUsers: aiSummary.totalAIUsers,
          aiShareOfTotal: aiSummary.aiShareOfTotal,
          sources: aiSummary.sources.map((s) => ({
            source: s.source,
            sessions: s.sessions,
          })),
        };
      }
    } catch {}
  }

  return {
    stats: {
      totalSubmissions,
      successRate,
      indexingHealth,
      trackedKeywords,
      indexedUrls,
      totalTrackedUrls,
    },
    traffic: { bingClicks, yandexClicks, ga4Organic },
    aiTraffic,
    recentActivity: recentActivity.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    })),
    setupSteps: {
      installed: true,
      firstSubmit: totalSubmissions > 0,
      gscConnected: !!store.gscCredentials || !!store.googleRefreshToken,
      keywordsAdded: trackedKeywords > 0,
      bingConnected: !!store.bingRefreshToken,
    },
    schemaAuditCount,
    dailySubmissions: sparkline,
    engines: { hasBing, hasYandex, hasGa4 },
    bingKeywords,
    crawlIssueCount,
    showOnboarding,
    autoIndexBanner,
  };
};

export default function Dashboard() {
  const { stats, traffic, aiTraffic, recentActivity, setupSteps, dailySubmissions, engines, schemaAuditCount, bingKeywords, crawlIssueCount, showOnboarding, autoIndexBanner } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const totalTraffic = traffic.bingClicks + traffic.yandexClicks + traffic.ga4Organic;

  const setupItems: SetupGuideItem[] = [
    {
      id: 0,
      title: "Install IndexBeam AI",
      description: "You've installed the app. Your products will be automatically submitted for indexing.",
      complete: setupSteps.installed,
    },
    {
      id: 1,
      title: "Submit your first URL",
      description: "Submit a product URL to Bing and Yandex for instant indexing.",
      complete: setupSteps.firstSubmit,
      primaryButton: {
        content: "Go to Indexing",
        props: { onClick: () => navigate("/app/indexing") },
      },
    },
    {
      id: 2,
      title: "Connect Google",
      description: "One click to unlock AI traffic monitoring, index status tracking, and search performance data.",
      complete: setupSteps.gscConnected,
      primaryButton: {
        content: "Connect Google",
        props: { onClick: () => navigate("/app/settings?tab=connections") },
      },
    },
    {
      id: 3,
      title: "Run a schema audit",
      description: "Check your product pages for structured data that helps AI search engines understand your products.",
      complete: schemaAuditCount > 0,
      primaryButton: {
        content: "Audit Pages",
        props: { onClick: () => navigate("/app/seo") },
      },
    },
    {
      id: 4,
      title: "Track AI visibility keywords",
      description: "Monitor how your brand appears when people search in AI tools like ChatGPT and Perplexity.",
      complete: setupSteps.keywordsAdded,
      primaryButton: {
        content: "Track Keywords",
        props: { onClick: () => navigate("/app/visibility") },
      },
    },
    {
      id: 5,
      title: "Connect Bing Webmaster",
      description: "Verify your IndexNow submissions are indexed and track Bing/Copilot traffic.",
      complete: setupSteps.bingConnected,
      primaryButton: {
        content: "Connect Bing",
        props: { onClick: () => navigate("/app/settings?tab=connections") },
      },
    },
  ];

  const allSetupComplete = setupItems.every((item) => item.complete);

  const timelineItems: TimelineItem[] = recentActivity.map((activity: any) => {
    const isFail =
      activity.type.includes("fail") || activity.type.includes("error");
    return {
      tone: isFail ? ("critical" as const) : ("success" as const),
      timelineEvent: (
        <>
          <Badge tone={isFail ? "critical" : "success"}>
            {activity.type.replace(/_/g, " ")}
          </Badge>{" "}
          {activity.message}
        </>
      ),
      timestamp: new Date(activity.createdAt),
    };
  });

  const connectedEngines = [engines.hasBing, engines.hasYandex, engines.hasGa4].filter(Boolean).length;

  return (
    <s-page heading="IndexBeam AI">
      <ClientOnly
        fallback={
          <s-card>
            <s-box padding="base">
              <s-text>Loading dashboard...</s-text>
            </s-box>
          </s-card>
        }
      >
        {() => (
          <PolarisProvider>
            <BlockStack gap="500">
              {/* Onboarding Welcome Card */}
              {showOnboarding && (
                <Banner
                  title="Welcome to IndexBeam!"
                  tone="info"
                  onDismiss={() => {
                    fetcher.submit(
                      { intent: "dismiss-onboarding" },
                      { method: "post" }
                    );
                  }}
                >
                  <BlockStack gap="300">
                    <Text as="p" variant="bodyMd">
                      Get started in 3 steps to maximize your search visibility:
                    </Text>
                    <ButtonGroup>
                      <Button onClick={() => navigate("/app/settings")}>
                        1. Generate IndexNow Key
                      </Button>
                      <Button onClick={() => navigate("/app/indexing")}>
                        2. Submit Your First URL
                      </Button>
                      <Button onClick={() => navigate("/app/visibility")}>
                        3. Check AI Visibility
                      </Button>
                    </ButtonGroup>
                  </BlockStack>
                </Banner>
              )}

              {/* Auto-Index Notification Banner */}
              {autoIndexBanner && (
                <Banner
                  title={`IndexBeam auto-submitted ${autoIndexBanner.count} product URL${autoIndexBanner.count !== 1 ? "s" : ""} since your last visit`}
                  tone="success"
                >
                  <Text as="p" variant="bodyMd">
                    Latest: {autoIndexBanner.latestUrl}
                  </Text>
                </Banner>
              )}

              {/* Setup Guide - only show if not all complete */}
              {!allSetupComplete && (
                <SetupGuide
                  onDismiss={() => {}}
                  onStepComplete={async () => {}}
                  items={setupItems}
                />
              )}

              {/* Connection status banner */}
              {connectedEngines === 0 && setupSteps.firstSubmit && (
                <Banner
                  title="Connect your search engines"
                  tone="warning"
                  action={{ content: "Go to Settings", onAction: () => navigate("/app/settings") }}
                >
                  <Text as="p" variant="bodyMd">
                    Connect at least one search engine (Bing, Google, or Yandex) to start tracking your indexing status and traffic.
                  </Text>
                </Banner>
              )}

              {/* Stats Row */}
              <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
                <StatBox
                  title="URLs Submitted"
                  value={stats.totalSubmissions}
                  data={dailySubmissions}
                  icon={SendIcon}
                  iconBg="#e0f0ff"
                />
                <StatBox
                  title="Success Rate"
                  value={`${stats.successRate}%`}
                  data={[]}
                  icon={CheckIcon}
                  iconBg="#e8f5e9"
                />
                <StatBox
                  title="Indexing Health"
                  value={`${stats.indexingHealth}%`}
                  data={[]}
                  icon={ChartVerticalIcon}
                  iconBg="#fff3e0"
                />
                <StatBox
                  title="Keywords Tracked"
                  value={stats.trackedKeywords}
                  data={[]}
                  icon={HashtagIcon}
                  iconBg="#f3e8ff"
                />
              </InlineGrid>

              {/* Two column layout: Traffic + Quick Actions */}
              <InlineGrid columns={{ xs: 1, md: "2fr 1fr" }} gap="400">
                {/* Search Traffic */}
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h2" variant="headingMd">
                        Search Traffic
                      </Text>
                      <Badge tone="info">30 days</Badge>
                    </InlineStack>

                    <InlineStack gap="800" blockAlign="start" wrap={false}>
                      <BlockStack gap="100">
                        <Text as="p" variant="heading2xl" fontWeight="bold">
                          {totalTraffic.toLocaleString()}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Total organic clicks
                        </Text>
                      </BlockStack>
                    </InlineStack>

                    <Divider />

                    <InlineGrid columns={3} gap="400">
                      <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="p" variant="headingLg">
                            {traffic.ga4Organic.toLocaleString()}
                          </Text>
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Google (via GA4)
                        </Text>
                        {!engines.hasGa4 ? (
                          <Badge tone="attention" size="small">Not connected</Badge>
                        ) : (
                          <Badge tone="success" size="small">Connected</Badge>
                        )}
                      </BlockStack>

                      <BlockStack gap="200">
                        <Text as="p" variant="headingLg">
                          {traffic.bingClicks.toLocaleString()}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Bing
                        </Text>
                        {!engines.hasBing ? (
                          <Badge tone="attention" size="small">Not connected</Badge>
                        ) : (
                          <Badge tone="success" size="small">Connected</Badge>
                        )}
                      </BlockStack>

                      <BlockStack gap="200">
                        <Text as="p" variant="headingLg">
                          {traffic.yandexClicks.toLocaleString()}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Yandex
                        </Text>
                        {!engines.hasYandex ? (
                          <Badge tone="attention" size="small">Not connected</Badge>
                        ) : (
                          <Badge tone="success" size="small">Connected</Badge>
                        )}
                      </BlockStack>
                    </InlineGrid>
                  </BlockStack>
                </Card>

                {/* Quick Actions */}
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Quick Actions
                    </Text>
                    <BlockStack gap="300">
                      <Button
                        variant="primary"
                        icon={SearchIcon}
                        fullWidth
                        onClick={() => navigate("/app/indexing")}
                      >
                        Submit URLs for Indexing
                      </Button>
                      <Button
                        icon={ViewIcon}
                        fullWidth
                        onClick={() => navigate("/app/visibility")}
                      >
                        Check AI Visibility
                      </Button>
                      <Button
                        icon={SettingsIcon}
                        fullWidth
                        onClick={() => navigate("/app/settings")}
                      >
                        Settings & Connections
                      </Button>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="200">
                      <Text as="p" variant="headingSm">
                        Index Summary
                      </Text>
                      <InlineStack align="space-between">
                        <Text as="span" variant="bodySm" tone="subdued">
                          Indexed URLs
                        </Text>
                        <Text as="span" variant="bodySm">
                          {stats.indexedUrls} / {stats.totalTrackedUrls}
                        </Text>
                      </InlineStack>
                      <ProgressBar
                        progress={stats.totalTrackedUrls > 0 ? (stats.indexedUrls / stats.totalTrackedUrls) * 100 : 0}
                        size="small"
                        tone="primary"
                      />
                    </BlockStack>
                  </BlockStack>
                </Card>
              </InlineGrid>

              {/* AI Traffic */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      AI Traffic
                    </Text>
                    <Badge tone="info">30 days</Badge>
                  </InlineStack>

                  {!engines.hasGa4 ? (
                    <Banner
                      tone="info"
                      action={{ content: "Connect Google", onAction: () => navigate("/app/settings?tab=connections") }}
                    >
                      <Text as="p" variant="bodyMd">
                        Connect your Google Analytics to see how much traffic AI platforms (ChatGPT, Perplexity, Gemini) send to your store.
                      </Text>
                    </Banner>
                  ) : aiTraffic.totalAISessions === 0 ? (
                    <BlockStack gap="300">
                      <InlineGrid columns={{ xs: 2, md: 4 }} gap="400">
                        <BlockStack gap="100">
                          <Text as="p" variant="heading2xl" fontWeight="bold">0</Text>
                          <Text as="p" variant="bodySm" tone="subdued">AI Sessions</Text>
                        </BlockStack>
                        <BlockStack gap="100">
                          <Text as="p" variant="heading2xl" fontWeight="bold">0%</Text>
                          <Text as="p" variant="bodySm" tone="subdued">Share of Total Traffic</Text>
                        </BlockStack>
                      </InlineGrid>
                      <Text as="p" variant="bodySm" tone="subdued">
                        No AI-sourced traffic detected yet. As AI platforms like ChatGPT and Perplexity start
                        referencing your store, sessions will appear here.
                      </Text>
                    </BlockStack>
                  ) : (
                    <BlockStack gap="400">
                      <InlineGrid columns={{ xs: 2, md: 4 }} gap="400">
                        <BlockStack gap="100">
                          <Text as="p" variant="heading2xl" fontWeight="bold">
                            {aiTraffic.totalAISessions.toLocaleString()}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">AI Sessions</Text>
                        </BlockStack>
                        <BlockStack gap="100">
                          <Text as="p" variant="heading2xl" fontWeight="bold">
                            {aiTraffic.totalAIUsers.toLocaleString()}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">AI Users</Text>
                        </BlockStack>
                        <BlockStack gap="100">
                          <Text as="p" variant="heading2xl" fontWeight="bold">
                            {aiTraffic.aiShareOfTotal}%
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">Share of Total Traffic</Text>
                        </BlockStack>
                      </InlineGrid>

                      {aiTraffic.sources.length > 0 && (
                        <>
                          <Divider />
                          <Text as="h3" variant="headingSm">Top AI Sources</Text>
                          <BlockStack gap="200">
                            {aiTraffic.sources.slice(0, 5).map((src) => (
                              <InlineStack key={src.source} align="space-between" blockAlign="center">
                                <Text as="span" variant="bodyMd">{src.source}</Text>
                                <Badge>{src.sessions.toLocaleString()} sessions</Badge>
                              </InlineStack>
                            ))}
                          </BlockStack>
                        </>
                      )}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>

              {/* Crawl Issues Banner */}
              {crawlIssueCount > 0 && (
                <Banner
                  title={`${crawlIssueCount} Bing crawl issue${crawlIssueCount !== 1 ? "s" : ""} found`}
                  tone="warning"
                >
                  <Text as="p" variant="bodyMd">
                    Bing Webmaster has detected crawl issues on your site that may affect indexing.
                  </Text>
                </Banner>
              )}

              {/* Top Bing Keywords */}
              {bingKeywords.length > 0 && (
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h2" variant="headingMd">
                        Top Bing Keywords
                      </Text>
                      <Badge tone="info">Bing Webmaster</Badge>
                    </InlineStack>
                    <BlockStack gap="200">
                      {bingKeywords.map((kw) => (
                        <InlineStack key={kw.query} align="space-between" blockAlign="center">
                          <Text as="span" variant="bodyMd">{kw.query}</Text>
                          <InlineStack gap="300">
                            <Text as="span" variant="bodySm" tone="subdued">
                              {kw.clicks} clicks
                            </Text>
                            <Text as="span" variant="bodySm" tone="subdued">
                              {kw.impressions.toLocaleString()} impr
                            </Text>
                            <Badge size="small">Pos {kw.avgPosition.toFixed(1)}</Badge>
                          </InlineStack>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Card>
              )}

              {/* Recent Activity */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Recent Activity
                    </Text>
                    {recentActivity.length > 0 && (
                      <Badge>{recentActivity.length} events</Badge>
                    )}
                  </InlineStack>

                  {timelineItems.length > 0 ? (
                    <Timeline items={timelineItems} />
                  ) : (
                    <Box paddingBlock="800">
                      <EmptyState
                        heading="No activity yet"
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                      >
                        <Text as="p" tone="subdued">
                          Submit some URLs to see your activity feed here. IndexBeam tracks every submission, index check, and visibility scan.
                        </Text>
                      </EmptyState>
                    </Box>
                  )}
                </BlockStack>
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
