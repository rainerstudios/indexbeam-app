import {
  searchWeb,
  detectBrandMentions,
  detectCompetitorMentions,
} from "./bing-search.server";
import { decrypt } from "../lib/encryption.server";
import prisma from "../db.server";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runVisibilityScan(storeId: string): Promise<void> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: { competitors: true },
  });

  if (!store) {
    console.log(`Skipping visibility scan for store ${storeId}: store not found`);
    return;
  }

  // Use merchant's Bing key if set, otherwise searchWeb() falls back to SearXNG
  const apiKey = store.bingSearchApiKey ? decrypt(store.bingSearchApiKey) : null;
  const queries = await prisma.visibilityQuery.findMany({
    where: { storeId },
  });
  const competitorDomains = store.competitors.map((c) => c.domain);

  for (const query of queries) {
    try {
      // Simple delay between queries to avoid rate limiting
      await delay(500);

      const results = await searchWeb(apiKey, query.keyword, 10);
      const brandAnalysis = detectBrandMentions(results, store.shopDomain);

      for (const result of results) {
        const urlDomain = new URL(result.url).hostname;
        const isBrand = urlDomain.includes(
          store.shopDomain.replace(/^https?:\/\//, "")
        );
        const isCompetitor = competitorDomains.some((d) =>
          urlDomain.includes(d)
        );

        await prisma.visibilityResult.create({
          data: {
            queryId: query.id,
            rankPosition: result.position,
            domain: urlDomain,
            mentionsBrand: isBrand,
            mentionsCompetitor: isCompetitor,
            snippet: result.snippet.substring(0, 500),
            source: "web",
          },
        });
      }

      await prisma.activityLog.create({
        data: {
          storeId,
          type: "visibility_scan",
          message: `Scanned "${query.keyword}": ${brandAnalysis.brandMentions} brand mentions out of ${brandAnalysis.totalResults} results`,
          metadata: JSON.stringify({
            keyword: query.keyword,
            brandMentions: brandAnalysis.brandMentions,
            totalResults: brandAnalysis.totalResults,
          }),
        },
      });
    } catch (error) {
      console.error(
        `Visibility scan error for keyword "${query.keyword}":`,
        error
      );
      await prisma.activityLog.create({
        data: {
          storeId,
          type: "visibility_scan",
          message: `Error scanning "${query.keyword}": ${(error as Error).message}`,
        },
      });
    }
  }
}
