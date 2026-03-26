import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher, useSearchParams } from "react-router";
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
  Divider,
  Collapsible,
  Pagination,
} from "@shopify/polaris";
import { ChevronDownIcon, ChevronUpIcon } from "@shopify/polaris-icons";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const status = url.searchParams.get("status") || undefined;
  const pageSize = 25;

  const store = await prisma.store.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!store)
    return {
      submissions: [],
      total: 0,
      page,
      pageSize,
      statuses: [],
      summary: { total: 0, bingIndexed: 0, googleIndexed: 0 },
      hasGa4: false,
      bingQuota: null as { dailyQuota: number; monthlyQuota: number } | null,
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

  // Fetch Bing submission quota if OAuth connected
  let bingQuota: { dailyQuota: number; monthlyQuota: number } | null = null;
  if (store.bingRefreshToken) {
    try {
      const { getBingAccessToken } = await import("../lib/bing-oauth.server");
      const { getUrlSubmissionQuota } = await import("../services/bing-webmaster.server");
      const bingToken = await getBingAccessToken(store.id);
      if (bingToken) {
        bingQuota = await getUrlSubmissionQuota(
          { oauthToken: bingToken },
          `https://${store.shopDomain}`
        );
      }
    } catch {}
  }

  return {
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
    bingQuota,
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
    if (!store.indexnowKey) return { error: "IndexNow key not generated. Go to Settings to generate one." };
    try {
      const { submitUrl } = await import("../services/indexnow.server");
      let submitted = 0;
      for (const engine of ["bing", "yandex"] as const) {
        try {
          const result = await submitUrl(url, session.shop, store.indexnowKey, engine);
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
      // Also submit via Bing Webmaster API if OAuth connected
      if (store.bingRefreshToken) {
        try {
          const { getBingAccessToken } = await import("../lib/bing-oauth.server");
          const bingWebmaster = await import("../services/bing-webmaster.server");
          const bingToken = await getBingAccessToken(store.id);
          if (bingToken) {
            const bingResult = await bingWebmaster.submitUrl(
              { oauthToken: bingToken },
              `https://${session.shop}`,
              url
            );
            await prisma.urlSubmission.create({
              data: {
                storeId: store.id, url, status: bingResult.success ? "sent" : "failed",
                responseCode: bingResult.status, source: "manual", engine: "bing-api",
                errorMessage: bingResult.success ? null : `HTTP ${bingResult.status}`,
              },
            });
            if (bingResult.success) submitted++;
          }
        } catch {}
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

      if (!store.indexnowKey) return { error: "IndexNow key not generated. Go to Settings to generate one." };
      const { submitBatch } = await import("../services/indexnow.server");
      const urls = products.map((p: any) => `https://${session.shop}/products/${p.handle}`);

      let submitted = 0;
      let failed = 0;
      for (const engine of ["bing", "yandex"] as const) {
        try {
          const result = await submitBatch(urls, session.shop, store.indexnowKey, engine);
          // Log each URL in the batch for the submission log
          for (const url of urls) {
            await prisma.urlSubmission.create({
              data: {
                storeId: store.id, url, status: result.success ? "sent" : "failed",
                responseCode: result.status, source: "batch", engine,
                errorMessage: result.success ? null : result.message,
              },
            });
          }
          if (result.success) submitted++; else failed++;
        } catch (err) {
          for (const url of urls) {
            await prisma.urlSubmission.create({
              data: { storeId: store.id, url, status: "failed", source: "batch", engine, errorMessage: (err as Error).message },
            });
          }
          failed++;
        }
      }
      // Also submit via Bing Webmaster API if OAuth connected
      if (store.bingRefreshToken) {
        try {
          const { getBingAccessToken } = await import("../lib/bing-oauth.server");
          const bingWebmaster = await import("../services/bing-webmaster.server");
          const bingToken = await getBingAccessToken(store.id);
          if (bingToken) {
            const bingResult = await bingWebmaster.submitUrlBatch(
              { oauthToken: bingToken },
              `https://${session.shop}`,
              urls
            );
            for (const url of urls) {
              await prisma.urlSubmission.create({
                data: {
                  storeId: store.id, url, status: bingResult.success ? "sent" : "failed",
                  responseCode: bingResult.status, source: "batch", engine: "bing-api",
                  errorMessage: bingResult.success ? null : `HTTP ${bingResult.status}`,
                },
              });
            }
            if (bingResult.success) submitted++; else failed++;
          }
        } catch { failed++; }
      }

      await prisma.activityLog.create({
        data: { storeId: store.id, type: "indexnow_submit", message: `Batch: ${urls.length} URLs × ${submitted} engines sent (${failed} engine failures)` },
      });
      return {
        success: true,
        message: `${urls.length} product URLs submitted to ${submitted} engines via batch API`,
      };
    } catch {
      return { error: "Batch submission failed." };
    }
  }

  if (intent === "recheck-all") {
    // Run index checks synchronously (no Redis dependency)
    const submittedUrls = await prisma.urlSubmission.findMany({
      where: { storeId: store.id, status: "sent" },
      distinct: ["url"],
      select: { url: true },
    });

    if (submittedUrls.length === 0) {
      return { error: "No submitted URLs to check." };
    }

    let checked = 0;
    for (const { url } of submittedUrls) {
      const updateData: any = { lastCheckedAt: new Date() };

      // Check Google index status via OAuth
      try {
        const { getGoogleAccessToken } = await import("../lib/google-oauth.server");
        const oauthToken = await getGoogleAccessToken(store.id);
        if (oauthToken) {
          const { inspectUrl } = await import("../services/gsc.server");
          const gscResult = await inspectUrl(oauthToken, `https://${store.shopDomain}`, url, true);
          updateData.googleIndexed = gscResult.indexed;
          updateData.googleLastCrawl = gscResult.lastCrawl;
        }
      } catch (error) {
        console.error(`GSC inspection error for ${url}:`, error);
      }

      // Check Bing index status — prefer OAuth, fall back to API key
      try {
        const { getBingAccessToken } = await import("../lib/bing-oauth.server");
        const bingOAuthToken = await getBingAccessToken(store.id);
        const bingAuth = bingOAuthToken
          ? { oauthToken: bingOAuthToken }
          : store.bingWebmasterApiKey
            ? { apiKey: (await import("../lib/encryption.server")).decrypt(store.bingWebmasterApiKey) }
            : null;

        if (bingAuth) {
          const { getUrlInfo } = await import("../services/bing-webmaster.server");
          const bingResult = await getUrlInfo(
            bingAuth,
            `https://${store.shopDomain}`,
            url
          );
          updateData.bingIndexed = bingResult.indexed;
          updateData.bingLastCrawl = bingResult.lastCrawl;
        }
      } catch (error) {
        console.error(`Bing index check error for ${url}:`, error);
      }

      await prisma.urlIndexStatus.upsert({
        where: { storeId_url: { storeId: store.id, url } },
        create: { storeId: store.id, url, ...updateData },
        update: updateData,
      });
      checked++;
    }

    await prisma.activityLog.create({
      data: {
        storeId: store.id,
        type: "index_check",
        message: `Index status checked for ${checked} URLs`,
      },
    });

    return { success: true, message: `Index status checked for ${checked} URLs` };
  }

  if (intent === "clear-submissions") {
    await prisma.urlSubmission.deleteMany({ where: { storeId: store.id } });
    await prisma.urlIndexStatus.deleteMany({ where: { storeId: store.id } });
    return { success: true, message: "Submission log and index status cleared." };
  }

  return null;
};

export default function IndexingPage() {
  const { submissions, total, page, pageSize, statuses, summary, hasGa4, bingQuota } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const totalPages = Math.ceil(total / pageSize);
  const isSubmitting = fetcher.state !== "idle";
  const actionData = fetcher.data as any;
  const [urlValue, setUrlValue] = useState("");
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    if (actionData?.success && actionData.message) {
      (window as any).shopify?.toast?.show?.(actionData.message);
      if (actionData.message.includes("submitted") || actionData.message.includes("queued")) setUrlValue("");
    }
    if (actionData?.error) {
      (window as any).shopify?.toast?.show?.(actionData.error, { isError: true });
    }
  }, [actionData]);

  const bingPct = summary.total > 0 ? Math.round((summary.bingIndexed / summary.total) * 100) : 0;
  const googlePct = summary.total > 0 ? Math.round((summary.googleIndexed / summary.total) * 100) : 0;

  // Format submission rows for DataTable
  const submissionRows = submissions.map((sub: any) => [
    <Text as="span" variant="bodySm" truncate key={sub.id}>
      {sub.url.replace(/^https?:\/\//, "").substring(0, 50)}
      {sub.url.replace(/^https?:\/\//, "").length > 50 ? "..." : ""}
    </Text>,
    sub.responseCode ? (
      <Badge
        key={`code-${sub.id}`}
        tone={sub.responseCode === 200 ? "success" : sub.responseCode === 202 ? "info" : "critical"}
      >
        {String(sub.responseCode)}
      </Badge>
    ) : (
      <Badge key={`code-${sub.id}`} tone="attention">—</Badge>
    ),
    sub.engine || "—",
    sub.source || "—",
    new Date(sub.submittedAt).toLocaleDateString(),
  ]);

  // Format index status rows
  const statusRows = (statuses as any[]).map((s) => [
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
  ]);

  return (
    <s-page heading="Indexing">
      <ClientOnly
        fallback={
          <s-card><s-box padding="base"><s-text>Loading...</s-text></s-box></s-card>
        }
      >
        {() => (
          <PolarisProvider>
            <BlockStack gap="500">
              {/* ——— Bing Quota ——— */}
              {bingQuota && (
                <Card>
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="p" variant="headingSm">Bing API Submission Quota</Text>
                      <Badge tone="info">Direct API</Badge>
                    </InlineStack>
                    <InlineGrid columns={2} gap="400">
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" tone="subdued">Daily Quota</Text>
                        <Text as="p" variant="headingMd">{bingQuota.dailyQuota.toLocaleString()}</Text>
                      </BlockStack>
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" tone="subdued">Monthly Quota</Text>
                        <Text as="p" variant="headingMd">{bingQuota.monthlyQuota.toLocaleString()}</Text>
                      </BlockStack>
                    </InlineGrid>
                  </BlockStack>
                </Card>
              )}

              {/* ——— Submit URL ——— */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Submit a URL</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Submit any URL to Bing, Yandex (via IndexNow), and the Bing Webmaster API for instant indexing.
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

              {/* ——— Reindex All Products ——— */}
              <Card>
                <InlineStack align="space-between" blockAlign="center" wrap={false}>
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">Reindex All Products</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Submit all product URLs to all connected engines at once.
                    </Text>
                  </BlockStack>
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="submit-batch" />
                    <Button
                      submit
                      loading={isSubmitting && fetcher.formData?.get("intent") === "submit-batch"}
                    >
                      Reindex All
                    </Button>
                  </fetcher.Form>
                </InlineStack>
              </Card>

              {/* ——— Index Status ——— */}
              {!hasGa4 && summary.total > 0 && (
                <Banner tone="info">
                  <Text as="p" variant="bodyMd">
                    Connect Google in Settings to see how many sessions each indexed page is getting.
                  </Text>
                </Banner>
              )}

              <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
                <Card>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">Total URLs Tracked</Text>
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

              {/* URL Index Status Table */}
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
                  <Box padding="600">
                    <EmptyState heading="No URLs monitored yet">
                      <Text as="p" tone="subdued">
                        Submit URLs above, then click "Re-check All" to see their index status.
                      </Text>
                    </EmptyState>
                  </Box>
                )}
              </Card>

              {/* ——— Submission Logs (collapsible) ——— */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Button
                      variant="plain"
                      onClick={() => setShowLogs(!showLogs)}
                      icon={showLogs ? ChevronUpIcon : ChevronDownIcon}
                      textAlign="left"
                    >
                      Submission Log ({total})
                    </Button>
                    {total > 0 && (
                      <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="clear-submissions" />
                        <Button
                          variant="plain"
                          tone="critical"
                          submit
                          loading={isSubmitting && fetcher.formData?.get("intent") === "clear-submissions"}
                        >
                          Clear Log
                        </Button>
                      </fetcher.Form>
                    )}
                  </InlineStack>
                  <Collapsible open={showLogs} id="submission-logs">
                    <BlockStack gap="400">
                      {submissionRows.length > 0 ? (
                        <DataTable
                          columnContentTypes={["text", "text", "text", "text", "text"]}
                          headings={["URL", "Response", "Engine", "Source", "Submitted"]}
                          rows={submissionRows}
                          hoverable
                        />
                      ) : (
                        <Box padding="400">
                          <Text as="p" tone="subdued">
                            No submissions yet. Submit a URL above to see the log here.
                          </Text>
                        </Box>
                      )}
                      {totalPages > 1 && (
                        <InlineStack align="center">
                          <Pagination
                            hasPrevious={page > 1}
                            hasNext={page < totalPages}
                            onPrevious={() => setSearchParams({ page: String(page - 1) })}
                            onNext={() => setSearchParams({ page: String(page + 1) })}
                            label={`Page ${page} of ${totalPages}`}
                          />
                        </InlineStack>
                      )}
                    </BlockStack>
                  </Collapsible>
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
