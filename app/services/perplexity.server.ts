const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

export interface AIMentionCheckResult {
  mentioned: boolean;
  responseSnippet: string;
  competitorsMentioned: string[];
  citations: string[];
}

/**
 * Ask Perplexity Sonar whether a brand appears when AI is asked about a keyword.
 */
export async function checkAIMention(
  keyword: string,
  brandDomain: string,
): Promise<AIMentionCheckResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new Error("PERPLEXITY_API_KEY is not configured.");
  }

  const cleanDomain = brandDomain
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .toLowerCase();

  // Extract brand name from domain (e.g. "my-store.myshopify.com" → "my-store")
  const brand = cleanDomain.split(".")[0];

  const response = await fetch(PERPLEXITY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful shopping assistant. When asked about products or services, recommend specific brands and stores with their websites.",
        },
        {
          role: "user",
          content: `What are the best ${keyword}? Please recommend specific brands, stores, and websites. Include their website URLs where possible.`,
        },
      ],
      max_tokens: 800,
      temperature: 0.2,
      return_citations: true,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Perplexity API error: ${response.status} ${response.statusText}`,
    );
  }

  const data: any = await response.json();
  const responseText: string = data.choices?.[0]?.message?.content || "";
  const citations: string[] = data.citations || [];

  const textLower = responseText.toLowerCase();
  const mentioned =
    textLower.includes(cleanDomain) ||
    textLower.includes(brand.toLowerCase()) ||
    citations.some((c: string) => c.toLowerCase().includes(cleanDomain));

  // Extract competitor domains from citations (exclude brand and known non-retailers)
  const competitorsMentioned = citations
    .filter((url: string) => {
      try {
        const hostname = new URL(url).hostname.toLowerCase();
        return (
          !hostname.includes(cleanDomain) && !isKnownNonRetailer(hostname)
        );
      } catch {
        return false;
      }
    })
    .map((url: string) => {
      try {
        return new URL(url).hostname;
      } catch {
        return url;
      }
    })
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 8);

  return {
    mentioned,
    responseSnippet: responseText.substring(0, 600),
    competitorsMentioned,
    citations,
  };
}

function isKnownNonRetailer(hostname: string): boolean {
  const nonRetailers = [
    "reddit.com",
    "wikipedia.org",
    "youtube.com",
    "nytimes.com",
    "cnet.com",
    "wirecutter.com",
    "tomsguide.com",
    "techradar.com",
    "theverge.com",
    "engadget.com",
    "pcmag.com",
  ];
  return nonRetailers.some((d) => hostname.includes(d));
}
