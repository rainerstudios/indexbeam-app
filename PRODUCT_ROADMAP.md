# IndexBeam — Product Roadmap & Feature Priorities

## Positioning

> **Make your products discoverable in AI search — and prove it with real traffic data.**

IndexBeam is not an "IndexNow submitter." It's an AI search visibility platform.

---

## The Big Question: Do We Need Bing Login?

**Short answer: No — not as a priority.**

Here's why:

| Feature | Requires Bing Login? | Alternative |
|---------|---------------------|-------------|
| Submit URLs (IndexNow) | No — IndexNow is keyless | Just works |
| Check if URL is indexed on Bing | Yes — Bing Webmaster API | Can skip, not critical |
| AI traffic from ChatGPT/Perplexity/etc | No — GA4 handles this | Google OAuth only |
| Brand mention scanning | Needs Bing Search API | App-owned key (already done) |
| Schema audit | No — Firecrawl | Just works |

**The Bing Webmaster login tells merchants "your URL is indexed on Bing."**
But what merchants actually care about is: **"Is AI sending me traffic?"**

GA4 answers that directly. A merchant seeing "ChatGPT sent 47 sessions" is 10x more powerful than "Bing says indexed: yes."

### Recommendation

- **Keep Bing index status as an optional advanced feature** (for power users who connect it)
- **Lead with Google OAuth** — one click gives you GA4 AI traffic + GSC index data
- **Don't require Bing login in onboarding** — it adds friction for marginal value
- IndexNow submission works without any Bing credentials anyway

---

## Feature Priority Matrix

### P0 — Ship These First (Core Product)

These define what IndexBeam IS. Without these, there's no product.

#### 1. Instant Indexing (IndexNow)
- **Status:** Built
- **Value:** The hook. "Install → products get indexed faster." Free tier magnet.
- **How it works:** Shopify webhooks → queue → IndexNow API → Bing/Yandex
- **No merchant config needed** — works immediately on install
- **Covers:** products/create, products/update, products/delete, collections, blog posts

#### 2. AI Traffic Dashboard (GA4 Integration)
- **Status:** Built
- **Value:** THE differentiator. No other Shopify app shows this.
- **What merchants see:**
  - "ChatGPT sent you 47 sessions this month"
  - "Perplexity users viewed 12 pages"
  - "AI traffic is 3.2% of your total traffic"
  - Which pages AI platforms send users to
  - AI traffic trend over time
- **Requires:** Google OAuth (one click) + GA4 property selection
- **Why it matters:** Merchants hear about AI search but have zero visibility into it. This makes the invisible visible.

#### 3. Index Status Monitoring
- **Status:** Built
- **Value:** Proof that indexing works. Retention driver.
- **What merchants see:**
  - URLs submitted → when indexed → time to index
  - Success/failure rates
  - Which engines responded
- **Google index status** via GSC (comes free with Google OAuth)
- **Bing index status** via Bing Webmaster API (optional, advanced)

#### 4. Schema/Structured Data Audit
- **Status:** Built
- **Value:** Actionable improvements. "Fix this → better AI results."
- **What it checks:**
  - Product schema (JSON-LD)
  - Review schema
  - FAQ schema
  - Organization schema
  - Breadcrumb schema
  - Offer/pricing schema
- **Score:** 0-100 with specific missing fields listed
- **Powered by:** Firecrawl

---

### P1 — Build Next (Retention & Upgrade Drivers)

These make merchants stay and upgrade to paid plans.

#### 5. Per-URL Traffic Impact
- **Status:** Not built
- **Value:** ROI proof. "You submitted this URL → it got 200 sessions."
- **How:** Cross-reference submitted URLs with GA4 page-level traffic data
- **Shows:** Before/after indexing traffic comparison
- **Why it matters:** Justifies the subscription. "IndexBeam got me X sessions."

#### 6. Bulk Reindex
- **Status:** Partially built
- **Value:** Table stakes. Merchants expect a "Reindex Everything" button.
- **How:** Queue all product URLs with throttling (respect IndexNow rate limits)
- **Simple UI:** One button, progress bar, done.

#### 7. AI Visibility Keywords (Brand Mention Tracking)
- **Status:** Built
- **Value:** Interesting for power users. "Do AI results mention my brand?"
- **How:** Bing Search API (app-owned key) → check if merchant's domain appears in results for tracked keywords
- **Caveat:** This is a proxy for AI visibility, not direct measurement. GA4 AI traffic (P0 #2) is more concrete. Keep this but position it as supplementary.

---

### P2 — Later (Nice to Have)

Build these after you have 100+ installs and know what merchants actually request.

#### 8. AI Discovery Insights
- **Status:** Not built
- **Value:** "Your product description lacks material and use-case signals"
- **What it would do:** Analyze product content for entity completeness, semantic gaps
- **Why defer:** Overlaps with schema audit. Hard to make actionable without being vague. Merge useful parts into schema audit recommendations instead of building a separate module.

#### 9. Competitor Visibility Tracking
- **Status:** Partially built (basic mention tracking exists)
- **Value:** "Competitor X appears 5x more in AI results than you"
- **Why defer:** Current keyword tracking already shows competitor mentions. A full competitor diff engine (crawling their pages weekly for price/schema changes) is expensive in Firecrawl credits and maintenance. Not worth it until proven demand.

---

### P3 — Cut / Don't Build

#### 10. Crawl Health Monitor (Sitemap, 404s, robots.txt)
- **Verdict: Cut**
- **Why:** Generic SEO tool territory. Screaming Frog, Ahrefs, Semrush do this better. Dilutes positioning. A Shopify merchant who needs this already has those tools. IndexBeam should not be a generic SEO checker.

#### 11. AI SEO Assistant (Conversational)
- **Verdict: Defer indefinitely**
- **Why:** Hard to make accurate. If it gives bad advice, it destroys trust. Requires a lot of data to be good. Cool demo, bad product until you have deep data. Maybe revisit at 500+ installs.

#### 12. Competitor Page Diff Engine
- **Verdict: Cut**
- **Why:** "Competitor changed their price" — so what? That's not IndexBeam's job. Expensive to run. Doesn't tie back to AI visibility story.

---

## Simplified Onboarding Flow

```
Install App
    ↓
Auto-creates webhooks (no merchant action)
    ↓
IndexNow starts working immediately (no config)
    ↓
Dashboard shows: "3 products submitted today ✓"
    ↓
Banner: "Connect Google to see AI traffic data"
    ↓
One click → Google OAuth popup → done
    ↓
Dashboard shows: AI traffic + index status + schema scores
    ↓
Merchant is hooked
```

**No Bing login required in main flow.**
**No API keys to paste.**
**No service account JSON.**

---

## Revised Pricing Tiers

| Feature | Free | Starter $19 | Growth $49 | Pro $99 |
|---------|------|-------------|------------|---------|
| Auto IndexNow (products/collections) | 50/mo | Unlimited | Unlimited | Unlimited |
| Submission logs | 7 days | 30 days | 90 days | Unlimited |
| Google index status (GSC) | — | Basic | Full | Full |
| AI Traffic Dashboard (GA4) | — | Basic (total only) | Full breakdown | Full + trends |
| Schema audit | 3 pages | 25 pages | Unlimited | Unlimited |
| AI visibility keywords | — | 3 keywords | 15 keywords | 50 keywords |
| Per-URL traffic impact | — | — | Yes | Yes |
| Bulk reindex | — | — | Yes | Yes |
| Priority support | — | — | — | Yes |

---

## What to Build This Week

1. **Polish the core 4** (IndexNow, AI Traffic, Index Status, Schema Audit)
2. **Per-URL traffic impact** — wire GA4 page data into index status view
3. **Bulk reindex button** — simple queue-all with throttling
4. **Remove/hide unfinished features** from UI
5. **Test the full onboarding flow** — install → auto-index → connect Google → see data

---

## Success Metrics

- **Activation:** % of installs that connect Google within 7 days
- **Retention:** % of merchants who open app weekly
- **Upgrade trigger:** Merchant sees AI traffic data → wants more detail → upgrades
- **North star:** Merchants saying "I had no idea ChatGPT was sending me traffic"
