/**
 * Edge Delivery Services — Platform Report Configuration
 * ========================================================
 * Domain classification, rollout waves, deployment cautions,
 * and curated recommendations specific to EDS (Franklin) projects.
 */

import { PlatformReportConfig, RecommendationRow } from "../../shared/report-excel";

// ─── Domain Classifier ────────────────────────────────────────────────────

function classifyDomain(moduleName: string): string {
  const m = (moduleName || "").toLowerCase();
  if (["block", "hero", "carousel", "card", "accordion", "tabs", "table"].some((x) => m.includes(x)))
    return "Blocks / Components";
  if (["script", "lib", "util", "helper", "aem"].some((x) => m.includes(x)))
    return "Scripts / Libraries";
  if (["style", "css", "font", "theme"].some((x) => m.includes(x)))
    return "Styles / Theming";
  if (["nav", "header", "footer", "navigation"].some((x) => m.includes(x)))
    return "Navigation / Layout";
  if (["form", "input", "submit", "validation"].some((x) => m.includes(x)))
    return "Forms / Interactions";
  if (["config", "metadata", "helix", "fstab", "path", "sitemap"].some((x) => m.includes(x)))
    return "Configuration / Metadata";
  if (["test", "spec", "mock", "fixture"].some((x) => m.includes(x)))
    return "Testing";
  return "Core / Shared / Other";
}

// ─── Rollout Waves ────────────────────────────────────────────────────────

function rolloutWave(domain: string, crit: number, high: number, med: number): string {
  if (crit > 0 && ["Forms / Interactions", "Configuration / Metadata"].includes(domain))
    return "Wave 0 - Critical / Config";
  if (crit > 0) return "Wave 1 - Critical Stabilization";
  if (high > 0 && ["Blocks / Components", "Navigation / Layout"].includes(domain))
    return "Wave 2 - UX Flow Hardening";
  if (high > 0) return "Wave 3 - Technical Risk Reduction";
  if (med > 0) return "Wave 4 - Maintainability / Performance";
  return "Wave 5 - Low Risk Cleanup";
}

// ─── Deployment Caution ───────────────────────────────────────────────────

function deploymentCaution(domain: string, crit: number, high: number): string {
  const cautions: Record<string, string> = {
    "Blocks / Components": "Test block rendering across breakpoints, CLS scores, authoring in Word/GDocs, and preview/live behavior.",
    "Scripts / Libraries": "Validate no regressions in LCP/CLS/TBT, test lazy-loading behavior, and check for global scope pollution.",
    "Styles / Theming": "Validate responsive breakpoints, dark mode (if applicable), font loading strategy, and CLS impact.",
    "Navigation / Layout": "Test header/footer across viewports, mobile menu, breadcrumbs, and accessibility (keyboard nav, ARIA).",
    "Forms / Interactions": "Validate form submission, field validation, error states, accessibility, and server-side handling.",
    "Configuration / Metadata": "Validate fstab.yaml, helix-query.yaml, paths.json, sitemap, and redirects before publish.",
  };
  if (cautions[domain]) return cautions[domain];
  if (crit || high) return "Deploy with targeted validation across preview/live, check Lighthouse scores, and verify content rendering.";
  return "Can be batched with similar low-risk changes after preview validation passes.";
}

// ─── Recommendations ──────────────────────────────────────────────────────

const recommendations: RecommendationRow[] = [
  { area: "Performance", recommendation: "Implement lazy loading for below-fold blocks", expectedImpact: "30-50% LCP improvement", effort: "Low", priority: "P0", details: "Use IntersectionObserver pattern; defer non-critical block JS/CSS loading." },
  { area: "Performance", recommendation: "Optimize font loading with font-display: swap", expectedImpact: "Eliminate FOIT, reduce CLS", effort: "Low", priority: "P0", details: "Preload critical fonts, use fallback stack with size-adjust for CLS." },
  { area: "Performance", recommendation: "Minimize render-blocking CSS in critical path", expectedImpact: "20-40% FCP improvement", effort: "Medium", priority: "P1", details: "Inline critical CSS, defer non-critical stylesheets, use media queries for conditional loading." },
  { area: "Performance", recommendation: "Implement proper image optimization (WebP, sizing)", expectedImpact: "40-60% payload reduction", effort: "Low", priority: "P0", details: "Use picture element with srcset, proper width/height attributes for CLS." },
  { area: "Security", recommendation: "Add Content-Security-Policy headers", expectedImpact: "Prevent XSS attacks", effort: "Low", priority: "P1", details: "Configure CSP via headers in CDN/Edge config; avoid unsafe-inline." },
  { area: "Security", recommendation: "Sanitize user-generated content in blocks", expectedImpact: "Prevent stored XSS", effort: "Low", priority: "P0", details: "Use textContent instead of innerHTML; validate/sanitize any dynamic content." },
  { area: "Quality", recommendation: "Add Lighthouse CI to pull request workflow", expectedImpact: "Prevent performance regressions", effort: "Low", priority: "P1", details: "Fail PRs that degrade LCP/CLS/TBT beyond threshold." },
  { area: "Quality", recommendation: "Implement block-level unit tests", expectedImpact: "Catch regressions before preview", effort: "Medium", priority: "P1", details: "Use web-test-runner or similar for block DOM assertions." },
  { area: "Accessibility", recommendation: "Ensure all blocks pass WCAG 2.1 AA", expectedImpact: "Legal compliance, wider audience", effort: "Medium", priority: "P0", details: "Run axe-core in CI; test keyboard navigation, screen reader, color contrast." },
  { area: "Accessibility", recommendation: "Add proper ARIA landmarks and roles to blocks", expectedImpact: "Better screen reader navigation", effort: "Low", priority: "P1", details: "Use semantic HTML (nav, main, aside); add role attributes only when needed." },
  { area: "SEO", recommendation: "Implement structured data (JSON-LD) in metadata", expectedImpact: "Rich search results", effort: "Low", priority: "P2", details: "Add Organization, BreadcrumbList, Article schema via metadata blocks." },
  { area: "Authoring", recommendation: "Document block authoring patterns for content authors", expectedImpact: "Reduce content errors and support tickets", effort: "Low", priority: "P2", details: "Create block documentation with screenshots in project wiki/GDocs." },
];

// ─── Export Config ────────────────────────────────────────────────────────

export const edsReportConfig: PlatformReportConfig = {
  platformName: "Edge Delivery Services",
  platformId: "eds",
  classifyDomain,
  rolloutWave,
  deploymentCaution,
  recommendations,
  brdCategories: ["New Requirement Analysis", "Feature Enhancement Analysis"],
};
