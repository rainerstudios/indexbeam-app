const BASE_URL = "https://ssl.bing.com/webmaster/api.svc/json";

export interface BingAuth {
  apiKey?: string;
  oauthToken?: string;
}

/**
 * Build fetch options with proper auth. OAuth uses Bearer header; API key uses query param.
 */
function buildUrl(endpoint: string, siteUrl: string, auth: BingAuth, extraParams?: Record<string, string>): string {
  const params = new URLSearchParams({ siteUrl });
  if (auth.apiKey) params.set("apikey", auth.apiKey);
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) params.set(k, v);
  }
  return `${BASE_URL}/${endpoint}?${params.toString()}`;
}

function authHeaders(auth: BingAuth): Record<string, string> {
  if (auth.oauthToken) {
    return { Authorization: `Bearer ${auth.oauthToken}` };
  }
  return {};
}

interface UrlInfo {
  indexed: boolean;
  lastCrawl: Date | null;
  httpCode: number | null;
}

export async function getUrlInfo(
  auth: BingAuth,
  siteUrl: string,
  url: string
): Promise<UrlInfo> {
  const response = await fetch(
    buildUrl("GetUrlInfo", siteUrl, auth, { url }),
    { headers: authHeaders(auth) }
  );

  if (!response.ok) {
    throw new Error(
      `Bing Webmaster API error: ${response.status} ${response.statusText}`
    );
  }

  const data: any = await response.json();
  const info = data?.d;

  return {
    indexed: !!info?.IsInIndex,
    lastCrawl: info?.LastCrawledDate ? new Date(info.LastCrawledDate) : null,
    httpCode: info?.HttpCode || null,
  };
}

export async function getCrawlStats(
  auth: BingAuth,
  siteUrl: string
): Promise<{ crawledPages: number; inIndex: number; crawlErrors: number }> {
  const response = await fetch(
    buildUrl("GetCrawlStats", siteUrl, auth),
    { headers: authHeaders(auth) }
  );

  if (!response.ok) {
    throw new Error(`Bing Webmaster API error: ${response.status}`);
  }

  const data: any = await response.json();
  const stats = data?.d || [];
  const latest = stats[stats.length - 1] || {};

  return {
    crawledPages: latest.CrawledPages || 0,
    inIndex: latest.InIndex || 0,
    crawlErrors: latest.CrawlErrors || 0,
  };
}

export interface BingTrafficData {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number;
}

export async function getSearchTraffic(
  auth: BingAuth,
  siteUrl: string
): Promise<BingTrafficData[]> {
  const response = await fetch(
    buildUrl("GetRankAndTrafficStats", siteUrl, auth),
    { headers: authHeaders(auth) }
  );

  if (!response.ok) {
    throw new Error(`Bing Webmaster traffic API error: ${response.status}`);
  }

  const data: any = await response.json();
  const stats = data?.d || [];

  return stats.map((entry: any) => ({
    date: entry.Date || "",
    clicks: entry.Clicks || 0,
    impressions: entry.Impressions || 0,
    ctr: entry.Clicks && entry.Impressions
      ? Math.round((entry.Clicks / entry.Impressions) * 10000) / 100
      : 0,
    avgPosition: entry.AvgClickPosition || 0,
  }));
}

export interface BingPageTraffic {
  url: string;
  clicks: number;
  impressions: number;
}

export async function submitUrl(
  auth: BingAuth,
  siteUrl: string,
  url: string
): Promise<{ success: boolean; status: number }> {
  const response = await fetch(buildUrl("SubmitUrl", siteUrl, auth), {
    method: "POST",
    headers: { ...authHeaders(auth), "Content-Type": "application/json" },
    body: JSON.stringify({ siteUrl, url }),
  });
  return { success: response.ok, status: response.status };
}

export async function submitUrlBatch(
  auth: BingAuth,
  siteUrl: string,
  urls: string[]
): Promise<{ success: boolean; status: number }> {
  const response = await fetch(buildUrl("SubmitUrlBatch", siteUrl, auth), {
    method: "POST",
    headers: { ...authHeaders(auth), "Content-Type": "application/json" },
    body: JSON.stringify({ siteUrl, urlList: urls }),
  });
  return { success: response.ok, status: response.status };
}

export async function getUrlSubmissionQuota(
  auth: BingAuth,
  siteUrl: string
): Promise<{ dailyQuota: number; monthlyQuota: number }> {
  const response = await fetch(buildUrl("GetUrlSubmissionQuota", siteUrl, auth), {
    headers: authHeaders(auth),
  });
  if (!response.ok) {
    throw new Error(`Bing quota API error: ${response.status}`);
  }
  const data: any = await response.json();
  const d = data?.d || data;
  return {
    dailyQuota: d?.DailyQuota ?? 0,
    monthlyQuota: d?.MonthlyQuota ?? 0,
  };
}

export interface BingQueryStat {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number;
}

export async function getQueryStats(
  auth: BingAuth,
  siteUrl: string
): Promise<BingQueryStat[]> {
  const response = await fetch(buildUrl("GetQueryStats", siteUrl, auth), {
    headers: authHeaders(auth),
  });
  if (!response.ok) {
    throw new Error(`Bing query stats API error: ${response.status}`);
  }
  const data: any = await response.json();
  const stats = data?.d || [];
  return stats
    .map((entry: any) => ({
      query: entry.Query || "",
      clicks: entry.Clicks || 0,
      impressions: entry.Impressions || 0,
      ctr:
        entry.Clicks && entry.Impressions
          ? Math.round((entry.Clicks / entry.Impressions) * 10000) / 100
          : 0,
      avgPosition: entry.AvgClickPosition || 0,
    }))
    .sort((a: BingQueryStat, b: BingQueryStat) => b.clicks - a.clicks)
    .slice(0, 20);
}

export interface BingCrawlIssue {
  url: string;
  severity: string;
  crawlError: string;
}

export async function getCrawlIssues(
  auth: BingAuth,
  siteUrl: string
): Promise<BingCrawlIssue[]> {
  const response = await fetch(buildUrl("GetCrawlIssues", siteUrl, auth), {
    headers: authHeaders(auth),
  });
  if (!response.ok) {
    throw new Error(`Bing crawl issues API error: ${response.status}`);
  }
  const data: any = await response.json();
  const issues = data?.d || [];
  return issues.map((entry: any) => ({
    url: entry.Url || "",
    severity: entry.Severity?.toString() || "unknown",
    crawlError: entry.Message || entry.CrawlError || "",
  }));
}

export async function addSite(
  auth: BingAuth,
  siteUrl: string
): Promise<{ success: boolean; status: number }> {
  const response = await fetch(`${BASE_URL}/AddSite`, {
    method: "POST",
    headers: { ...authHeaders(auth), "Content-Type": "application/json" },
    body: JSON.stringify({ siteUrl }),
  });
  return { success: response.ok, status: response.status };
}

export async function submitFeed(
  auth: BingAuth,
  siteUrl: string,
  feedUrl: string
): Promise<{ success: boolean; status: number }> {
  const response = await fetch(buildUrl("SubmitFeed", siteUrl, auth), {
    method: "POST",
    headers: { ...authHeaders(auth), "Content-Type": "application/json" },
    body: JSON.stringify({ siteUrl, feedUrl }),
  });
  return { success: response.ok, status: response.status };
}

export async function getPageTraffic(
  auth: BingAuth,
  siteUrl: string
): Promise<BingPageTraffic[]> {
  const response = await fetch(
    buildUrl("GetPageStats", siteUrl, auth),
    { headers: authHeaders(auth) }
  );

  if (!response.ok) {
    throw new Error(`Bing Webmaster page traffic error: ${response.status}`);
  }

  const data: any = await response.json();
  const pages = data?.d || [];

  return pages
    .map((p: any) => ({
      url: p.Query || p.Url || "",
      clicks: p.Clicks || 0,
      impressions: p.Impressions || 0,
    }))
    .sort((a: BingPageTraffic, b: BingPageTraffic) => b.clicks - a.clicks)
    .slice(0, 50);
}
