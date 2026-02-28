import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const pathSegments = url.pathname.split("/").filter(Boolean);
  const lastSegment = pathSegments[pathSegments.length - 1] || "";

  // Serve llms.txt
  if (lastSegment === "llms.txt" || lastSegment === "llms") {
    // App proxy passes the shop domain in the query params
    const shop = url.searchParams.get("shop");
    if (!shop) {
      return new Response("# No store found", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const store = await prisma.store.findUnique({
      where: { shopDomain: shop },
    });

    if (!store) {
      return new Response("# Store not found", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // If we have cached content, serve it
    if (store.llmsTxtContent) {
      return new Response(store.llmsTxtContent, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // Auto-generate on first request
    try {
      const { getOrGenerateLlmsTxt } = await import(
        "../services/llms-txt.server"
      );
      const content = await getOrGenerateLlmsTxt(
        store.id,
        store.shopDomain,
        store.accessToken
      );
      return new Response(content, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch (error) {
      console.error("llms.txt generation error:", error);
      return new Response("# Error generating llms.txt", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      });
    }
  }

  // Serve IndexNow verification key
  const key = lastSegment.replace(".txt", "");
  if (!key) {
    return new Response("Not found", { status: 404 });
  }

  const store = await prisma.store.findFirst({
    where: { indexnowKey: key },
  });
  if (!store) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(key, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=86400",
    },
  });
};
