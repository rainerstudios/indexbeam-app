import { useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { ensureStore } from "../services/store.server";
import { getActiveSubscription, PLANS, type PlanKey } from "../services/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  await ensureStore(session.shop);

  const subscription = await getActiveSubscription(admin);

  if (!subscription) {
    return {
      apiKey: process.env.SHOPIFY_API_KEY || "",
      requiresBilling: true,
      plans: PLANS,
    };
  }

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    requiresBilling: false,
    plans: PLANS,
  };
};

export default function App() {
  const { apiKey, requiresBilling, plans } = useLoaderData<typeof loader>();

  if (requiresBilling) {
    return (
      <AppProvider embedded apiKey={apiKey}>
        <PlanSelectionGate plans={plans} />
      </AppProvider>
    );
  }

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/indexing">Indexing</s-link>
        <s-link href="/app/seo">SEO</s-link>
        <s-link href="/app/visibility">AI Visibility</s-link>
        <s-link href="/app/score">AI Score</s-link>
        <s-link href="/app/settings">Settings</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

function PlanSelectionGate({ plans }: { plans: typeof PLANS }) {
  const fetcher = useFetcher<{ confirmationUrl?: string }>();
  const [isYearly, setIsYearly] = useState(false);
  const [step, setStep] = useState<"welcome" | "plans">("welcome");

  if (fetcher.data?.confirmationUrl) {
    window.open(fetcher.data.confirmationUrl, "_top");
  }

  const planList = Object.entries(plans) as [string, (typeof PLANS)[keyof typeof PLANS]][];

  if (step === "plans") {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#f8f9fa",
        padding: "48px 40px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <PlansContent
          planList={planList}
          isYearly={isYearly}
          setIsYearly={setIsYearly}
          fetcher={fetcher}
          onBack={() => setStep("welcome")}
        />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f8f9fa",
      padding: "60px 24px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <WelcomeContent onStart={() => setStep("plans")} />
    </div>
  );
}

function WelcomeContent({ onStart }: { onStart: () => void }) {
  const valueProps = [
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
          <circle cx="10" cy="10" r="6.5" stroke="#4CAF50" strokeWidth="1.8" />
          <path d="M15 15L19 19" stroke="#4CAF50" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ),
      title: "Instant Google & Bing indexing",
      desc: "Submit URLs the moment you publish",
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
          <path d="M11 3C8.2 3 6 5.2 6 8v4.5L4.5 15h13L16 12.5V8c0-2.8-2.2-5-5-5z" stroke="#4CAF50" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M9 17a2 2 0 004 0" stroke="#4CAF50" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ),
      title: "Indexing status tracking",
      desc: "Know exactly when your pages get indexed",
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
          <path d="M3 16l5-5.5 4 4 5-7 3 3" stroke="#4CAF50" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 19h16" stroke="#4CAF50" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
      title: "AI SEO & visibility scores",
      desc: "See how you rank against competitors",
    },
  ];

  return (
    <div style={{ maxWidth: "400px", width: "100%" }}>
      <div style={{ marginBottom: "32px", textAlign: "center" }}>
        <img src="/logo.png" alt="IndexBeam" style={{ height: "38px", display: "inline-block", background: "#1B5E20", borderRadius: "10px", padding: "6px 14px" }} />
      </div>

      <h1 style={{
        fontSize: "32px",
        fontWeight: "800",
        color: "#202223",
        margin: "0 0 12px",
        lineHeight: 1.2,
        textAlign: "center",
      }}>
        Get your store indexed<br />faster than ever
      </h1>

      <p style={{
        fontSize: "15px",
        color: "#6d7175",
        margin: "0 0 32px",
        lineHeight: 1.6,
        textAlign: "center",
      }}>
        Instant indexing, status tracking, and AI visibility scores — all from your Shopify dashboard.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "32px" }}>
        {valueProps.map(({ icon, title, desc }) => (
          <div key={title} style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            background: "white",
            padding: "14px 16px",
            borderRadius: "10px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            border: "1px solid #f5e8e8",
          }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: "8px",
              flexShrink: 0,
              background: "#E8F5E9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              {icon}
            </div>
            <div>
              <div style={{ fontWeight: "700", fontSize: "13px", color: "#202223" }}>{title}</div>
              <div style={{ fontSize: "12px", color: "#6d7175", marginTop: "1px" }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onStart}
        style={{
          width: "100%",
          padding: "15px 0",
          borderRadius: "10px",
          border: "none",
          background: "linear-gradient(135deg, #4CAF50, #4CAF50)",
          color: "white",
          fontSize: "15px",
          fontWeight: "700",
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(76,175,80,0.4)",
        }}
      >
        Start My 14-Day Free Trial →
      </button>

      <p style={{ fontSize: "12px", color: "#9ca0a5", marginTop: "10px", textAlign: "center" }}>
        No credit card charged during trial · Cancel anytime
      </p>
    </div>
  );
}

function PlansContent({
  planList,
  isYearly,
  setIsYearly,
  fetcher,
  onBack,
}: {
  planList: [string, (typeof PLANS)[keyof typeof PLANS]][];
  isYearly: boolean;
  setIsYearly: (v: boolean) => void;
  fetcher: ReturnType<typeof useFetcher<{ confirmationUrl?: string }>>;
  onBack: () => void;
}) {
  return (
    <div style={{ maxWidth: "920px", width: "100%" }}>
      {/* Back */}
      <button
        onClick={onBack}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#6d7175",
          fontSize: "13px",
          fontWeight: "600",
          display: "flex",
          alignItems: "center",
          gap: "5px",
          padding: 0,
          marginBottom: "28px",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 12L6 8l4-4" stroke="#6d7175" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </button>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "28px" }}>
        <div style={{ marginBottom: "14px" }}>
          <img src="/logo.png" alt="IndexBeam" style={{ height: "32px", display: "inline-block" }} />
        </div>
        <div style={{ fontSize: "15px", color: "#6d7175" }}>
          14 days free — no charge until your trial ends
        </div>
      </div>

      {/* Monthly/Yearly toggle */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: "12px",
        marginBottom: "28px",
      }}>
        <span style={{ fontSize: "13px", color: !isYearly ? "#202223" : "#9ca0a5", fontWeight: "600" }}>
          Monthly
        </span>
        <div
          role="switch"
          aria-checked={isYearly}
          onClick={() => setIsYearly(!isYearly)}
          style={{
            width: 44,
            height: 24,
            borderRadius: 12,
            cursor: "pointer",
            background: isYearly ? "#4CAF50" : "#c9cccf",
            position: "relative",
            transition: "background 0.2s",
          }}
        >
          <div style={{
            position: "absolute",
            top: 2,
            left: isYearly ? 22 : 2,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "white",
            transition: "left 0.2s",
            boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
          }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <span style={{ fontSize: "13px", color: isYearly ? "#202223" : "#9ca0a5", fontWeight: "600" }}>
            Yearly
          </span>
          <div style={{
            background: "#E8F5E9",
            color: "#2E7D32",
            padding: "2px 8px",
            borderRadius: "20px",
            fontSize: "11px",
            fontWeight: "700",
          }}>
            Save 20%
          </div>
        </div>
      </div>

      {/* Cards */}
      <div style={{
        display: "flex",
        gap: "16px",
        justifyContent: "center",
        flexWrap: "nowrap",
        alignItems: "stretch",
      }}>
        {planList.map(([key, plan], index) => {
          const featured = index === 1; // middle plan (Growth)
          const price = isYearly
            ? Math.round(plan.price * 0.8)
            : plan.price;
          return (
            <PricingCard
              key={key}
              title={plan.name}
              price={price}
              frequency={isYearly ? "mo, billed yearly" : "month"}
              features={buildFeatures(plan)}
              featured={featured}
              featuredText={featured ? "Most Popular" : undefined}
              loading={fetcher.state === "submitting"}
              onSelect={() =>
                fetcher.submit(
                  { intent: "upgrade", plan: key, interval: isYearly ? "ANNUAL" : "EVERY_30_DAYS" },
                  { method: "POST", action: "/app/settings" },
                )
              }
            />
          );
        })}
      </div>

      <p style={{ fontSize: "12px", color: "#9ca0a5", textAlign: "center", marginTop: "20px" }}>
        No credit card charged during trial · Cancel before trial ends to avoid charges
      </p>
    </div>
  );
}

function buildFeatures(plan: (typeof PLANS)[keyof typeof PLANS]): string[] {
  const features: string[] = [];
  if (plan.price <= 9) {
    features.push("1,000 URL submissions/month");
    features.push("Hourly check frequency");
    features.push("30-day history");
  } else if (plan.price <= 29) {
    features.push("10,000 URL submissions/month");
    features.push("Real-time check frequency");
    features.push("90-day history");
  } else {
    features.push("Unlimited URL submissions");
    features.push("Real-time check frequency");
    features.push("365-day history");
  }
  return features;
}

interface PricingCardProps {
  title: string;
  price: number;
  frequency: string;
  features: string[];
  featured?: boolean;
  featuredText?: string;
  loading: boolean;
  onSelect: () => void;
}

function PricingCard({
  title,
  price,
  frequency,
  features,
  featured,
  featuredText,
  loading,
  onSelect,
}: PricingCardProps) {
  return (
    <div style={{
      width: "260px",
      position: "relative",
      borderRadius: "16px",
      border: featured ? "2px solid #4CAF50" : "1.5px solid #e1e3e5",
      boxShadow: featured
        ? "0px 0px 24px 6px rgba(192, 57, 43, 0.2), 0 4px 12px rgba(0,0,0,0.08)"
        : "0 2px 8px rgba(0,0,0,0.06)",
      background: "white",
      display: "flex",
      flexDirection: "column",
    }}>
      {featuredText && (
        <div style={{ position: "absolute", top: "-14px", right: "14px", zIndex: 1 }}>
          <div style={{
            background: "#E8F5E9",
            color: "#2E7D32",
            padding: "4px 14px",
            borderRadius: "20px",
            fontSize: "12px",
            fontWeight: "700",
            border: "1.5px solid #4CAF50",
            boxShadow: "0 2px 4px rgba(76,175,80,0.2)",
          }}>
            {featuredText}
          </div>
        </div>
      )}

      <div style={{
        padding: "28px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        flex: 1,
      }}>
        {/* Plan name */}
        <div>
          <div style={{ fontSize: "18px", fontWeight: "700", color: "#202223" }}>{title}</div>
        </div>

        {/* Price */}
        <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
          <span style={{ fontSize: "36px", fontWeight: "800", color: "#202223", lineHeight: 1 }}>
            ${price}
          </span>
          <span style={{ fontSize: "13px", color: "#6d7175" }}>/ {frequency}</span>
        </div>

        {/* Divider */}
        <div style={{ height: "1px", background: "#f1f2f3" }} />

        {/* Features */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", flex: 1 }}>
          {features.map((feature, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "#E8F5E9",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}>
                <span style={{ color: "#4CAF50", fontSize: "11px", fontWeight: "bold" }}>✓</span>
              </div>
              <span style={{ fontSize: "13px", color: "#495057" }}>{feature}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ marginTop: "auto", paddingTop: "8px" }}>
          {featured ? (
            <button
              onClick={onSelect}
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px 20px",
                borderRadius: "8px",
                border: "none",
                background: loading ? "#e0e0e0" : "linear-gradient(135deg, #4CAF50, #4CAF50)",
                color: "white",
                fontSize: "14px",
                fontWeight: "700",
                cursor: loading ? "default" : "pointer",
                boxShadow: "0 2px 8px rgba(76,175,80,0.35)",
              }}
            >
              {loading ? "Loading…" : "Start 14-Day Trial"}
            </button>
          ) : (
            <button
              onClick={onSelect}
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px 20px",
                borderRadius: "8px",
                border: "1.5px solid #e1e3e5",
                background: "white",
                color: "#202223",
                fontSize: "14px",
                fontWeight: "600",
                cursor: loading ? "default" : "pointer",
              }}
            >
              {loading ? "Loading…" : "Start 14-Day Trial"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
