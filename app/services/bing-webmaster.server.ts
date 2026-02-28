const BASE_URL = "https://ssl.bing.com/webmaster/api.svc/json";

interface UrlInfo {
  indexed: boolean;
  lastCrawl: Date | null;
  httpCode: number | null;
}

export async function getUrlInfo(
  apiKey: string,
  siteUrl: string,
  url: string
): Promise<UrlInfo> {
  const response = await fetch(
    `${BASE_URL}/GetUrlInfo?siteUrl=${encodeURIComponent(siteUrl)}&url=${encodeURIComponent(url)}&apikey=${apiKey}`
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
  apiKey: string,
  siteUrl: string
): Promise<{ crawledPages: number; inIndex: number; crawlErrors: number }> {
  const response = await fetch(
    `${BASE_URL}/GetCrawlStats?siteUrl=${encodeURIComponent(siteUrl)}&apikey=${apiKey}`
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
  apiKey: string,
  siteUrl: string
): Promise<BingTrafficData[]> {
  const response = await fetch(
    `${BASE_URL}/GetRankAndTrafficStats?siteUrl=${encodeURIComponent(siteUrl)}&apikey=${apiKey}`
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

export async function getPageTraffic(
  apiKey: string,
  siteUrl: string
): Promise<BingPageTraffic[]> {
  const response = await fetch(
    `${BASE_URL}/GetPageStats?siteUrl=${encodeURIComponent(siteUrl)}&apikey=${apiKey}`
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
