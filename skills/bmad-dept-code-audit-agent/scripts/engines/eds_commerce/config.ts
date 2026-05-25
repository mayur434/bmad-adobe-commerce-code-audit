/**
 * EDS + Commerce Hybrid — Platform Report Configuration
 * ======================================================
 * Domain classification, rollout waves, deployment cautions,
 * and curated recommendations for EDS projects with Commerce integration
 * (product listings, cart, checkout via Commerce dropins/APIs).
 */

import { PlatformReportConfig, RecommendationRow } from "../../shared/report-excel";

// ─── Domain Classifier ────────────────────────────────────────────────────

function classifyDomain(moduleName: string): string {
  const m = (moduleName || "").toLowerCase();
  if (["commerce", "product", "catalog", "price", "sku"].some((x) => m.includes(x)))
    return "Commerce / Catalog / PDP";
  if (["cart", "checkout", "payment", "order", "shipping"].some((x) => m.includes(x)))
    return "Cart / Checkout / Payment";
  if (["dropin", "storefront", "api", "graphql", "fetch"].some((x) => m.includes(x)))
    return "Commerce API / Dropins";
  if (["block", "hero", "carousel", "card", "accordion", "tabs"].some((x) => m.includes(x)))
    return "Content Blocks";
  if (["script", "lib", "util", "helper"].some((x) => m.includes(x)))
    return "Scripts / Libraries";
  if (["style", "css", "font", "theme"].some((x) => m.includes(x)))
    return "Styles / Theming";
  if (["nav", "header", "footer", "navigation"].some((x) => m.includes(x)))
    return "Navigation / Layout";
  if (["config", "metadata", "helix", "fstab", "path"].some((x) => m.includes(x)))
    return "Configuration / Metadata";
  if (["auth", "customer", "account", "login", "session"].some((x) => m.includes(x)))
    return "Customer / Authentication";
  return "Core / Shared / Other";
}

// ─── Rollout Waves ────────────────────────────────────────────────────────

function rolloutWave(domain: string, crit: number, high: number, med: number): string {
  if (crit > 0 && ["Cart / Checkout / Payment", "Customer / Authentication", "Commerce API / Dropins"].includes(domain))
    return "Wave 0 - Revenue / Security Critical";
  if (crit > 0) return "Wave 1 - Critical Stabilization";
  if (high > 0 && ["Cart / Checkout / Payment", "Commerce / Catalog / PDP", "Commerce API / Dropins"].includes(domain))
    return "Wave 2 - Commerce Flow Hardening";
  if (high > 0) return "Wave 3 - Technical Risk Reduction";
  if (med > 0) return "Wave 4 - Maintainability / Performance";
  return "Wave 5 - Low Risk Cleanup";
}

// ─── Deployment Caution ───────────────────────────────────────────────────

function deploymentCaution(domain: string, crit: number, high: number): string {
  const cautions: Record<string, string> = {
    "Commerce / Catalog / PDP": "Validate product rendering, price display, variant selection, and search/filter behavior against Commerce backend.",
    "Cart / Checkout / Payment": "Deploy with cart add/remove, coupon, shipping method, payment gateway, and order placement smoke tests.",
    "Commerce API / Dropins": "Validate API contract compatibility, dropin version pins, error handling, and fallback behavior.",
    "Content Blocks": "Test block rendering across breakpoints, CLS scores, and authoring in Word/GDocs.",
    "Scripts / Libraries": "Validate no regressions in LCP/CLS/TBT; test Commerce event tracking and analytics hooks.",
    "Navigation / Layout": "Test header cart icon, mini-cart, account menu, mobile nav, and accessibility.",
    "Customer / Authentication": "Validate login/logout flow, session persistence, account pages, and token refresh.",
    "Configuration / Metadata": "Validate Commerce endpoint URLs, API keys (from env), feature flags, and CDN behavior.",
  };
  if (cautions[domain]) return cautions[domain];
  if (crit || high) return "Deploy with targeted Commerce + content validation, Lighthouse scores, and order placement tests.";
  return "Can be batched with similar low-risk changes after preview validation passes.";
}

// ─── Recommendations ──────────────────────────────────────────────────────

const recommendations: RecommendationRow[] = [
  { area: "Performance", recommendation: "Lazy-load Commerce dropins below the fold", expectedImpact: "40-60% LCP improvement on PLP/PDP", effort: "Low", priority: "P0", details: "Use IntersectionObserver; load product cards/cart widget only when visible." },
  { area: "Performance", recommendation: "Cache Commerce GraphQL responses at CDN edge", expectedImpact: "90% reduction in backend calls for catalog", effort: "Medium", priority: "P0", details: "Set Cache-Control for catalog queries; invalidate on product update events." },
  { area: "Performance", recommendation: "Preconnect to Commerce API endpoints", expectedImpact: "100-300ms connection time saved", effort: "Low", priority: "P1", details: "Add <link rel=preconnect> for Commerce GraphQL and media endpoints." },
  { area: "Security", recommendation: "Never expose Commerce API keys in client-side code", expectedImpact: "Prevent API abuse", effort: "Low", priority: "P0", details: "Route through edge functions/BFF; use session tokens for authenticated calls." },
  { area: "Security", recommendation: "Validate Commerce webhook signatures server-side", expectedImpact: "Prevent forged order/price events", effort: "Medium", priority: "P0", details: "Verify HMAC signatures on all Commerce event webhooks." },
  { area: "Security", recommendation: "Implement CSRF protection on cart/checkout mutations", expectedImpact: "Prevent unauthorized cart manipulation", effort: "Low", priority: "P0", details: "Use anti-CSRF tokens or SameSite cookie + Origin header validation." },
  { area: "Quality", recommendation: "Pin Commerce dropin versions in package.json", expectedImpact: "Prevent breaking changes from upstream updates", effort: "Low", priority: "P1", details: "Use exact versions; test upgrades in preview before promoting." },
  { area: "Quality", recommendation: "Add E2E tests for add-to-cart → checkout → order flow", expectedImpact: "Catch Commerce integration regressions", effort: "Medium", priority: "P1", details: "Use Playwright/Cypress; cover guest + authenticated, coupon, and shipping variations." },
  { area: "Commerce", recommendation: "Implement proper error boundaries for Commerce blocks", expectedImpact: "Graceful degradation when API is down", effort: "Low", priority: "P0", details: "Show fallback UI/skeleton when Commerce API fails; never break the whole page." },
  { area: "Commerce", recommendation: "Use Storefront Events SDK for analytics tracking", expectedImpact: "Consistent Commerce event data", effort: "Medium", priority: "P1", details: "Track product-view, add-to-cart, checkout-start, order-placed events." },
  { area: "SEO", recommendation: "Server-render product metadata for search engines", expectedImpact: "Product pages indexed with structured data", effort: "Medium", priority: "P1", details: "Use edge-side includes or pre-rendered metadata for PDP pages." },
  { area: "Accessibility", recommendation: "Ensure Commerce interactions are keyboard-navigable", expectedImpact: "WCAG 2.1 AA compliance for shopping flow", effort: "Medium", priority: "P0", details: "Test variant picker, add-to-cart, quantity control, and checkout with keyboard only." },
];

// ─── BRD Categories ───────────────────────────────────────────────────────

const brdCategories = [
  "New Requirement Analysis", "Feature Enhancement Analysis",
  "Commerce Integration Analysis", "Storefront Flow Analysis",
];

// ─── Export Config ────────────────────────────────────────────────────────

export const edsCommerceReportConfig: PlatformReportConfig = {
  platformName: "Edge Delivery Services + Commerce",
  platformId: "eds-commerce",
  classifyDomain,
  rolloutWave,
  deploymentCaution,
  recommendations,
  brdCategories,
};
