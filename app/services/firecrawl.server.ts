const FIRECRAWL_BASE = process.env.FIRECRAWL_BASE_URL || "https://fire.xgaming.pro/v1";

interface ScrapeResult {
  markdown: string;
  metadata: Record<string, any>;
  html?: string;
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY || "";

  const response = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ url, formats: ["markdown", "html"] }),
  });

  if (!response.ok) {
    throw new Error(
      `Firecrawl API error: ${response.status} ${response.statusText}`
    );
  }

  const data: any = await response.json();
  return {
    markdown: data.data?.markdown || "",
    metadata: data.data?.metadata || {},
    html: data.data?.html,
  };
}

export function analyzeStructuredData(html: string) {
  const jsonLdMatches =
    html.match(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
    ) || [];
  const schemas: any[] = [];

  for (const match of jsonLdMatches) {
    const content = match
      .replace(/<script[^>]*>/, "")
      .replace(/<\/script>/, "");
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) schemas.push(...parsed);
      else schemas.push(parsed);
    } catch {}
  }

  const types = schemas
    .map((s) => s["@type"])
    .flat()
    .filter(Boolean);

  const hasProductSchema = types.includes("Product");
  const hasReviewSchema =
    types.includes("Review") || types.includes("AggregateRating");
  const hasFaqSchema = types.includes("FAQPage");
  const hasOrganizationSchema = types.includes("Organization");
  const hasOfferSchema =
    types.includes("Offer") || schemas.some((s) => s.offers);
  const hasBreadcrumbSchema = types.includes("BreadcrumbList");

  const missingFields: string[] = [];
  if (!hasProductSchema) missingFields.push("Product schema");
  if (!hasReviewSchema) missingFields.push("Review/Rating schema");
  if (!hasFaqSchema) missingFields.push("FAQ schema");
  if (!hasOrganizationSchema) missingFields.push("Organization schema");
  if (!hasBreadcrumbSchema) missingFields.push("Breadcrumb schema");

  const score =
    [
      hasProductSchema,
      hasReviewSchema,
      hasFaqSchema,
      hasOrganizationSchema,
      hasBreadcrumbSchema,
    ].filter(Boolean).length * 20;

  return {
    hasProductSchema,
    hasReviewSchema,
    hasFaqSchema,
    hasOrganizationSchema,
    hasOfferSchema,
    hasBreadcrumbSchema,
    missingFields,
    score,
  };
}
