import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { getActiveSubscription, PLANS, type PlanKey } from "../services/billing.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const subscription = await getActiveSubscription(admin);

  if (subscription && subscription.status === "ACTIVE") {
    const amount = parseFloat(
      subscription.lineItems?.[0]?.plan?.pricingDetails?.price?.amount || "0",
    );

    let plan: PlanKey = "Starter";
    for (const [key, planInfo] of Object.entries(PLANS)) {
      if (planInfo.price === amount) {
        plan = key as PlanKey;
        break;
      }
    }

    await prisma.store.update({
      where: { shopDomain: session.shop },
      data: { plan },
    });
  }

  return redirect("/app");
};
