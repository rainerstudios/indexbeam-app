import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

export const PLANS = {
  Starter: { name: "Starter", price: 9 },
  Growth: { name: "Growth", price: 29 },
  Pro: { name: "Pro", price: 49 },
} as const;

export type PlanKey = keyof typeof PLANS;

export type BillingInterval = "EVERY_30_DAYS" | "ANNUAL";

const TRIAL_DAYS = 14;

export function getPlanLimits(plan: string) {
  return PLANS[plan as PlanKey] || PLANS.Starter;
}

export async function createSubscription(
  admin: AdminApiContext,
  plan: string,
  interval: BillingInterval = "EVERY_30_DAYS",
) {
  const planInfo = PLANS[plan as PlanKey];
  if (!planInfo) return null;

  const response = await admin.graphql(
    `#graphql
    mutation createSubscription($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean, $trialDays: Int) {
      appSubscriptionCreate(
        name: $name,
        lineItems: $lineItems,
        returnUrl: $returnUrl,
        test: $test,
        trialDays: $trialDays
      ) {
        appSubscription {
          id
        }
        confirmationUrl
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        name: `IndexBeam ${planInfo.name}`,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: {
                  amount: planInfo.price,
                  currencyCode: "USD",
                },
                interval,
              },
            },
          },
        ],
        returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing/callback`,
        test: process.env.NODE_ENV !== "production",
        trialDays: TRIAL_DAYS,
      },
    },
  );

  const data = await response.json();
  const result = data.data?.appSubscriptionCreate;

  if (result?.userErrors?.length > 0) {
    throw new Error(
      result.userErrors.map((e: { message: string }) => e.message).join(", "),
    );
  }

  return result?.confirmationUrl as string | null;
}

export async function cancelSubscription(
  admin: AdminApiContext,
  subscriptionId: string,
  prorate = true,
) {
  const response = await admin.graphql(
    `#graphql
    mutation appSubscriptionCancel($id: ID!, $prorate: Boolean) {
      appSubscriptionCancel(id: $id, prorate: $prorate) {
        appSubscription {
          id
          status
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: { id: subscriptionId, prorate },
    },
  );

  const data = await response.json();
  const result = data.data?.appSubscriptionCancel;

  if (result?.userErrors?.length > 0) {
    throw new Error(
      result.userErrors.map((e: { message: string }) => e.message).join(", "),
    );
  }

  return result?.appSubscription;
}

export async function getActiveSubscription(admin: AdminApiContext) {
  const response = await admin.graphql(
    `#graphql
    query getSubscription {
      appInstallation {
        activeSubscriptions {
          id
          name
          status
          lineItems {
            plan {
              pricingDetails {
                ... on AppRecurringPricing {
                  price {
                    amount
                    currencyCode
                  }
                  interval
                }
              }
            }
          }
        }
      }
    }`,
  );

  const data = await response.json();
  return data.data?.appInstallation?.activeSubscriptions?.[0] || null;
}
