/**
 * Web search via SearXNG (self-hosted meta-search engine).
 * Replaces Bing Search API v7 which is being retired Aug 2026.
 * Falls back to merchant's own Bing Search API key if configured.
 */

const SEARXNG_ENDPOINT =
  process.env.SEARXNG_URL || "http://localhost:8080/search";

interface SearchResult {
  url: string;
  displayUrl: string;
  name: string;
  snippet: string;
  position: number;
}

/**
 * Search the web using SearXNG.
 * If apiKeyOrNull is provided (merchant's Bing key), uses Bing API directly as fallback.
 * Otherwise uses the self-hosted SearXNG instance.
 */
export async function searchWeb(
  apiKeyOrNull: string | null,
  query: string,
  count: number = 10
): Promise<SearchResult[]> {
  // If merchant has their own Bing Search key, use it directly
  if (apiKeyOrNull) {
    return searchViaBing(apiKeyOrNull, query, count);
  }

  // Use SearXNG
  const params = new URLSearchParams({
    q: query,
    format: "json",
    categories: "general",
    language: "en",
    pageno: "1",
  });

  const response = await fetch(`${SEARXNG_ENDPOINT}?${params}`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `SearXNG search error: ${response.status} ${response.statusText}`
    );
  }

  const data: any = await response.json();
  const results = data.results || [];

  return results.slice(0, count).map((item: any, index: number) => ({
    url: item.url,
    displayUrl: item.pretty_url || item.url,
    name: item.title || "",
    snippet: item.content || "",
    position: index + 1,
  }));
}

/**
 * Fallback: search via Bing Search API v7 (for merchants with their own key).
 */
async function searchViaBing(
  apiKey: string,
  query: string,
  count: number
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    count: count.toString(),
    responseFilter: "Webpages",
    mkt: "en-US",
  });

  const response = await fetch(
    `https://api.bing.microsoft.com/v7.0/search?${params}`,
    { headers: { "Ocp-Apim-Subscription-Key": apiKey } }
  );

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
