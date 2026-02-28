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
import { PricingCard } from "../components/PricingCard";
import {
  Card,
  BlockStack,
  InlineGrid,
  InlineStack,
  Text,
  TextField,
  Button,
  Badge,
  Tabs,
  Banner,
  Box,
  FormLayout,
  Divider,
  Icon,
  Collapsible,
  Select,
  Spinner,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  AlertCircleIcon,
  RefreshIcon,
  DeleteIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@shopify/polaris-icons";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const store = await prisma.store.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!store) return { store: null, competitors: [], currentPlan: "free" };

  const competitors = await prisma.competitor.findMany({
    where: { storeId: store.id },
  });

  return {
    store: {
      shopDomain: store.shopDomain,
      plan: store.plan,
      indexnowKey: store.indexnowKey,
      hasBingWebmaster: !!store.bingWebmasterApiKey,
      hasGsc: !!store.gscCredentials,
      hasBingSearch: !!store.bingSearchApiKey,
      hasYandex: !!store.yandexWebmasterToken,
      hasGa4: !!store.ga4MeasurementId && !!store.ga4ApiSecret,
      hasGa4Reporting: !!store.ga4PropertyId && !!store.ga4Credentials,
      ga4MeasurementId: store.ga4MeasurementId || "",
      ga4PropertyId: store.ga4PropertyId || "",
      llmsTxtAutoGenerate: store.llmsTxtAutoGenerate,
      llmsTxtContent: store.llmsTxtContent || "",
      llmsTxtUrl: `https://${store.shopDomain}/apps/indexnow/llms.txt`,
      hasGoogleOAuth: !!store.googleRefreshToken,
      googleEmail: store.googleEmail || "",
      googleScopes: store.googleScopes || "",
      ga4PropertyId: store.ga4PropertyId || "",
    },
    competitors,
    currentPlan: store.plan || "free",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const store = await prisma.store.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!store) return { error: "Store not found" };

  const { encrypt } = await import("../lib/encryption.server");

  if (intent === "change-plan") {
    const plan = formData.get("plan") as string;
    if (plan && plan !== "free") {
      await billing.request({ plan, isTest: true });
    }
    if (plan === "free") {
      await prisma.store.update({
        where: { id: store.id },
        data: { plan: "free" },
      });
      return { success: true, message: "Downgraded to Free plan." };
    }
    return null;
  }

  if (intent === "save-bing-webmaster") {
    const key = formData.get("apiKey") as string;
    await prisma.store.update({
      where: { id: store.id },
      data: { bingWebmasterApiKey: key ? encrypt(key) : null },
    });
    return { success: true, message: "Bing Webmaster API key saved." };
  }

  if (intent === "save-gsc") {
    const json = formData.get("credentials") as string;
    try {
      if (json) JSON.parse(json);
    } catch {
      return { error: "Invalid JSON credentials." };
    }
    await prisma.store.update({
      where: { id: store.id },
      data: { gscCredentials: json ? encrypt(json) : null },
    });
    return { success: true, message: "Google Search Console credentials saved." };
  }

  if (intent === "save-bing-search") {
    const key = formData.get("apiKey") as string;
    await prisma.store.update({
      where: { id: store.id },
      data: { bingSearchApiKey: key ? encrypt(key) : null },
    });
    return { success: true, message: "Bing Search API key saved." };
  }

  if (intent === "save-yandex") {
    const token = formData.get("apiKey") as string;
    await prisma.store.update({
      where: { id: store.id },
      data: { yandexWebmasterToken: token ? encrypt(token) : null },
    });
    return { success: true, message: "Yandex Webmaster token saved." };
  }

  if (intent === "save-ga4-events") {
    const measurementId = formData.get("measurementId") as string;
    const apiSecret = formData.get("apiSecret") as string;
    await prisma.store.update({
      where: { id: store.id },
      data: {
        ga4MeasurementId: measurementId || null,
        ga4ApiSecret: apiSecret ? encrypt(apiSecret) : null,
      },
    });
    return { success: true, message: "GA4 event tracking settings saved." };
  }

  if (intent === "save-ga4-reporting") {
    const propertyId = formData.get("propertyId") as string;
    const credentials = formData.get("credentials") as string;
    if (credentials) {
      try {
        JSON.parse(credentials);
      } catch {
        return { error: "Invalid JSON credentials for GA4 service account." };
      }
    }
    await prisma.store.update({
      where: { id: store.id },
      data: {
        ga4PropertyId: propertyId || null,
        ga4Credentials: credentials ? encrypt(credentials) : null,
      },
    });
    return { success: true, message: "GA4 reporting settings saved." };
  }

  if (intent === "regenerate-llms-txt") {
    try {
      const { getOrGenerateLlmsTxt } = await import("../services/llms-txt.server");
      await prisma.store.update({
        where: { id: store.id },
        data: { llmsTxtContent: null, llmsTxtAutoGenerate: true },
      });
      await getOrGenerateLlmsTxt(store.id, store.shopDomain, store.accessToken);
      return { success: true, message: "llms.txt regenerated from your store data." };
    } catch (err) {
      return { error: `Failed to regenerate: ${(err as Error).message}` };
    }
  }

  if (intent === "save-llms-txt") {
    const content = formData.get("llmsTxtContent") as string;
    await prisma.store.update({
      where: { id: store.id },
      data: { llmsTxtContent: content || null, llmsTxtAutoGenerate: false },
    });
    return { success: true, message: "Custom llms.txt saved." };
  }

  if (intent === "reset-llms-txt-auto") {
    await prisma.store.update({
      where: { id: store.id },
      data: { llmsTxtAutoGenerate: true, llmsTxtContent: null },
    });
    return { success: true, message: "Switched to auto-generated llms.txt." };
  }

  if (intent === "add-competitor") {
    const domain = formData.get("domain") as string;
    if (!domain) return { error: "Domain is required" };

    const { checkCompetitorLimit } = await import("../lib/plan-limits.server");
    const limit = await checkCompetitorLimit(store.id, store.plan);
    if (!limit.allowed)
      return { error: `Competitor limit reached (${limit.current}/${limit.max}). Upgrade your plan.` };

    await prisma.competitor.create({ data: { storeId: store.id, domain } });
    return { success: true, message: `Competitor "${domain}" added.` };
  }

  if (intent === "remove-competitor") {
    const competitorId = formData.get("competitorId") as string;
    await prisma.competitor.delete({ where: { id: competitorId } });
    return { success: true, message: "Competitor removed." };
  }

  if (intent === "regenerate-key") {
    const crypto = await import("node:crypto");
    await prisma.store.update({
      where: { id: store.id },
      data: { indexnowKey: crypto.randomUUID().replace(/-/g, "") },
    });
    return { success: true, message: "IndexNow key regenerated." };
  }

  if (intent === "save-ga4-property") {
    const propertyId = formData.get("propertyId") as string;
    await prisma.store.update({
      where: { id: store.id },
      data: { ga4PropertyId: propertyId || null },
    });
    return { success: true, message: "GA4 property selected." };
  }

  return null;
};

const plans = [
  {
    name: "Free",
    price: "$0",
    description: "Get started with basic URL indexing",
    features: [
      "50 URL submissions/month",
      "Basic Bing indexing",
      "7-day submission logs",
      "3 keyword tracking slots",
    ],
    key: "free",
  },
  {
    name: "Starter",
    price: "$19",
    description: "For growing stores that need reliable indexing",
    features: [
      "500 URL submissions/month",
      "Bing index monitoring",
      "Basic AI visibility tracking",
      "10 keyword tracking slots",
      "3 competitors",
    ],
    key: "Starter",
  },
  {
    name: "Growth",
    price: "$49",
    description: "Full visibility intelligence for scaling stores",
    featured: true,
    features: [
      "2,000 URL submissions/month",
      "Google + Bing index tracking",
      "AI citation tracking",
      "50 keyword tracking slots",
      "10 competitors",
      "Email alerts",
    ],
    key: "Growth",
  },
  {
    name: "Pro",
    price: "$99",
    description: "Maximum power for high-traffic stores",
    features: [
      "Unlimited URL submissions",
      "AI SEO assistant",
      "Competitor diff engine",
      "200 keyword tracking slots",
      "25 competitors",
      "API access",
    ],
    key: "Pro",
  },
];

function ConnectionStatus({ connected }: { connected: boolean }) {
  return connected ? (
    <Badge tone="success" icon={CheckCircleIcon}>Connected</Badge>
  ) : (
    <Badge tone="attention">Not connected</Badge>
  );
}

export default function SettingsPage() {
  const { store, competitors, currentPlan } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";
  const actionData = fetcher.data as any;
  const [competitorDomain, setCompetitorDomain] = useState("");
  const [selectedTab, setSelectedTab] = useState(() => {
    const tab = searchParams.get("tab");
    if (tab === "connections") return 1;
    if (tab === "billing") return 2;
    return 0;
  });
  const [googleConnecting, setGoogleConnecting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const googleDisconnectFetcher = useFetcher();
  const propertyFetcher = useFetcher();
  const [ga4Properties, setGa4Properties] = useState<{ propertyId: string; displayName: string; accountName: string }[]>([]);
  const [ga4PropertiesLoaded, setGa4PropertiesLoaded] = useState(false);
  const [ga4PropertiesLoading, setGa4PropertiesLoading] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState(store?.ga4PropertyId || "");

  useEffect(() => {
    if (actionData?.success && actionData.message) {
      (window as any).shopify?.toast?.show?.(actionData.message);
      if (actionData.message.includes("added")) setCompetitorDomain("");
    }
    if (actionData?.error) {
      (window as any).shopify?.toast?.show?.(actionData.error, { isError: true });
    }
  }, [actionData]);

  // Listen for Google OAuth popup success
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "google-oauth-success") {
        setGoogleConnecting(false);
        (window as any).shopify?.toast?.show?.("Google account connected!");
        // Revalidate to get updated store data
        window.location.reload();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Handle Google disconnect fetcher response
  useEffect(() => {
    const data = googleDisconnectFetcher.data as any;
    if (data?.success) {
      (window as any).shopify?.toast?.show?.(data.message);
      window.location.reload();
    }
    if (data?.error) {
      (window as any).shopify?.toast?.show?.(data.error, { isError: true });
    }
  }, [googleDisconnectFetcher.data]);

  const handleGoogleConnect = useCallback(async () => {
    setGoogleConnecting(true);
    try {
      const response = await fetch("/auth/google");
      const { authUrl } = await response.json();
      const popup = window.open(authUrl, "google-oauth", "width=500,height=600,popup=yes");
      // If popup was blocked, reset state
      if (!popup) {
        setGoogleConnecting(false);
        (window as any).shopify?.toast?.show?.("Please allow popups to connect Google.", { isError: true });
      }
    } catch {
      setGoogleConnecting(false);
      (window as any).shopify?.toast?.show?.("Failed to start Google connection.", { isError: true });
    }
  }, []);

  const handleGoogleDisconnect = useCallback(() => {
    googleDisconnectFetcher.submit(null, {
      method: "post",
      action: "/auth/google/disconnect",
    });
  }, [googleDisconnectFetcher]);

  // Fetch GA4 properties when OAuth is connected and tab is visible
  const loadGa4Properties = useCallback(async () => {
    if (ga4PropertiesLoaded || ga4PropertiesLoading) return;
    setGa4PropertiesLoading(true);
    try {
      const response = await fetch("/api/google-properties");
      const data = await response.json();
      if (data.properties) {
        setGa4Properties(data.properties);
        if (data.selectedPropertyId) {
          setSelectedPropertyId(data.selectedPropertyId);
        }
      }
    } catch (err) {
      console.error("Failed to load GA4 properties:", err);
    } finally {
      setGa4PropertiesLoading(false);
      setGa4PropertiesLoaded(true);
    }
  }, [ga4PropertiesLoaded, ga4PropertiesLoading]);

  // Auto-load properties when connections tab is active and OAuth connected
  useEffect(() => {
    if (selectedTab === 1 && store?.hasGoogleOAuth && !ga4PropertiesLoaded) {
      loadGa4Properties();
    }
  }, [selectedTab, store?.hasGoogleOAuth, ga4PropertiesLoaded, loadGa4Properties]);

  const handlePropertyChange = useCallback((value: string) => {
    setSelectedPropertyId(value);
    const fd = new FormData();
    fd.set("intent", "save-ga4-property");
    fd.set("propertyId", value);
    fetcher.submit(fd, { method: "post" });
  }, [fetcher]);

  const handleTabChange = useCallback((index: number) => {
    setSelectedTab(index);
    const tabs = ["general", "connections", "billing"];
    setSearchParams({ tab: tabs[index] });
  }, [setSearchParams]);

  if (!store)
    return (
      <s-page heading="Settings">
        <s-card><s-box padding="base"><s-text>Store not found. Please reinstall the app.</s-text></s-box></s-card>
      </s-page>
    );

  const tabs = [
    { id: "general", content: "General" },
    { id: "connections", content: "API Connections" },
    { id: "billing", content: "Billing & Plans" },
  ];

  return (
    <s-page heading="Settings">
      <ClientOnly
        fallback={<s-card><s-box padding="base"><s-text>Loading...</s-text></s-box></s-card>}
      >
        {() => (
          <PolarisProvider>
            <BlockStack gap="400">
              <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
                <Box paddingBlockStart="400">

                  {/* ——— General Tab ——— */}
                  {selectedTab === 0 && (
                    <BlockStack gap="500">
                      {/* llms.txt */}
                      <Card>
                        <BlockStack gap="400">
                          <BlockStack gap="200">
                            <Text as="h2" variant="headingMd">llms.txt — AI Crawler File</Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              llms.txt helps AI models (ChatGPT, Gemini, Perplexity) understand your store.
                              It's like robots.txt but for LLMs.
                            </Text>
                            <InlineStack gap="200" blockAlign="center">
                              <Badge tone="info">Hosted at</Badge>
                              <Text as="p" variant="bodySm">{store.llmsTxtUrl}</Text>
                            </InlineStack>
                          </BlockStack>

                          <InlineStack gap="200">
                            <fetcher.Form method="post">
                              <input type="hidden" name="intent" value="regenerate-llms-txt" />
                              <Button
                                variant="primary"
                                submit
                                loading={isSubmitting && fetcher.formData?.get("intent") === "regenerate-llms-txt"}
                              >
                                {store.llmsTxtContent ? "Regenerate from Store Data" : "Generate llms.txt"}
                              </Button>
                            </fetcher.Form>
                            {!store.llmsTxtAutoGenerate && (
                              <fetcher.Form method="post">
                                <input type="hidden" name="intent" value="reset-llms-txt-auto" />
                                <Button variant="plain" submit>Switch to Auto-Generate</Button>
                              </fetcher.Form>
                            )}
                          </InlineStack>

                          {store.llmsTxtContent && (
                            <>
                              <Divider />
                              <Text as="h3" variant="headingSm">
                                {store.llmsTxtAutoGenerate ? "Auto-Generated Content (edit to customize)" : "Custom Content"}
                              </Text>
                              <fetcher.Form method="post">
                                <input type="hidden" name="intent" value="save-llms-txt" />
                                <FormLayout>
                                  <TextField
                                    label=""
                                    name="llmsTxtContent"
                                    value={store.llmsTxtContent}
                                    multiline={12}
                                    monospaced
                                    autoComplete="off"
                                  />
                                  <Button
                                    submit
                                    loading={isSubmitting && fetcher.formData?.get("intent") === "save-llms-txt"}
                                  >
                                    Save Custom llms.txt
                                  </Button>
                                </FormLayout>
                              </fetcher.Form>
                            </>
                          )}
                        </BlockStack>
                      </Card>

                      {/* IndexNow Key */}
                      <Card>
                        <BlockStack gap="300">
                          <Text as="h2" variant="headingMd">IndexNow Key</Text>
                          <InlineStack gap="200" blockAlign="center">
                            <Badge>{store.indexnowKey || "Not generated"}</Badge>
                          </InlineStack>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Hosted at {store.shopDomain}/apps/indexnow/{store.indexnowKey}.txt
                          </Text>
                          <fetcher.Form method="post">
                            <input type="hidden" name="intent" value="regenerate-key" />
                            <Button
                              variant="plain"
                              icon={RefreshIcon}
                              submit
                              loading={isSubmitting && fetcher.formData?.get("intent") === "regenerate-key"}
                            >
                              Regenerate Key
                            </Button>
                          </fetcher.Form>
                        </BlockStack>
                      </Card>

                      {/* Competitors */}
                      <Card>
                        <BlockStack gap="400">
                          <Text as="h2" variant="headingMd">Competitors</Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Add competitor domains to track their AI search visibility alongside yours.
                          </Text>
                          <fetcher.Form method="post">
                            <input type="hidden" name="intent" value="add-competitor" />
                            <InlineStack gap="300" blockAlign="end" wrap={false}>
                              <div style={{ flexGrow: 1 }}>
                                <TextField
                                  label="Domain"
                                  name="domain"
                                  value={competitorDomain}
                                  onChange={setCompetitorDomain}
                                  placeholder="competitor.com"
                                  autoComplete="off"
                                  connectedRight={
                                    <Button
                                      submit
                                      loading={isSubmitting && fetcher.formData?.get("intent") === "add-competitor"}
                                    >
                                      Add
                                    </Button>
                                  }
                                />
                              </div>
                            </InlineStack>
                          </fetcher.Form>

                          {competitors.length > 0 ? (
                            <BlockStack gap="200">
                              {competitors.map((c: any) => (
                                <InlineStack key={c.id} align="space-between" blockAlign="center">
                                  <Text as="span" variant="bodyMd">{c.domain}</Text>
                                  <fetcher.Form method="post" style={{ display: "inline" }}>
                                    <input type="hidden" name="intent" value="remove-competitor" />
                                    <input type="hidden" name="competitorId" value={c.id} />
                                    <Button variant="plain" tone="critical" icon={DeleteIcon} submit>
                                      Remove
                                    </Button>
                                  </fetcher.Form>
                                </InlineStack>
                              ))}
                            </BlockStack>
                          ) : (
                            <Text as="p" tone="subdued" variant="bodySm">
                              No competitors added yet.
                            </Text>
                          )}
                        </BlockStack>
                      </Card>
                    </BlockStack>
                  )}

                  {/* ——— API Connections Tab ——— */}
                  {selectedTab === 1 && (
                    <BlockStack gap="500">
                      {/* ── Primary: Connect with Google ── */}
                      <Card>
                        <BlockStack gap="400">
                          <InlineStack align="space-between" blockAlign="center">
                            <Text as="h2" variant="headingMd">Google Account</Text>
                            {store.hasGoogleOAuth ? (
                              <Badge tone="success" icon={CheckCircleIcon}>Connected</Badge>
                            ) : (
                              <Badge tone="attention">Not connected</Badge>
                            )}
                          </InlineStack>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Connect your Google account to enable Search Console index tracking
                            and Analytics traffic reporting with one click.
                          </Text>
                          {store.hasGoogleOAuth ? (
                            <BlockStack gap="400">
                              <InlineStack gap="200" blockAlign="center">
                                <Text as="span" variant="bodySm" tone="subdued">Signed in as</Text>
                                <Badge>{store.googleEmail}</Badge>
                              </InlineStack>
                              <InlineStack gap="200" blockAlign="center">
                                <Badge tone="success" size="small">Search Console</Badge>
                                <Badge tone="success" size="small">GA4 Reporting</Badge>
                              </InlineStack>

                              <Divider />

                              {/* GA4 Property Picker */}
                              <BlockStack gap="200">
                                <Text as="h3" variant="headingSm">GA4 Property</Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Select which Google Analytics property to pull traffic data from.
                                </Text>
                                {ga4PropertiesLoading ? (
                                  <InlineStack gap="200" blockAlign="center">
                                    <Spinner size="small" />
                                    <Text as="span" variant="bodySm" tone="subdued">Loading properties...</Text>
                                  </InlineStack>
                                ) : ga4Properties.length > 0 ? (
                                  <Select
                                    label="Property"
                                    labelHidden
                                    options={[
                                      { label: "Select a property...", value: "" },
                                      ...ga4Properties.map((p) => ({
                                        label: `${p.displayName} (${p.accountName}) — ${p.propertyId}`,
                                        value: p.propertyId,
                                      })),
                                    ]}
                                    value={selectedPropertyId}
                                    onChange={handlePropertyChange}
                                  />
                                ) : ga4PropertiesLoaded ? (
                                  <Banner tone="warning">
                                    <Text as="p" variant="bodySm">
                                      No GA4 properties found. Make sure your Google account has access to at least one Analytics property.
                                    </Text>
                                  </Banner>
                                ) : null}
                                {selectedPropertyId && (
                                  <InlineStack gap="200" blockAlign="center">
                                    <Badge tone="success" size="small">Active</Badge>
                                    <Text as="span" variant="bodySm" tone="subdued">
                                      Property ID: {selectedPropertyId}
                                    </Text>
                                  </InlineStack>
                                )}
                              </BlockStack>

                              <Divider />

                              <Button
                                tone="critical"
                                variant="plain"
                                onClick={handleGoogleDisconnect}
                                loading={googleDisconnectFetcher.state !== "idle"}
                              >
                                Disconnect Google Account
                              </Button>
                            </BlockStack>
                          ) : (
                            <Button
                              variant="primary"
                              onClick={handleGoogleConnect}
                              loading={googleConnecting}
                            >
                              Connect with Google
                            </Button>
                          )}
                        </BlockStack>
                      </Card>

                      {/* ── Connection Overview ── */}
                      <Card>
                        <BlockStack gap="400">
                          <Text as="h2" variant="headingMd">Connection Status</Text>
                          <InlineGrid columns={{ xs: 2, md: 3 }} gap="300">
                            <InlineStack gap="200" blockAlign="center">
                              <ConnectionStatus connected={store.hasGsc || store.hasGoogleOAuth} />
                              <Text as="span" variant="bodySm">Google Search Console</Text>
                            </InlineStack>
                            <InlineStack gap="200" blockAlign="center">
                              <ConnectionStatus connected={store.hasGa4Reporting || store.hasGoogleOAuth} />
                              <Text as="span" variant="bodySm">GA4 Reporting</Text>
                            </InlineStack>
                            <InlineStack gap="200" blockAlign="center">
                              <ConnectionStatus connected={store.hasBingWebmaster} />
                              <Text as="span" variant="bodySm">Bing Webmaster</Text>
                            </InlineStack>
                          </InlineGrid>
                        </BlockStack>
                      </Card>

                      {/* ── Advanced Mode Toggle ── */}
                      <Card>
                        <BlockStack gap="400">
                          <Button
                            variant="plain"
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            icon={showAdvanced ? ChevronUpIcon : ChevronDownIcon}
                            fullWidth
                            textAlign="left"
                          >
                            Advanced Settings
                          </Button>
                          <Collapsible open={showAdvanced} id="advanced-connections">
                            <BlockStack gap="500">
                              <Banner tone="info">
                                <Text as="p" variant="bodySm">
                                  These settings are for advanced users. Most features work automatically
                                  with the "Connect with Google" button above.
                                </Text>
                              </Banner>

                              {/* Bing Webmaster */}
                              <BlockStack gap="200">
                                <InlineStack gap="200" blockAlign="center">
                                  <Text as="h3" variant="headingSm">Bing Webmaster API</Text>
                                  <ConnectionStatus connected={store.hasBingWebmaster} />
                                </InlineStack>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Monitor Bing index status and search traffic for your store.
                                </Text>
                                <fetcher.Form method="post">
                                  <input type="hidden" name="intent" value="save-bing-webmaster" />
                                  <FormLayout>
                                    <TextField label="API Key" name="apiKey" type="password" autoComplete="off" />
                                    <Button submit loading={isSubmitting && fetcher.formData?.get("intent") === "save-bing-webmaster"}>Save</Button>
                                  </FormLayout>
                                </fetcher.Form>
                              </BlockStack>

                              <Divider />

                              {/* GSC Service Account */}
                              <BlockStack gap="200">
                                <InlineStack gap="200" blockAlign="center">
                                  <Text as="h3" variant="headingSm">Google Search Console (Service Account)</Text>
                                  <ConnectionStatus connected={store.hasGsc} />
                                </InlineStack>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  {store.hasGoogleOAuth
                                    ? "Already connected via OAuth. Only use this if you need a separate service account."
                                    : "Alternative to OAuth. Paste a Google Cloud service account JSON."}
                                </Text>
                                <fetcher.Form method="post">
                                  <input type="hidden" name="intent" value="save-gsc" />
                                  <FormLayout>
                                    <TextField label="Service Account JSON" name="credentials" multiline={4} monospaced autoComplete="off" placeholder="Paste the full service account JSON" />
                                    <Button submit loading={isSubmitting && fetcher.formData?.get("intent") === "save-gsc"}>Save</Button>
                                  </FormLayout>
                                </fetcher.Form>
                              </BlockStack>

                              <Divider />

                              {/* Bing Search (override) */}
                              <BlockStack gap="200">
                                <InlineStack gap="200" blockAlign="center">
                                  <Text as="h3" variant="headingSm">Bing Search API (Override)</Text>
                                  <ConnectionStatus connected={store.hasBingSearch} />
                                </InlineStack>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  AI visibility scanning is powered by IndexBeam. Use this only to override with your own Azure key.
                                </Text>
                                <fetcher.Form method="post">
                                  <input type="hidden" name="intent" value="save-bing-search" />
                                  <FormLayout>
                                    <TextField label="API Key" name="apiKey" type="password" autoComplete="off" />
                                    <Button submit loading={isSubmitting && fetcher.formData?.get("intent") === "save-bing-search"}>Save</Button>
                                  </FormLayout>
                                </fetcher.Form>
                              </BlockStack>

                              <Divider />

                              {/* Yandex */}
                              <BlockStack gap="200">
                                <InlineStack gap="200" blockAlign="center">
                                  <Text as="h3" variant="headingSm">Yandex Webmaster</Text>
                                  <ConnectionStatus connected={store.hasYandex} />
                                </InlineStack>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  For Russian/CIS market visibility. Only needed if you sell in those markets.
                                </Text>
                                <fetcher.Form method="post">
                                  <input type="hidden" name="intent" value="save-yandex" />
                                  <FormLayout>
                                    <TextField label="OAuth Token" name="apiKey" type="password" autoComplete="off" />
                                    <Button submit loading={isSubmitting && fetcher.formData?.get("intent") === "save-yandex"}>Save</Button>
                                  </FormLayout>
                                </fetcher.Form>
                              </BlockStack>

                              <Divider />

                              {/* GA4 Event Tracking */}
                              <BlockStack gap="200">
                                <InlineStack gap="200" blockAlign="center">
                                  <Text as="h3" variant="headingSm">GA4 Event Tracking (Measurement Protocol)</Text>
                                  <ConnectionStatus connected={store.hasGa4} />
                                </InlineStack>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Send IndexBeam events to your GA4 property. Optional — only if you want IndexBeam activity in your analytics.
                                </Text>
                                <fetcher.Form method="post">
                                  <input type="hidden" name="intent" value="save-ga4-events" />
                                  <FormLayout>
                                    <FormLayout.Group>
                                      <TextField label="Measurement ID" name="measurementId" placeholder="G-XXXXXXXXXX" value={store.ga4MeasurementId} autoComplete="off" />
                                      <TextField label="API Secret" name="apiSecret" type="password" placeholder="From GA4 Admin > Data Streams" autoComplete="off" />
                                    </FormLayout.Group>
                                    <Button submit loading={isSubmitting && fetcher.formData?.get("intent") === "save-ga4-events"}>Save</Button>
                                  </FormLayout>
                                </fetcher.Form>
                              </BlockStack>

                              <Divider />

                              {/* GA4 Reporting Service Account */}
                              <BlockStack gap="200">
                                <InlineStack gap="200" blockAlign="center">
                                  <Text as="h3" variant="headingSm">GA4 Traffic Reporting (Service Account)</Text>
                                  <ConnectionStatus connected={store.hasGa4Reporting} />
                                </InlineStack>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  {store.hasGoogleOAuth
                                    ? "Already connected via OAuth. Only use this if you need a separate service account."
                                    : "Alternative to OAuth for GA4 reporting data."}
                                </Text>
                                <fetcher.Form method="post">
                                  <input type="hidden" name="intent" value="save-ga4-reporting" />
                                  <FormLayout>
                                    <TextField label="GA4 Property ID" name="propertyId" placeholder="123456789" value={store.ga4PropertyId} autoComplete="off" />
                                    <TextField label="Service Account JSON" name="credentials" multiline={4} monospaced placeholder="Paste full service account JSON" autoComplete="off" />
                                    <Button submit loading={isSubmitting && fetcher.formData?.get("intent") === "save-ga4-reporting"}>Save</Button>
                                  </FormLayout>
                                </fetcher.Form>
                              </BlockStack>
                            </BlockStack>
                          </Collapsible>
                        </BlockStack>
                      </Card>
                    </BlockStack>
                  )}

                  {/* ——— Billing & Plans Tab ——— */}
                  {selectedTab === 2 && (
                    <BlockStack gap="400">
                      <Card>
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="100">
                            <Text as="h2" variant="headingMd">Current Plan</Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              Manage your subscription
                            </Text>
                          </BlockStack>
                          <Badge tone="success" size="large">
                            {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
                          </Badge>
                        </InlineStack>
                      </Card>

                      <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
                        {plans.map((plan) => {
                          const isCurrent = currentPlan.toLowerCase() === plan.key.toLowerCase();
                          return (
                            <PricingCard
                              key={plan.key}
                              title={plan.name}
                              description={plan.description}
                              price={plan.price}
                              frequency="month"
                              features={plan.features}
                              featuredText={(plan as any).featured ? "Most Popular" : undefined}
                              button={
                                isCurrent
                                  ? { content: "Current Plan", props: { disabled: true } }
                                  : {
                                      content: plan.key === "free" ? "Downgrade" : "Upgrade",
                                      props: {
                                        variant: "primary" as const,
                                        loading: isSubmitting,
                                        onClick: () => {
                                          const fd = new FormData();
                                          fd.set("intent", "change-plan");
                                          fd.set("plan", plan.key);
                                          fetcher.submit(fd, { method: "post" });
                                        },
                                      },
                                    }
                              }
                            />
                          );
                        })}
                      </InlineGrid>
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
