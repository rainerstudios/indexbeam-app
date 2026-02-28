const BING_SEARCH_ENDPOINT = "https://api.bing.microsoft.com/v7.0/search";

function getAppBingSearchKey(): string {
  const key = process.env.BING_SEARCH_API_KEY;
  if (!key) throw new Error("BING_SEARCH_API_KEY not configured");
  return key;
}

interface SearchResult {
  url: string;
  displayUrl: string;
  name: string;
  snippet: string;
  position: number;
}

/**
 * Search Bing Web Search API.
 * Uses the app's own API key by default. Pass an explicit key to override.
 */
export async function searchWeb(
  apiKeyOrNull: string | null,
  query: string,
  count: number = 10
): Promise<SearchResult[]> {
  const apiKey = apiKeyOrNull || getAppBingSearchKey();
  const params = new URLSearchParams({
    q: query,
    count: count.toString(),
    responseFilter: "Webpages",
    mkt: "en-US",
  });

  const response = await fetch(`${BING_SEARCH_ENDPOINT}?${params}`, {
    headers: { "Ocp-Apim-Subscription-Key": apiKey },
  });

  if (!response.ok) {
    throw new Error(
      `Bing Search API error: ${response.status} ${response.statusText}`
    );
  }

  const data: any = await response.json();
  const webPages = data.webPages?.value || [];

  return webPages.map((page: any, index: number) => ({
    url: page.url,
    displayUrl: page.displayUrl,
    name: page.name,
    snippet: page.snippet,
    position: index + 1,
  }));
}

export function detectBrandMentions(
  results: SearchResult[],
  brandDomain: string
) {
  const clean = brandDomain
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  let brandMentions = 0;
  let brandUrls = 0;
  let positionSum = 0;
  let positionCount = 0;

  for (const result of results) {
    const urlDomain = new URL(result.url).hostname;
    if (urlDomain.includes(clean)) {
      brandUrls++;
      positionSum += result.position;
      positionCount++;
    }
    if (
      result.snippet.toLowerCase().includes(clean.toLowerCase()) ||
      result.name.toLowerCase().includes(clean.toLowerCase())
    ) {
      brandMentions++;
    }
  }

  return {
    totalResults: results.length,
    brandMentions,
    brandUrls,
    avgPosition: positionCount > 0 ? positionSum / positionCount : null,
    results,
  };
}

export function detectCompetitorMentions(
  results: SearchResult[],
  competitorDomains: string[]
) {
  const analysis: Record<
    string,
    { mentions: number; urls: number; posSum: number; posCount: number }
  > = {};

  for (const domain of competitorDomains) {
    analysis[domain] = { mentions: 0, urls: 0, posSum: 0, posCount: 0 };
  }

  for (const result of results) {
    const urlDomain = new URL(result.url).hostname;
    for (const compDomain of competitorDomains) {
      const clean = compDomain
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "");
      if (urlDomain.includes(clean)) {
        analysis[compDomain].urls++;
        analysis[compDomain].posSum += result.position;
        analysis[compDomain].posCount++;
      }
      if (
        result.snippet.toLowerCase().includes(clean.toLowerCase()) ||
        result.name.toLowerCase().includes(clean.toLowerCase())
      ) {
        analysis[compDomain].mentions++;
      }
    }
  }

  const out: Record<
    string,
    { mentions: number; urls: number; avgPosition: number | null }
  > = {};
  for (const [domain, data] of Object.entries(analysis)) {
    out[domain] = {
      mentions: data.mentions,
      urls: data.urls,
      avgPosition: data.posCount > 0 ? data.posSum / data.posCount : null,
    };
  }
  return out;
}

export function calculateVisibilityScore(
  brandMentions: number,
  totalResults: number,
  avgPosition: number | null
): number {
  if (totalResults === 0) return 0;
  const mentionRatio = brandMentions / totalResults;
  const positionWeight = avgPosition
    ? Math.max(0, 1 - (avgPosition - 1) / 10)
    : 0;
  return Math.round(mentionRatio * 50 + positionWeight * 50);
}
