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
  ButtonGroup,
  Badge,
  DataTable,
  Tabs,
  Banner,
  Box,
  ProgressBar,
  EmptyState,
  Divider,
  Pagination,
  Filters,
  ChoiceList,
} from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") || "submit";
  const page = parseInt(url.searchParams.get("page") || "1");
  const status = url.searchParams.get("status") || undefined;
  const pageSize = 25;

  const store = await prisma.store.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!store)
    return {
      tab,
      submissions: [],
      total: 0,
      page,
      pageSize,
      statuses: [],
      summary: { total: 0, bingIndexed: 0, googleIndexed: 0 },
      hasGa4: false,
    };

  const where: any = { storeId: store.id };
  if (status) where.status = status;

  const [submissions, total] = await Promise.all([
    prisma.urlSubmission.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.urlSubmission.count({ where }),
  ]);

  const indexStatuses = await prisma.urlIndexStatus.findMany({
    where: { storeId: store.id },
    orderBy: { lastCheckedAt: "desc" },
  });

  const summary = {
    total: indexStatuses.length,
    bingIndexed: indexStatuses.filter((s) => s.bingIndexed).length,
    googleIndexed: indexStatuses.filter((s) => s.googleIndexed).length,
  };

  // Fetch per-URL traffic from GA4 if connected
  let urlTraffic: Record<string, { sessions: number; pageViews: number }> = {};
  const hasGa4 = !!store.ga4PropertyId && (!!store.ga4Credentials || !!store.googleRefreshToken);
  if (hasGa4 && indexStatuses.length > 0) {
    try {
      const { getTrafficForUrls } = await import("../services/ga4.server");
      const { getGoogleAccessToken } = await import("../lib/google-oauth.server");
      const { decrypt } = await import("../lib/encryption.server");
      const oauthToken = await getGoogleAccessToken(store.id);
      const creds = oauthToken || JSON.parse(decrypt(store.ga4Credentials!));

      // Extract page paths from full URLs
      const pagePaths = indexStatuses.map((s) => {
        try { return new URL(s.url).pathname; } catch { return s.url; }
      });

      const traffic = await getTrafficForUrls(creds, store.ga4PropertyId!, pagePaths, 30);
      for (const t of traffic) {
        urlTraffic[t.pagePath] = { sessions: t.sessions, pageViews: t.pageViews };
      }
    } catch {}
  }

  return {
    tab,
    submissions: submissions.map((s) => ({
      ...s,
      submittedAt: s.submittedAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    statuses: indexStatuses.map((s) => {
      let pagePath: string;
      try { pagePath = new URL(s.url).pathname; } catch { pagePath = s.url; }
      const traffic = urlTraffic[pagePath];
      return {
        ...s,
        lastCheckedAt: s.lastCheckedAt?.toISOString() || null,
        bingLastCrawl: s.bingLastCrawl?.toISOString() || null,
        googleLastCrawl: s.googleLastCrawl?.toISOString() || null,
        sessions: traffic?.sessions ?? null,
        pageViews: traffic?.pageViews ?? null,
      };
    }),
    summary,
    hasGa4,
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

  if (intent === "submit-url") {
    const url = formData.get("url") as string;
    if (!url) return { error: "URL is required" };
    try {
      const { submitUrl } = await import("../services/indexnow.server");
      const keyLocation = `https://${session.shop}/apps/indexnow/${store.indexnowKey}.txt`;
      let submitted = 0;
      for (const engine of ["bing", "yandex"] as const) {
        try {
          const result = await submitUrl(url, session.shop, store.indexnowKey!, engine, keyLocation);
          await prisma.urlSubmission.create({
            data: {
              storeId: store.id, url, status: result.success ? "sent" : "failed",
              responseCode: result.status, source: "manual", engine,
              errorMessage: result.success ? null : result.message,
            },
          });
          if (result.success) submitted++;
        } catch (err) {
          await prisma.urlSubmission.create({
            data: { storeId: store.id, url, status: "failed", source: "manual", engine, errorMessage: (err as Error).message },
          });
        }
      }
      await prisma.activityLog.create({
        data: { storeId: store.id, type: "indexnow_submit", message: `Submitted ${url} to ${submitted} engines` },
      });
      return { success: true, message: `URL submitted to ${submitted} engines` };
    } catch {
      return { error: "Failed to submit URL." };
    }
  }

  if (intent === "submit-batch") {
    try {
      const response = await admin.graphql(
        `#graphql
        query { products(first: 250) { nodes { handle } } }`
      );
      const data: any = await response.json();
      const products = data.data?.products?.nodes || [];
      if (products.length === 0) return { error: "No products found." };

      const { submitUrl } = await import("../services/indexnow.server");
      const keyLocation = `https://${session.shop}/apps/indexnow/${store.indexnowKey}.txt`;
      let submitted = 0;
      let failed = 0;
      for (const product of products) {
        const productUrl = `https://${session.shop}/products/${product.handle}`;
        for (const engine of ["bing", "yandex"] as const) {
          try {
            const result = await submitUrl(productUrl, session.shop, store.indexnowKey!, engine, keyLocation);
            await prisma.urlSubmission.create({
              data: {
                storeId: store.id, url: productUrl, status: result.success ? "sent" : "failed",
                responseCode: result.status, source: "batch", engine,
                errorMessage: result.success ? null : result.message,
              },
            });
            if (result.success) submitted++; else failed++;
          } catch (err) {
            await prisma.urlSubmission.create({
              data: { storeId: store.id, url: productUrl, status: "failed", source: "batch", engine, errorMessage: (err as Error).message },
            });
            failed++;
          }
        }
      }
      await prisma.activityLog.create({
        data: { storeId: store.id, type: "indexnow_submit", message: `Batch: ${submitted} sent, ${failed} failed (${products.length} products)` },
      });
      return {
        success: true,
        message: `${products.length} products submitted (${submitted} sent, ${failed} failed)`,
      };
    } catch {
      return { error: "Batch submission failed." };
    }
  }

  if (intent === "recheck-all") {
    const { indexCheckQueue } = await import("../jobs/queue.server");
    await indexCheckQueue.add("check", { storeId: store.id });
    return { success: true, message: "Index re-check queued." };
  }

  return null;
};

export default function IndexingPage() {
  const { submissions, total, page, pageSize, statuses, summary, hasGa4 } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const totalPages = Math.ceil(total / pageSize);
  const isSubmitting = fetcher.state !== "idle";
  const actionData = fetcher.data as any;
  const [urlValue, setUrlValue] = useState("");
  const [selectedTab, setSelectedTab] = useState(() => {
    const tab = searchParams.get("tab");
    if (tab === "log") return 1;
    if (tab === "status") return 2;
    return 0;
  });

  useEffect(() => {
    if (actionData?.success && actionData.message) {
      (window as any).shopify?.toast?.show?.(actionData.message);
      if (actionData.message.includes("queued")) setUrlValue("");
    }
    if (actionData?.error) {
      (window as any).shopify?.toast?.show?.(actionData.error, {
        isError: true,
      });
    }
  }, [actionData]);

  const handleTabChange = useCallback((index: number) => {
    setSelectedTab(index);
    const tabs = ["submit", "log", "status"];
    setSearchParams({ tab: tabs[index] });
  }, [setSearchParams]);

  const bingPct = summary.total > 0 ? Math.round((summary.bingIndexed / summary.total) * 100) : 0;
  const googlePct = summary.total > 0 ? Math.round((summary.googleIndexed / summary.total) * 100) : 0;

  const tabs = [
    { id: "submit", content: "Submit URLs" },
    { id: "log", content: `Submission Log (${total})` },
    { id: "status", content: `Index Status (${summary.total})` },
  ];

  // Format submission rows for DataTable
  const submissionRows = submissions.map((sub: any) => [
    <Text as="span" variant="bodySm" truncate key={sub.id}>
      {sub.url.replace(/^https?:\/\//, "").substring(0, 50)}
      {sub.url.replace(/^https?:\/\//, "").length > 50 ? "..." : ""}
    </Text>,
    <Badge
      key={`status-${sub.id}`}
      tone={sub.status === "sent" ? "success" : sub.status === "failed" ? "critical" : "attention"}
    >
      {sub.status}
    </Badge>,
    sub.engine || "—",
    sub.source || "—",
    new Date(sub.submittedAt).toLocaleDateString(),
  ]);

  // Format index status rows
  const statusRows = (statuses as any[]).map((s) => {
    const row = [
      <Text as="span" variant="bodySm" truncate key={s.id}>
        {s.url.replace(/^https?:\/\//, "").substring(0, 45)}
        {s.url.replace(/^https?:\/\//, "").length > 45 ? "..." : ""}
      </Text>,
      <Badge
        key={`bing-${s.id}`}
        tone={s.bingIndexed ? "success" : s.bingIndexed === false ? "critical" : "attention"}
      >
        {s.bingIndexed ? "Indexed" : s.bingIndexed === false ? "Not indexed" : "Unknown"}
      </Badge>,
      <Badge
        key={`google-${s.id}`}
        tone={s.googleIndexed ? "success" : s.googleIndexed === false ? "critical" : "attention"}
      >
        {s.googleIndexed ? "Indexed" : s.googleIndexed === false ? "Not indexed" : "Unknown"}
      </Badge>,
      s.sessions !== null ? (
        <Text as="span" variant="bodySm" key={`traffic-${s.id}`}>
          {s.sessions.toLocaleString()}
        </Text>
      ) : "—",
      s.lastCheckedAt ? new Date(s.lastCheckedAt).toLocaleDateString() : "Never",
    ];
    return row;
  });

  return (
    <s-page heading="Indexing">
      <ClientOnly
        fallback={
          <s-card><s-box padding="base"><s-text>Loading...</s-text></s-box></s-card>
        }
      >
        {() => (
          <PolarisProvider>
            <BlockStack gap="400">
              <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
                <Box paddingBlockStart="400">
                  {/* ——— Submit Tab ——— */}
                  {selectedTab === 0 && (
                    <BlockStack gap="400">
                      <Card>
                        <BlockStack gap="400">
                          <Text as="h2" variant="headingMd">
                            Submit a URL
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Submit any URL to Bing and Yandex via IndexNow for instant indexing. The URL will be queued and processed within seconds.
                          </Text>
                          <fetcher.Form method="post">
                            <input type="hidden" name="intent" value="submit-url" />
                            <InlineStack gap="300" blockAlign="end" wrap={false}>
                              <div style={{ flexGrow: 1 }}>
                                <TextField
                                  label="URL"
                                  name="url"
                                  value={urlValue}
                                  onChange={setUrlValue}
                                  placeholder="https://your-store.com/products/example"
                                  autoComplete="off"
                                  connectedRight={
                                    <Button
                                      variant="primary"
                                      submit
                                      loading={isSubmitting && fetcher.formData?.get("intent") === "submit-url"}
                                    >
                                      Submit
                                    </Button>
                                  }
                                />
                              </div>
                            </InlineStack>
                          </fetcher.Form>
                        </BlockStack>
                      </Card>

                      <Card>
                        <BlockStack gap="400">
                          <Text as="h2" variant="headingMd">
                            Reindex All Products
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Submits all your product URLs to Bing and Yandex at once. Great for initial setup or after making bulk changes. URLs are throttled automatically to respect rate limits.
                          </Text>
                          <fetcher.Form method="post">
                            <input type="hidden" name="intent" value="submit-batch" />
                            <Button
                              submit
                              loading={isSubmitting && fetcher.formData?.get("intent") === "submit-batch"}
                            >
                              Reindex All Products
                            </Button>
                          </fetcher.Form>
                        </BlockStack>
                      </Card>
                    </BlockStack>
                  )}

                  {/* ——— Submission Log Tab ——— */}
                  {selectedTab === 1 && (
                    <BlockStack gap="400">
                      <Card padding="0">
                        {submissionRows.length > 0 ? (
                          <DataTable
                            columnContentTypes={["text", "text", "text", "text", "text"]}
                            headings={["URL", "Status", "Engine", "Source", "Submitted"]}
                            rows={submissionRows}
                            hoverable
                          />
                        ) : (
                          <Box padding="800">
                            <EmptyState
                              heading="No submissions yet"
                              image=""
                            >
                              <Text as="p" tone="subdued">
                                Submit your first URL from the Submit tab to see it here.
                              </Text>
                            </EmptyState>
                          </Box>
                        )}
                      </Card>

                      {totalPages > 1 && (
                        <InlineStack align="center">
                          <Pagination
                            hasPrevious={page > 1}
                            hasNext={page < totalPages}
                            onPrevious={() => setSearchParams({ tab: "log", page: String(page - 1) })}
                            onNext={() => setSearchParams({ tab: "log", page: String(page + 1) })}
                            label={`Page ${page} of ${totalPages}`}
                          />
                        </InlineStack>
                      )}
                    </BlockStack>
                  )}

                  {/* ——— Index Status Tab ——— */}
                  {selectedTab === 2 && (
                    <BlockStack gap="400">
                      {!hasGa4 && summary.total > 0 && (
                        <Banner tone="info">
                          <Text as="p" variant="bodyMd">
                            Connect Google in Settings to see how many sessions each indexed page is getting.
                          </Text>
                        </Banner>
                      )}
                      {/* Summary Stats */}
                      <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
                        <Card>
                          <BlockStack gap="200">
                            <Text as="p" variant="bodySm" tone="subdued">Total URLs</Text>
                            <Text as="p" variant="heading2xl">{summary.total}</Text>
                          </BlockStack>
                        </Card>
                        <Card>
                          <BlockStack gap="200">
                            <Text as="p" variant="bodySm" tone="subdued">Bing Indexed</Text>
                            <InlineStack gap="200" blockAlign="end">
                              <Text as="p" variant="heading2xl">{summary.bingIndexed}</Text>
                              <Text as="p" variant="bodySm" tone="subdued">{bingPct}%</Text>
                            </InlineStack>
                            <ProgressBar progress={bingPct} size="small" tone="primary" />
                          </BlockStack>
                        </Card>
                        <Card>
                          <BlockStack gap="200">
                            <Text as="p" variant="bodySm" tone="subdued">Google Indexed</Text>
                            <InlineStack gap="200" blockAlign="end">
                              <Text as="p" variant="heading2xl">{summary.googleIndexed}</Text>
                              <Text as="p" variant="bodySm" tone="subdued">{googlePct}%</Text>
                            </InlineStack>
                            <ProgressBar progress={googlePct} size="small" tone="primary" />
                          </BlockStack>
                        </Card>
                      </InlineGrid>

                      {/* Table + Re-check button */}
                      <Card padding="0">
                        <Box padding="400" paddingBlockEnd="0">
                          <InlineStack align="space-between" blockAlign="center">
                            <Text as="h2" variant="headingMd">URL Index Status</Text>
                            <fetcher.Form method="post">
                              <input type="hidden" name="intent" value="recheck-all" />
                              <Button
                                submit
                                loading={isSubmitting && fetcher.formData?.get("intent") === "recheck-all"}
                              >
                                Re-check All
                              </Button>
                            </fetcher.Form>
                          </InlineStack>
                        </Box>
                        {statusRows.length > 0 ? (
                          <DataTable
                            columnContentTypes={["text", "text", "text", "numeric", "text"]}
                            headings={["URL", "Bing", "Google", "Sessions (30d)", "Last Checked"]}
                            rows={statusRows}
                            hoverable
                          />
                        ) : (
                          <Box padding="800">
                            <EmptyState
                              heading="No URLs monitored yet"
                              image=""
                            >
                              <Text as="p" tone="subdued">
                                Submit URLs first, then their index status will be tracked here after the daily check runs.
                              </Text>
                            </EmptyState>
                          </Box>
                        )}
                      </Card>
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
