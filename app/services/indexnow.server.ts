import crypto from "node:crypto";

const INDEXNOW_ENDPOINTS = {
  bing: "https://api.indexnow.org/indexnow",
  yandex: "https://yandex.com/indexnow",
} as const;

type Engine = keyof typeof INDEXNOW_ENDPOINTS;

interface SubmitResult {
  status: number;
  success: boolean;
  message?: string;
}

export function generateIndexNowKey(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export async function submitUrl(
  url: string,
  host: string,
  key: string,
  engine: Engine,
  keyLocation?: string
): Promise<SubmitResult> {
  const endpoint = INDEXNOW_ENDPOINTS[engine];
  const params = new URLSearchParams({
    url,
    key,
    ...(keyLocation ? { keyLocation } : {}),
  });

  try {
    const response = await fetch(`${endpoint}?${params.toString()}`);
    return {
      status: response.status,
      success: response.status === 200 || response.status === 202,
      message:
        response.status === 200
          ? "URL submitted successfully"
          : response.status === 202
            ? "URL accepted for later processing"
            : `Unexpected status: ${response.status}`,
    };
  } catch (error) {
    return {
      status: 0,
      success: false,
      message: (error as Error).message,
    };
  }
}

export async function submitBatch(
  urls: string[],
  host: string,
  key: string,
  engine: Engine,
  keyLocation?: string
): Promise<SubmitResult> {
  const endpoint = INDEXNOW_ENDPOINTS[engine];

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key,
        keyLocation: keyLocation || undefined,
        urlList: urls.slice(0, 10000),
      }),
    });

    return {
      status: response.status,
      success: response.status === 200 || response.status === 202,
      message: `Batch of ${urls.length} URLs submitted`,
    };
  } catch (error) {
    return {
      status: 0,
      success: false,
      message: (error as Error).message,
    };
  }
}

export function buildProductUrl(
  shopDomain: string,
  productHandle: string
): string {
  return `https://${shopDomain}/products/${productHandle}`;
}

export function buildCollectionUrl(
  shopDomain: string,
  collectionHandle: string
): string {
  return `https://${shopDomain}/collections/${collectionHandle}`;
}
