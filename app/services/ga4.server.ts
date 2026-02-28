/**
 * Google Analytics 4 Integration
 *
 * Two APIs:
 * 1. Measurement Protocol — Send server-side events (indexing, visibility scans)
 * 2. Data API (GA4 Reporting) — Pull page-level traffic data to show indexing ROI
 */

// ─── Measurement Protocol ───────────────────────────────────────────────────
// Fires events to the merchant's GA4 property so they can see IndexBeam
// activity in their own analytics dashboard.

const MP_ENDPOINT =
  "https://www.google-analytics.com/mp/collect";

interface MeasurementEvent {
  name: string;
  params: Record<string, string | number>;
}

export async function sendGA4Event(
  measurementId: string,
  apiSecret: string,
  clientId: string,
  events: MeasurementEvent[]
): Promise<boolean> {
  try {
    const response = await fetch(
      `${MP_ENDPOINT}?measurement_id=${measurementId}&api_secret=${apiSecret}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          events,
        }),
      }
    );
    // MP returns 204 on success, accepts even with 2xx
    return response.status >= 200 && response.status < 300;
  } catch (error) {
    console.error("GA4 Measurement Protocol error:", error);
    return false;
  }
}

// Pre-built event helpers for common IndexBeam actions
export async function trackUrlSubmission(
  measurementId: string,
  apiSecret: string,
  shopDomain: string,
  url: string,
  engine: string,
  success: boolean
) {
  return sendGA4Event(measurementId, apiSecret, `indexbeam.${shopDomain}`, [
    {
      name: "indexbeam_url_submitted",
      params: {
        url,
        engine,
        status: success ? "success" : "failed",
        shop: shopDomain,
      },
    },
  ]);
}

export async function trackIndexStatusChange(
  measurementId: string,
  apiSecret: string,
  shopDomain: string,
  url: string,
  engine: string,
  indexed: boolean
) {
  return sendGA4Event(measurementId, apiSecret, `indexbeam.${shopDomain}`, [
    {
      name: "indexbeam_index_status_change",
      params: {
        url,
        engine,
        indexed: indexed ? "yes" : "no",
        shop: shopDomain,
      },
    },
  ]);
}

export async function trackVisibilityScan(
  measurementId: string,
  apiSecret: string,
  shopDomain: string,
  keyword: string,
  brandMentions: number,
  totalResults: number
) {
  return sendGA4Event(measurementId, apiSecret, `indexbeam.${shopDomain}`, [
    {
      name: "indexbeam_visibility_scan",
      params: {
        keyword,
        brand_mentions: brandMentions,
        total_results: totalResults,
        mention_rate: totalResults > 0
          ? Math.round((brandMentions / totalResults) * 100)
          : 0,
        shop: shopDomain,
      },
    },
  ]);
}

// ─── GA4 Data API (Reporting) ───────────────────────────────────────────────
// Pulls traffic data from the merchant's GA4 property to show
// which indexed pages are actually getting traffic.

const DATA_API_BASE = "https://analyticsdata.googleapis.com/v1beta";

export interface GA4Credentials {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/**
 * Resolve an access token from either a service account credentials object
 * or a pre-existing OAuth access token string.
 */
async function resolveAccessToken(
  credentialsOrToken: GA4Credentials | string
): Promise<string> {
  if (typeof credentialsOrToken === "string") {
    return credentialsOrToken;
  }
  return getServiceAccountAccessToken(credentialsOrToken);
}

async function getServiceAccountAccessToken(credentials: GA4Credentials): Promise<string> {
  // Build JWT for service account auth
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const claimSet = btoa(
    JSON.stringify({
      iss: credentials.client_email,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: credentials.token_uri || "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );

  // Sign with the private key
  const crypto = await import("node:crypto");
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(`${header}.${claimSet}`);
  const signature = sign
    .sign(credentials.private_key, "base64url");

  const jwt = `${header}.${claimSet}.${signature}`;

  const response = await fetch(
    credentials.token_uri || "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`GA4 auth failed: ${response.status} ${await response.text()}`);
  }

  const data: any = await response.json();
  return data.access_token;
}

export interface PageTrafficData {
  pagePath: string;
  sessions: number;
  pageViews: number;
  activeUsers: number;
  avgEngagementTime: number;
}

export async function getPageTraffic(
  credentials: GA4Credentials | string,
  propertyId: string,
  pagePaths: string[],
  daysBack: number = 30
): Promise<PageTrafficData[]> {
  const accessToken = await resolveAccessToken(credentials);

  // Build date range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);

  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  const response = await fetch(
    `${DATA_API_BASE}/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [
          {
            startDate: formatDate(startDate),
            endDate: formatDate(endDate),
          },
        ],
        dimensions: [{ name: "pagePath" }],
        metrics: [
          { name: "sessions" },
          { name: "screenPageViews" },
          { name: "activeUsers" },
          { name: "averageSessionDuration" },
        ],
        dimensionFilter: {
          filter: {
            fieldName: "pagePath",
            inListFilter: {
              values: pagePaths,
            },
          },
        },
        limit: 500,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GA4 Data API error: ${response.status} ${errorText}`);
  }

  const data: any = await response.json();
  const rows = data.rows || [];

  return rows.map((row: any) => ({
    pagePath: row.dimensionValues?.[0]?.value || "",
    sessions: parseInt(row.metricValues?.[0]?.value || "0"),
    pageViews: parseInt(row.metricValues?.[1]?.value || "0"),
    activeUsers: parseInt(row.metricValues?.[2]?.value || "0"),
    avgEngagementTime: parseFloat(row.metricValues?.[3]?.value || "0"),
  }));
}

export async function getOverallTrafficSummary(
  credentials: GA4Credentials | string,
  propertyId: string,
  daysBack: number = 30
): Promise<{
  totalSessions: number;
  totalPageViews: number;
  totalActiveUsers: number;
  organicSessions: number;
}> {
  const accessToken = await resolveAccessToken(credentials);

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  // Total traffic
  const totalResponse = await fetch(
    `${DATA_API_BASE}/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [
          { startDate: formatDate(startDate), endDate: formatDate(endDate) },
        ],
        metrics: [
          { name: "sessions" },
          { name: "screenPageViews" },
          { name: "activeUsers" },
        ],
      }),
    }
  );

  // Organic traffic
  const organicResponse = await fetch(
    `${DATA_API_BASE}/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [
          { startDate: formatDate(startDate), endDate: formatDate(endDate) },
        ],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }],
        dimensionFilter: {
          filter: {
            fieldName: "sessionDefaultChannelGroup",
            stringFilter: {
              matchType: "EXACT",
              value: "Organic Search",
            },
          },
        },
      }),
    }
  );

  const totalData: any = totalResponse.ok
    ? await totalResponse.json()
    : {};
  const organicData: any = organicResponse.ok
    ? await organicResponse.json()
    : {};

  const totalRow = totalData.rows?.[0];
  const organicRow = organicData.rows?.[0];

  return {
    totalSessions: parseInt(totalRow?.metricValues?.[0]?.value || "0"),
    totalPageViews: parseInt(totalRow?.metricValues?.[1]?.value || "0"),
    totalActiveUsers: parseInt(totalRow?.metricValues?.[2]?.value || "0"),
    organicSessions: parseInt(organicRow?.metricValues?.[0]?.value || "0"),
  };
}

// ─── AI Traffic Monitoring ──────────────────────────────────────────────────
// Tracks traffic from AI sources: ChatGPT, Perplexity, Gemini, Claude, etc.
// This is the core differentiator — merchants can see how much traffic
// AI platforms are sending to their store.

const AI_REFERRAL_DOMAINS = [
  "chat.openai.com",
  "chatgpt.com",
  "perplexity.ai",
  "gemini.google.com",
  "bard.google.com",
  "claude.ai",
  "copilot.microsoft.com",
  "bing.com/chat",
  "you.com",
  "phind.com",
  "poe.com",
  "pi.ai",
  "meta.ai",
  "grok.x.ai",
  "kagi.com",
];

export interface AITrafficSource {
  source: string;
  sessions: number;
  pageViews: number;
  activeUsers: number;
}

export interface AITrafficSummary {
  totalAISessions: number;
  totalAIPageViews: number;
  totalAIUsers: number;
  sources: AITrafficSource[];
  aiShareOfTotal: number; // percentage
}

/**
 * Get traffic from AI referral sources.
 * Uses sessionSource dimension to filter by known AI domains.
 */
export async function getAITrafficSummary(
  credentials: GA4Credentials | string,
  propertyId: string,
  daysBack: number = 30
): Promise<AITrafficSummary> {
  const accessToken = await resolveAccessToken(credentials);

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  // Query 1: AI referral traffic by source
  const aiResponse = await fetch(
    `${DATA_API_BASE}/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [
          { startDate: formatDate(startDate), endDate: formatDate(endDate) },
        ],
        dimensions: [{ name: "sessionSource" }],
        metrics: [
          { name: "sessions" },
          { name: "screenPageViews" },
          { name: "activeUsers" },
        ],
        dimensionFilter: {
          orGroup: {
            expressions: AI_REFERRAL_DOMAINS.map((domain) => ({
              filter: {
                fieldName: "sessionSource",
                stringFilter: {
                  matchType: "CONTAINS",
                  value: domain,
                  caseSensitive: false,
                },
              },
            })),
          },
        },
        orderBy: [{ metric: { metricName: "sessions" }, desc: true }],
      }),
    }
  );

  // Query 2: Total sessions for percentage calculation
  const totalResponse = await fetch(
    `${DATA_API_BASE}/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [
          { startDate: formatDate(startDate), endDate: formatDate(endDate) },
        ],
        metrics: [{ name: "sessions" }],
      }),
    }
  );

  const aiData: any = aiResponse.ok ? await aiResponse.json() : {};
  const totalData: any = totalResponse.ok ? await totalResponse.json() : {};

  const totalSessions = parseInt(
    totalData.rows?.[0]?.metricValues?.[0]?.value || "0"
  );

  const sources: AITrafficSource[] = (aiData.rows || []).map((row: any) => ({
    source: row.dimensionValues?.[0]?.value || "unknown",
    sessions: parseInt(row.metricValues?.[0]?.value || "0"),
    pageViews: parseInt(row.metricValues?.[1]?.value || "0"),
    activeUsers: parseInt(row.metricValues?.[2]?.value || "0"),
  }));

  const totalAISessions = sources.reduce((s, r) => s + r.sessions, 0);
  const totalAIPageViews = sources.reduce((s, r) => s + r.pageViews, 0);
  const totalAIUsers = sources.reduce((s, r) => s + r.activeUsers, 0);

  return {
    totalAISessions,
    totalAIPageViews,
    totalAIUsers,
    sources,
    aiShareOfTotal:
      totalSessions > 0
        ? Math.round((totalAISessions / totalSessions) * 10000) / 100
        : 0,
  };
}

/**
 * Get AI traffic broken down by landing page.
 * Shows which pages AI platforms are sending users to.
 */
export interface AIPageTraffic {
  pagePath: string;
  sessions: number;
  pageViews: number;
}

export async function getAITrafficByPage(
  credentials: GA4Credentials | string,
  propertyId: string,
  daysBack: number = 30
): Promise<AIPageTraffic[]> {
  const accessToken = await resolveAccessToken(credentials);

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  const response = await fetch(
    `${DATA_API_BASE}/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [
          { startDate: formatDate(startDate), endDate: formatDate(endDate) },
        ],
        dimensions: [{ name: "pagePath" }],
        metrics: [
          { name: "sessions" },
          { name: "screenPageViews" },
        ],
        dimensionFilter: {
          orGroup: {
            expressions: AI_REFERRAL_DOMAINS.map((domain) => ({
              filter: {
                fieldName: "sessionSource",
                stringFilter: {
                  matchType: "CONTAINS",
                  value: domain,
                  caseSensitive: false,
                },
              },
            })),
          },
        },
        orderBy: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 50,
      }),
    }
  );

  if (!response.ok) return [];

  const data: any = await response.json();
  return (data.rows || []).map((row: any) => ({
    pagePath: row.dimensionValues?.[0]?.value || "",
    sessions: parseInt(row.metricValues?.[0]?.value || "0"),
    pageViews: parseInt(row.metricValues?.[1]?.value || "0"),
  }));
}

/**
 * Get traffic for specific URLs (e.g. submitted/indexed URLs).
 * Shows the ROI of indexing — "you submitted this URL, here's its traffic."
 */
export async function getTrafficForUrls(
  credentials: GA4Credentials | string,
  propertyId: string,
  pagePaths: string[],
  daysBack: number = 30
): Promise<PageTrafficData[]> {
  if (pagePaths.length === 0) return [];
  return getPageTraffic(credentials, propertyId, pagePaths, daysBack);
}
