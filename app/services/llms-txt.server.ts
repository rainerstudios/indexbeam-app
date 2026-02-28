/**
 * llms.txt Generator
 *
 * Generates a structured llms.txt file for AI crawlers following the
 * emerging llms.txt specification (https://llmstxt.org/).
 *
 * The file helps LLMs understand a store's brand, products, and key pages
 * so they can accurately reference the store in AI-generated responses.
 */

import prisma from "../db.server";

interface ProductInfo {
  title: string;
  handle: string;
  description: string;
  productType: string;
  vendor: string;
  tags: string[];
  priceRange?: string;
}

interface CollectionInfo {
  title: string;
  handle: string;
  description: string;
}

export async function generateLlmsTxt(
  shopDomain: string,
  products: ProductInfo[],
  collections: CollectionInfo[],
  storeName?: string
): Promise<string> {
  const baseUrl = `https://${shopDomain}`;
  const name = storeName || shopDomain.replace(".myshopify.com", "");

  const lines: string[] = [];

  // Header
  lines.push(`# ${name}`);
  lines.push("");
  lines.push(`> ${name} is an online store at ${baseUrl}`);
  lines.push("");

  // About section
  lines.push("## About");
  lines.push("");
  if (products.length > 0) {
    const vendors = [...new Set(products.map((p) => p.vendor).filter(Boolean))];
    const types = [
      ...new Set(products.map((p) => p.productType).filter(Boolean)),
    ];

    if (vendors.length > 0) {
      lines.push(`Brand: ${vendors.join(", ")}`);
    }
    if (types.length > 0) {
      lines.push(`Product categories: ${types.join(", ")}`);
    }
    lines.push(`Total products: ${products.length}`);
  }
  lines.push("");

  // Key pages
  lines.push("## Key Pages");
  lines.push("");
  lines.push(`- [Homepage](${baseUrl})`);
  lines.push(`- [All Products](${baseUrl}/collections/all)`);

  for (const collection of collections.slice(0, 20)) {
    lines.push(
      `- [${collection.title}](${baseUrl}/collections/${collection.handle})`
    );
  }
  lines.push("");

  // Products section
  if (products.length > 0) {
    lines.push("## Products");
    lines.push("");

    for (const product of products.slice(0, 50)) {
      lines.push(
        `- [${product.title}](${baseUrl}/products/${product.handle}): ${truncate(product.description, 200)}`
      );
      if (product.tags.length > 0) {
        lines.push(`  Tags: ${product.tags.slice(0, 10).join(", ")}`);
      }
    }
    lines.push("");
  }

  // Collections section
  if (collections.length > 0) {
    lines.push("## Collections");
    lines.push("");
    for (const col of collections.slice(0, 20)) {
      const desc = col.description
        ? `: ${truncate(col.description, 150)}`
        : "";
      lines.push(
        `- [${col.title}](${baseUrl}/collections/${col.handle})${desc}`
      );
    }
    lines.push("");
  }

  // Structured data hint
  lines.push("## Structured Data");
  lines.push("");
  lines.push(
    "Product pages include JSON-LD structured data with Product, Offer, and Review schemas."
  );
  lines.push(
    "Collection pages include JSON-LD with CollectionPage and BreadcrumbList schemas."
  );
  lines.push("");

  // Contact / policies
  lines.push("## Policies");
  lines.push("");
  lines.push(`- [Privacy Policy](${baseUrl}/policies/privacy-policy)`);
  lines.push(`- [Terms of Service](${baseUrl}/policies/terms-of-service)`);
  lines.push(`- [Refund Policy](${baseUrl}/policies/refund-policy)`);
  lines.push(`- [Shipping Policy](${baseUrl}/policies/shipping-policy)`);

  return lines.join("\n");
}

/**
 * Auto-generate and cache the llms.txt content for a store.
 * Called on-demand when the proxy serves the file.
 */
export async function getOrGenerateLlmsTxt(
  storeId: string,
  shopDomain: string,
  accessToken: string
): Promise<string> {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return "";

  // If custom content exists and auto-generate is off, return it
  if (!store.llmsTxtAutoGenerate && store.llmsTxtContent) {
    return store.llmsTxtContent;
  }

  // If we have cached content and it was recently generated, return it
  if (store.llmsTxtContent && !store.llmsTxtAutoGenerate) {
    return store.llmsTxtContent;
  }

  // Fetch products and collections from Shopify Admin API
  const [products, collections] = await Promise.all([
    fetchProducts(shopDomain, accessToken),
    fetchCollections(shopDomain, accessToken),
  ]);

  const content = await generateLlmsTxt(shopDomain, products, collections);

  // Cache it
  await prisma.store.update({
    where: { id: storeId },
    data: { llmsTxtContent: content },
  });

  return content;
}

async function fetchProducts(
  shopDomain: string,
  accessToken: string
): Promise<ProductInfo[]> {
  try {
    const response = await fetch(
      `https://${shopDomain}/admin/api/2024-10/products.json?limit=50&fields=title,handle,body_html,product_type,vendor,tags`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
        },
      }
    );
    if (!response.ok) return [];
    const data: any = await response.json();
    return (data.products || []).map((p: any) => ({
      title: p.title,
      handle: p.handle,
      description: stripHtml(p.body_html || ""),
      productType: p.product_type || "",
      vendor: p.vendor || "",
      tags: (p.tags || "")
        .split(",")
        .map((t: string) => t.trim())
        .filter(Boolean),
    }));
  } catch {
    return [];
  }
}

async function fetchCollections(
  shopDomain: string,
  accessToken: string
): Promise<CollectionInfo[]> {
  try {
    const response = await fetch(
      `https://${shopDomain}/admin/api/2024-10/custom_collections.json?limit=20&fields=title,handle,body_html`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
        },
      }
    );
    if (!response.ok) return [];
    const data: any = await response.json();
    return (data.custom_collections || []).map((c: any) => ({
      title: c.title,
      handle: c.handle,
      description: stripHtml(c.body_html || ""),
    }));
  } catch {
    return [];
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(str: string, max: number): string {
  if (!str) return "";
  if (str.length <= max) return str;
  return str.substring(0, max).trimEnd() + "...";
}
