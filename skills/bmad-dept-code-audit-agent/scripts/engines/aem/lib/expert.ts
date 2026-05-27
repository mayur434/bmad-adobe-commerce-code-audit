/**
 * Expert Validation & Recommendation Engine — AEM
 * ================================================
 * Auto-generates enterprise-grade expert recommendations for AEM audit findings
 * based on Adobe Experience Manager best practices, severity, and effort level.
 *
 * Architecture:
 * - 35+ base recommendation templates (AEM-specific guidance)
 * - Category routing rules: default template + issue-type overrides
 * - Severity-aware prefix: "prioritize:" for CRITICAL/HIGH
 * - Effort-aware suffix: rollout guidance for High effort
 * - Special status prefixes: false-positive, optional, low-risk
 */

// ─── Base Templates ────────────────────────────────────────────────────────────
const TEMPLATES: Record<string, string> = {
  resource_resolver:
    "Always close ResourceResolvers obtained from ResourceResolverFactory in a " +
    "try-with-resources block. Leaked resolvers hold JCR sessions open, exhausting " +
    "the session pool and causing cascading failures under load.",
  service_user:
    "Replace admin session usage with service-user-based ResourceResolvers mapped " +
    "via Sling Service User Mapping. Define least-privilege ACLs and verify the " +
    "mapping exists in the repo-init scripts.",
  sling_model_best_practice:
    "Use @Model with adaptables=Resource (preferred) or SlingHttpServletRequest. " +
    "Avoid WCMUsePojo; use injector-specific annotations (@ChildResource, @ValueMapValue) " +
    "over generic @Inject for clarity and fail-fast behavior.",
  osgi_config_separation:
    "Separate OSGi configurations by run mode (author/publish/dev/stage/prod). " +
    "Use OCD annotations with @Designate and keep environment-specific values in " +
    "run-mode folders, not hardcoded in code.",
  cloud_readiness:
    "Remove file system writes, CRX/DE access, install hooks, and replication API usage. " +
    "Use Sling Content Distribution, Asset Compute workers, and cloud-compatible patterns " +
    "per AEMaaCS migration checklist.",
  mutable_content:
    "Move mutable content out of /apps into /conf or /content with proper run-mode " +
    "initialization via repo-init. Only immutable content should be in /apps for " +
    "Cloud Service deployments.",
  dispatcher_cache:
    "Configure dispatcher cache rules with proper TTLs, grace periods, and " +
    "stat-file-level invalidation. Cache HTML with short TTLs; static assets " +
    "with content-hash fingerprints and long TTLs (1 year).",
  clientlib_optimization:
    "Consolidate clientlibs, enable minification and gzip, set proper categories " +
    "and dependencies. Use allowProxy=true for publish delivery and avoid duplicate " +
    "library inclusions across components.",
  query_optimization:
    "Add Oak indexes for all custom queries. Avoid traversal queries (no restrict), " +
    "use query builder with proper predicates, and set limits. Monitor slow query " +
    "logs in production.",
  oak_index:
    "Define custom Oak indexes in /oak:index for all query predicates. Use lucene " +
    "indexes for fulltext, property indexes for exact matches. Include index cost " +
    "estimation and test with explain query.",
  session_save:
    "Avoid session.save() in loops — batch modifications and call save() once. " +
    "Each save triggers observation events and can cause performance degradation " +
    "with large changesets.",
  deprecated_api:
    "Replace deprecated AEM/Sling/JCR APIs with current equivalents. " +
    "WCMUsePojo → Sling Models, @SlingServlet → @Component(service=Servlet.class), " +
    "AdminResourceResolver → ServiceResourceResolver.",
  xss_prevention:
    "Use XSSAPI for context-aware encoding in Java. In HTL, use proper display " +
    "contexts (text, uri, attribute). Never use @{= expression @ context='unsafe'} " +
    "unless content is verified safe.",
  htl_best_practice:
    "Use data-sly-use for Sling Model binding, data-sly-list for iteration, and " +
    "data-sly-test for conditionals. Avoid embedded Java/JSP expressions. Keep HTL " +
    "templates simple with logic in models.",
  content_structure:
    "Follow AEM content hierarchy best practices: /content/site/language-masters " +
    "for i18n, /content/dam for assets, /content/experience-fragments for XF. " +
    "Keep page depth ≤ 5 levels for performance.",
  workflow_optimization:
    "Use transient workflows for asset processing, limit payload size, and add " +
    "timeout handlers. Monitor workflow queue depth and purge completed instances " +
    "on a schedule.",
  replication_pattern:
    "Use Sling Content Distribution (forward distribution) instead of legacy " +
    "replication agents for AEMaaCS. For AMS, configure flush agents with proper " +
    "transport credentials and retry policies.",
  servlet_registration:
    "Register Sling servlets with @Component(service=Servlet.class) and proper " +
    "property annotations (sling.servlet.paths, methods, resourceTypes). Validate " +
    "input, set response content-type, and handle errors gracefully.",
  event_listener:
    "Use Sling Resource Change Listeners or OSGi Event Handlers over JCR observation. " +
    "Filter events narrowly (path, change type), keep handlers lightweight, and " +
    "offload heavy processing to Sling Jobs.",
  sling_job:
    "Use Sling Jobs for asynchronous, guaranteed-delivery processing. Define a " +
    "dedicated topic, configure max retries and retry delay, and add proper " +
    "error handling with job result reporting.",
  test_coverage:
    "Add unit tests (JUnit5 + AEM Mocks/wcm.io), integration tests (AEM Testing " +
    "Clients), and UI tests (Cypress/Selenium). Target 80%+ coverage for custom " +
    "Java code. Gate deployments on test pass.",
  security_general:
    "Apply defense in depth: validate/sanitize all inputs, encode all outputs, " +
    "use service users with least privilege, configure dispatcher deny rules for " +
    "sensitive paths (/crx, /system, /admin).",
  ssrf_prevention:
    "Validate and whitelist all URLs used in server-side HTTP requests. Block " +
    "internal/private IP ranges, use connection timeouts, and avoid user-controlled " +
    "redirect targets.",
  dependency_update:
    "Update dependencies to current stable versions. Pin exact versions in POM, " +
    "check for CVEs with OWASP dependency-check or Snyk, and test compatibility " +
    "with target AEM version.",
  code_complexity:
    "Reduce cyclomatic complexity by extracting methods, using early returns, and " +
    "applying design patterns (Strategy, Template Method). Classes >500 lines or " +
    "methods >50 lines should be refactored.",
  accessibility_fix:
    "Fix WCAG 2.1 AA violations: add ARIA labels, ensure keyboard navigation, " +
    "maintain 4.5:1 contrast ratio, provide text alternatives for images, and " +
    "use semantic HTML elements.",
  seo_best_practice:
    "Add canonical URLs, structured data (JSON-LD), meta descriptions, proper " +
    "heading hierarchy (single h1), and ensure mobile-friendly rendering. Generate " +
    "XML sitemaps with proper lastmod dates.",
  dispatcher_security:
    "Block access to sensitive paths: /crx, /system/console, /bin (selective), " +
    "/libs/granite. Enforce HTTPS, set security headers (CSP, X-Frame-Options, " +
    "HSTS), and validate allowed HTTP methods.",
  validate_general:
    "Recommendation direction looks reasonable. Before implementation, validate " +
    "the finding against real execution paths, add a targeted test, and confirm " +
    "the fix does not alter component rendering or authoring experience.",
  performance_general:
    "Profile the affected code path under production-like load. Fix unbounded " +
    "iterations, add caching where appropriate, and verify response times stay " +
    "within SLA thresholds.",
  maintainability_fix:
    "Improve code maintainability: remove dead code, extract shared logic into " +
    "reusable services, apply consistent naming conventions, and add JavaDoc for " +
    "public APIs.",
  core_components:
    "Extend/proxy Adobe Core Components instead of building from scratch. Use " +
    "Sling Resource Merger for customization, add custom policies in templates, " +
    "and keep BEM CSS conventions.",
};

// ─── Status Prefix Map ────────────────────────────────────────────────────────
const STATUS_PREFIXES: Record<string, string> = {
  aligned: "Aligned",
  aligned_prioritize: "Aligned; prioritize",
  optional: "Optional / style alignment",
  low_risk: "Low-risk correction",
  correct_stronger: "Correct with stronger control",
  needs_review: "Needs review / possible false positive",
};

// Rollout suffix for high-effort items
const ROLLOUT_SUFFIX =
  " Plan rollout in small PRs with rollback notes because " +
  "the estimated effort is high.";

// ─── Category Routing Rules ───────────────────────────────────────────────────
interface CategoryRule {
  default: string;
  default_status?: string;
  overrides?: [string, string, string | null][];
}

const CATEGORY_RULES: Record<string, CategoryRule> = {
  Performance: {
    default: "performance_general",
    overrides: [
      ["Unbounded Query", "query_optimization", null],
      ["Traversal", "query_optimization", null],
      ["Missing Oak Index", "oak_index", null],
      ["Oak Index", "oak_index", null],
      ["session.save", "session_save", null],
      ["Session Save in Loop", "session_save", null],
      ["N+1", "query_optimization", null],
      ["Thread Pool", "performance_general", null],
      ["Resource Leak", "resource_resolver", null],
      ["Cache", "dispatcher_cache", null],
    ],
  },
  "Code Quality": {
    default: "code_complexity",
    overrides: [
      ["God Class", "code_complexity", null],
      ["Large File", "code_complexity", null],
      ["Dead Code", "maintainability_fix", null],
      ["printStackTrace", "validate_general", "low_risk"],
      ["Deprecated", "deprecated_api", null],
      ["WCMUsePojo", "sling_model_best_practice", null],
      ["Complex Method", "code_complexity", null],
      ["Nested Depth", "code_complexity", null],
    ],
  },
  Security: {
    default: "security_general",
    overrides: [
      ["Resource Resolver Leak", "resource_resolver", null],
      ["Admin Session", "service_user", null],
      ["Admin Resource Resolver", "service_user", null],
      ["XSS", "xss_prevention", null],
      ["SSRF", "ssrf_prevention", null],
      ["Cross-Site Scripting", "xss_prevention", null],
      ["Path Traversal", "security_general", null],
      ["Hardcoded", "security_general", "needs_review"],
      ["Sensitive", "security_general", null],
      ["CSRF", "security_general", null],
    ],
  },
  SEO: {
    default: "seo_best_practice",
    overrides: [
      ["Canonical", "seo_best_practice", null],
      ["Structured Data", "seo_best_practice", null],
      ["Meta", "seo_best_practice", null],
      ["Sitemap", "seo_best_practice", null],
      ["Heading", "seo_best_practice", null],
      ["Cache-Control", "dispatcher_cache", null],
    ],
  },
  Accessibility: {
    default: "accessibility_fix",
    overrides: [
      ["ARIA", "accessibility_fix", null],
      ["Contrast", "accessibility_fix", null],
      ["Keyboard", "accessibility_fix", null],
      ["Tab Index", "accessibility_fix", null],
      ["Alt Text", "accessibility_fix", null],
      ["viewport", "accessibility_fix", null],
      ["role=", "accessibility_fix", null],
    ],
  },
  Architecture: {
    default: "sling_model_best_practice",
    overrides: [
      ["WCMUsePojo", "sling_model_best_practice", null],
      ["Sling Model", "sling_model_best_practice", null],
      ["Core Component", "core_components", null],
      ["Mutable Content", "mutable_content", null],
      ["Content Structure", "content_structure", null],
      ["Servlet", "servlet_registration", null],
      ["Service User", "service_user", null],
    ],
  },
  "Sling & OSGi": {
    default: "osgi_config_separation",
    overrides: [
      ["Resource Resolver", "resource_resolver", null],
      ["Service User", "service_user", null],
      ["OSGi Config", "osgi_config_separation", null],
      ["Event", "event_listener", null],
      ["Sling Job", "sling_job", null],
      ["Servlet", "servlet_registration", null],
      ["Filter", "validate_general", null],
    ],
  },
  "Cloud Readiness": {
    default: "cloud_readiness",
    overrides: [
      ["File System", "cloud_readiness", null],
      ["Install Hook", "cloud_readiness", null],
      ["Replication API", "replication_pattern", null],
      ["CRX/DE", "cloud_readiness", null],
      ["Mutable", "mutable_content", null],
      ["Content Distribution", "replication_pattern", null],
      ["Workflow", "workflow_optimization", null],
    ],
  },
  Dispatcher: {
    default: "dispatcher_cache",
    overrides: [
      ["Security", "dispatcher_security", null],
      ["Deny", "dispatcher_security", null],
      ["Cache", "dispatcher_cache", null],
      ["TTL", "dispatcher_cache", null],
      ["Header", "dispatcher_security", null],
      ["Flush", "dispatcher_cache", null],
    ],
  },
  "HTL & Frontend": {
    default: "htl_best_practice",
    overrides: [
      ["HTL", "htl_best_practice", null],
      ["ClientLib", "clientlib_optimization", null],
      ["clientlib", "clientlib_optimization", null],
      ["JavaScript", "clientlib_optimization", null],
      ["CSS", "clientlib_optimization", null],
      ["XSS", "xss_prevention", null],
      ["unsafe", "xss_prevention", null],
    ],
  },
  "Test Coverage": {
    default: "test_coverage",
    overrides: [
      ["JaCoCo", "test_coverage", null],
      ["Unit Test", "test_coverage", null],
      ["Integration Test", "test_coverage", null],
      ["UI Test", "test_coverage", null],
      ["SonarQube", "test_coverage", null],
      ["Functional Test", "test_coverage", null],
    ],
  },
  Maintainability: {
    default: "maintainability_fix",
    overrides: [
      ["Dead Code", "maintainability_fix", null],
      ["Complexity", "code_complexity", null],
      ["Naming", "maintainability_fix", "low_risk"],
      ["Documentation", "maintainability_fix", "optional"],
      ["Duplicate", "maintainability_fix", null],
    ],
  },
  "Dependencies & Versions": {
    default: "dependency_update",
    overrides: [
      ["CVE", "dependency_update", null],
      ["Outdated", "dependency_update", null],
      ["Deprecated", "deprecated_api", null],
      ["Version Conflict", "dependency_update", null],
    ],
  },
};

// ─── Expert Recommendation Generator ──────────────────────────────────────────

function formatRecommendation(
  templateId: string,
  severity: string,
  effort: string,
  statusOverride?: string | null
): string {
  const baseText = TEMPLATES[templateId] ?? TEMPLATES.validate_general;

  let prefix: string;
  if (statusOverride) {
    prefix = STATUS_PREFIXES[statusOverride] ?? "Aligned";
  } else if (severity === "CRITICAL" || severity === "HIGH") {
    prefix = "Aligned; prioritize";
  } else {
    prefix = "Aligned";
  }

  let result = `${prefix}: ${baseText}`;

  if (effort === "High" || effort === "Very High") {
    result += ROLLOUT_SUFFIX;
  }

  return result;
}

export function getExpertRecommendation(
  category: string,
  issueType: string,
  severity = "MEDIUM",
  effort = "Medium"
): string {
  const rules = CATEGORY_RULES[category];
  if (!rules) {
    return formatRecommendation("validate_general", severity, effort);
  }

  let templateId = rules.default;
  let statusOverride: string | null = rules.default_status ?? null;

  for (const override of rules.overrides ?? []) {
    const [keyword, tmplId, sOverride] = override;
    if (issueType.toLowerCase().includes(keyword.toLowerCase())) {
      templateId = tmplId;
      statusOverride = sOverride;
      break;
    }
  }

  return formatRecommendation(templateId, severity, effort, statusOverride);
}
