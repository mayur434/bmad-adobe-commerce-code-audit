/**
 * AEM as a Cloud Service — Platform Report Configuration
 * ========================================================
 * Domain classification, rollout waves, deployment cautions,
 * and curated recommendations specific to AEM CS projects.
 */

import { PlatformReportConfig, RecommendationRow } from "../../shared/report-excel";

// ─── Domain Classifier ────────────────────────────────────────────────────

function classifyDomain(moduleName: string): string {
  const m = (moduleName || "").toLowerCase();
  if (["workflow", "dam", "asset", "rendition", "metadata", "processing"].some((x) => m.includes(x)))
    return "DAM / Assets / Workflows";
  if (["sling", "servlet", "filter", "resource", "jcr", "oak"].some((x) => m.includes(x)))
    return "Sling / JCR / Resource";
  if (["osgi", "config", "service", "component", "bundle"].some((x) => m.includes(x)))
    return "OSGi / Services";
  if (["dispatcher", "cdn", "cache", "rewrite", "vhost"].some((x) => m.includes(x)))
    return "Dispatcher / CDN / Cache";
  if (["core", "model", "sling-model", "exporter"].some((x) => m.includes(x)))
    return "Core / Sling Models";
  if (["ui.apps", "component", "clientlib", "dialog", "template", "page"].some((x) => m.includes(x)))
    return "Components / Templates / Dialogs";
  if (["ui.content", "content", "experience-fragment", "content-fragment"].some((x) => m.includes(x)))
    return "Content / Fragments";
  if (["replication", "publish", "author", "cloud-manager", "pipeline", "deploy"].some((x) => m.includes(x)))
    return "Replication / Cloud Manager";
  if (["search", "query", "index", "oak-index", "lucene"].some((x) => m.includes(x)))
    return "Search / Query / Indexing";
  if (["security", "auth", "permission", "acl", "user", "group", "saml", "ims"].some((x) => m.includes(x)))
    return "Security / Permissions";
  return "Core / Shared / Other";
}

// ─── Rollout Waves ────────────────────────────────────────────────────────

function rolloutWave(domain: string, crit: number, high: number, med: number): string {
  if (crit > 0 && ["Security / Permissions", "DAM / Assets / Workflows", "Replication / Cloud Manager"].includes(domain))
    return "Wave 0 - Security / Content Critical";
  if (crit > 0) return "Wave 1 - Critical Stabilization";
  if (high > 0 && ["DAM / Assets / Workflows", "Sling / JCR / Resource", "Search / Query / Indexing"].includes(domain))
    return "Wave 2 - Content Flow Hardening";
  if (high > 0) return "Wave 3 - Technical Risk Reduction";
  if (med > 0) return "Wave 4 - Maintainability / Performance";
  return "Wave 5 - Low Risk Cleanup";
}

// ─── Deployment Caution ───────────────────────────────────────────────────

function deploymentCaution(domain: string, crit: number, high: number): string {
  const cautions: Record<string, string> = {
    "DAM / Assets / Workflows": "Deploy with DAM processing validation, workflow smoke tests, rendition verification, and rollback plan.",
    "Sling / JCR / Resource": "Validate resource resolution, Sling model injection, content paths, and backward compatibility.",
    "OSGi / Services": "Deploy with service reference validation, config resolution, bundle dependency checks.",
    "Dispatcher / CDN / Cache": "Validate cache invalidation rules, rewrite patterns, header propagation, and CDN purge.",
    "Components / Templates / Dialogs": "Test dialog authoring, component rendering across breakpoints, policy inheritance, and XSS.",
    "Content / Fragments": "Validate CF model compatibility, experience fragment references, and localization flows.",
    "Replication / Cloud Manager": "Coordinate with deployment window; validate pipeline stages, environment variables, and replication queues.",
    "Search / Query / Indexing": "Validate Oak index definitions, query performance with production-scale content, and reindexing time.",
    "Security / Permissions": "Validate ACLs, service user mappings, SAML/IMS config, and closed user group behavior.",
  };
  if (cautions[domain]) return cautions[domain];
  if (crit || high) return "Deploy in a controlled release with targeted functional, integration, and rollback validation.";
  return "Can be batched with similar low-risk modules after automated tests pass.";
}

// ─── Recommendations ──────────────────────────────────────────────────────

const recommendations: RecommendationRow[] = [
  { area: "Performance", recommendation: "Optimize Oak queries — avoid traversal, use property indexes", expectedImpact: "10-100x query speedup", effort: "Medium", priority: "P0", details: "Add oak:index definitions with proper property and nodeType constraints." },
  { area: "Performance", recommendation: "Enable async indexing for large content trees", expectedImpact: "Eliminate author UI blocking during reindex", effort: "Low", priority: "P1", details: "Set async=true in index definition, monitor via MBean." },
  { area: "Performance", recommendation: "Implement Sling Model caching with @Model(cache=true)", expectedImpact: "Reduce JCR reads per request", effort: "Low", priority: "P1", details: "Cache immutable models; invalidate on content activation." },
  { area: "Security", recommendation: "Replace admin session usage with dedicated service users", expectedImpact: "Prevent privilege escalation", effort: "Medium", priority: "P0", details: "Create service user mappings in repo-init; use ResourceResolverFactory.getServiceResourceResolver()." },
  { area: "Security", recommendation: "Enforce closed user groups on sensitive content paths", expectedImpact: "Prevent unauthorized content access", effort: "Low", priority: "P1", details: "Configure CUG policies via rep:cugPolicy on content trees." },
  { area: "Security", recommendation: "Add CSP headers and disable unsafe-inline scripts", expectedImpact: "Prevent XSS from injected scripts", effort: "Low", priority: "P0", details: "Configure CSP in Dispatcher rules; avoid inline JS in HTL." },
  { area: "Quality", recommendation: "Migrate HTL to use data-sly-use for all logic delegation", expectedImpact: "Separation of concerns, testability", effort: "Medium", priority: "P1", details: "Replace embedded Java/JS use objects with Sling Models via data-sly-use." },
  { area: "Quality", recommendation: "Add AEM Analyzer plugin to CI/CD pipeline", expectedImpact: "Catch deprecated APIs and Cloud Service incompatibilities", effort: "Low", priority: "P1", details: "Use aemanalyser-maven-plugin in Cloud Manager pipeline." },
  { area: "Infra", recommendation: "Separate dispatcher configs per environment (dev/stage/prod)", expectedImpact: "Prevent environment config bleed", effort: "Low", priority: "P1", details: "Use Cloud Manager environment-specific dispatcher folders." },
  { area: "Infra", recommendation: "Configure CDN-level caching with proper TTLs per content type", expectedImpact: "80%+ publish tier offload", effort: "Medium", priority: "P0", details: "Set Surrogate-Control/Cache-Control by path pattern in dispatcher rules." },
  { area: "DAM", recommendation: "Configure asset processing profiles for Cloud Service", expectedImpact: "Consistent renditions, faster processing", effort: "Medium", priority: "P1", details: "Use Asset Compute microservices; remove custom workflow launchers for renditions." },
  { area: "Content", recommendation: "Use Content Fragment Models with structured data types", expectedImpact: "Headless-ready content architecture", effort: "Medium", priority: "P2", details: "Migrate unstructured pages to CF models for omnichannel delivery." },
  { area: "Cloud", recommendation: "Remove all /apps and /libs overlays incompatible with Cloud Service", expectedImpact: "Unblock Cloud Manager deployments", effort: "High", priority: "P0", details: "Replace overlays with Sling Resource Merger patterns or OSGi configs." },
  { area: "Deploy", recommendation: "Add pre-deployment content validation in Cloud Manager", expectedImpact: "Catch content packaging issues before production", effort: "Low", priority: "P1", details: "Use content-package-validation in build pipeline." },
];

// ─── BRD Categories ───────────────────────────────────────────────────────

const brdCategories = [
  "New Requirement Analysis", "Feature Enhancement Analysis",
  "Content Migration Analysis", "Template / Component Analysis",
];

// ─── Export Config ────────────────────────────────────────────────────────

export const aemReportConfig: PlatformReportConfig = {
  platformName: "AEM as a Cloud Service",
  platformId: "aem",
  classifyDomain,
  rolloutWave,
  deploymentCaution,
  recommendations,
  brdCategories,
};
