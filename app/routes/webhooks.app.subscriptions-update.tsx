import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);

  console.log(`Received app_subscriptions/update webhook for ${shop}`);

  const subscription = payload as any;
  const status = subscription?.app_subscription?.status;
  const name = subscription?.app_subscription?.name;

  if (!status || !name) {
    console.log("Missing subscription data, skipping");
    return new Response();
  }

  // Map subscription name to plan key
  const planMap: Record<string, string> = {
    Starter: "Starter",
    Growth: "Growth",
    Pro: "Pro",
  };

  const plan = planMap[name] || "free";
  const isActive = status === "ACTIVE" || status === "active";

  try {
    await db.store.update({
      where: { shopDomain: shop },
      data: { plan: isActive ? plan : "free" },
    });

    await db.billingEvent.create({
      data: {
        store: { connect: { shopDomain: shop } },
        type: isActive ? "subscription_activated" : "subscription_cancelled",
        plan: isActive ? plan : "free",
        details: JSON.stringify({ status, name }),
      },
    });

    await db.activityLog.create({
      data: {
        store: { connect: { shopDomain: shop } },
        type: "billing_change",
        message: isActive
          ? `Subscription activated: ${plan} plan`
          : `Subscription cancelled, reverted to Free plan`,
      },
    });

    console.log(`Updated ${shop} plan to ${isActive ? plan : "free"}`);
  } catch (err) {
    console.error(`Failed to update plan for ${shop}:`, err);
  }

  return new Response();
};
