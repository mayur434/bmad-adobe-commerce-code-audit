/**
 * Expert Validation & Recommendation Engine
 * ==========================================
 * Auto-generates enterprise-grade expert recommendations for audit findings
 * based on Adobe Commerce best practices, severity, and effort level.
 *
 * Architecture:
 * - 40+ base recommendation templates (domain-specific guidance)
 * - Category routing rules: default template + issue-type overrides
 * - Severity-aware prefix: "prioritize:" for CRITICAL/HIGH
 * - Effort-aware suffix: rollout guidance for High effort
 * - Special status prefixes: false-positive, optional, low-risk, correct-with-stronger-control
 */

// ─── Base Templates ────────────────────────────────────────────────────────────
const TEMPLATES: Record<string, string> = {
  charset_utf8mb4:
    "Standardize new/custom tables on utf8mb4 with a compatible collation " +
    "for the target MySQL version. Plan conversion in batches, verify index " +
    "length, and test comparisons/sorting before production rollout.",
  audit_timestamps:
    "Add created_at/updated_at only for mutable business records that require " +
    "auditability; populate defaults in db_schema.xml/resource model and index " +
    "dates only when used in filters or cleanup jobs.",
  lob_access_patterns:
    "Review actual access patterns. Split rarely used large/LOB attributes into " +
    "extension/detail tables only if row size, cache pressure, or query plans " +
    "show measurable impact.",
  strict_types:
    "Add declare(strict_types=1) to new or actively touched PHP files, but avoid " +
    "bulk-only churn unless CI static analysis is ready. Pair with type hints " +
    "and tests to catch compatibility issues.",
  ddl_validation:
    "Validate the recommendation with schema intent and production query patterns " +
    "before changing DDL. Use declarative schema/data patches and test " +
    "rollback/forward deployment behavior.",
  index_validation:
    "Add indexes only for real query predicates/orderings. Validate with EXPLAIN " +
    "on production-like data to avoid unnecessary write overhead and overly wide indexes.",
  exception_refine:
    "Refine catches to expected Magento/domain exceptions first, keep a final " +
    "Throwable/Exception fallback only at a boundary, and avoid returning partial " +
    "or silent success after failure.",
  unsigned_ids:
    "Use unsigned integer types for foreign keys referencing Magento entity IDs. " +
    "Plan a data-safe migration if values or FK compatibility could be affected.",
  deprecated_upgrade:
    "Prioritize deprecated APIs that block PHP/Adobe Commerce upgrades. Replace " +
    "with Laminas/Magento equivalents and verify behavior through automated " +
    "regression tests.",
  fk_lifecycle:
    "Validate parent-child lifecycle before adding FKs. Add constraints for strong " +
    "ownership, but avoid cascade deletes on high-volume commerce tables unless " +
    "the data-retention impact is approved.",
  validate_general:
    "Recommendation direction looks reasonable. Before implementation, validate " +
    "the finding against real execution paths, add a targeted test, and confirm " +
    "the fix does not alter checkout/order/customer flows unexpectedly.",
  logger_injection:
    "Replace static helper calls with PSR-3 logger injection so logs are testable, " +
    "contextual, and channel-aware; include masked IDs and avoid PII/secrets.",
  service_contracts:
    "Extract reusable service contracts where there is real reuse, not just cosmetic " +
    "refactoring. Preserve backward compatibility for public APIs and DI preferences.",
  repository_pattern:
    "Prefer repositories/resource models/collections for domain data. Use direct " +
    "connection only for justified bulk operations with typed parameters, " +
    "whitelisted identifiers, and covered tests.",
  reserved_word_rename:
    "Rename in a backward-compatible migration only when practical; otherwise quote " +
    "identifiers consistently and avoid exposing reserved names in new schema.",
  encrypted_config:
    "Use encrypted backend models for sensitive config, scope values deliberately, " +
    "mask secrets in admin/logs, and move environment-specific values to Cloud " +
    "variables/env.php.",
  cron_stagger:
    "Stagger heavy jobs, add locking/idempotency, set sane batch sizes, and " +
    "monitor duration/failure metrics so jobs do not overlap or block sales operations.",
  resolver_cache:
    "Add resolver-level identity/cache metadata only for cacheable reads. Validate " +
    "customer/session-specific data is not cached and add integration tests for " +
    "cache invalidation.",
  sql_injection_control:
    "Do not rely on bind parameters for identifiers such as table/column names; " +
    "validate them against an explicit whitelist and quote identifiers via the DB " +
    "adapter. Bind all values, cast LIMIT/OFFSET to int, and add integration tests " +
    "for malicious inputs.",
  http_action_interface:
    "Implement the appropriate HttpGetActionInterface/HttpPostActionInterface and " +
    "enforce form key/ACL where needed; this is especially important for admin and " +
    "state-changing endpoints.",
  structured_logging:
    "Use structured, leveled logs with correlation IDs. Mask PII/secrets, avoid " +
    "noisy info logs in hot paths, and configure rotation/retention in Cloud/log " +
    "aggregation.",
  plugin_ordering:
    "Add explicit sortOrder and disabled attributes, minimize around plugins, and " +
    "verify plugin ordering against third-party modules to avoid hidden behavior changes.",
  observer_thin:
    "Keep observers thin and idempotent. Move heavy work to services/queues, guard " +
    "against repeated dispatch, and document event payload assumptions.",
  transaction_wrap:
    "Wrap multi-write operations in beginTransaction/commit/rollBack, ensure " +
    "idempotency for retries, and keep external API calls outside the DB " +
    "transaction where possible.",
  batch_load:
    "Batch-load collections before the loop, select only required fields, preserve " +
    "result ordering explicitly, and profile affected pages/cron jobs before and " +
    "after the fix.",
  cache_profiling:
    "Confirm the change with production-like profiling. Avoid blanket caching for " +
    "personalized data; define cache identities/tags and invalidation before enabling.",
  acl_least_privilege:
    "Ensure admin routes, WebAPI resources, and controller actions use " +
    "least-privilege ACLs. Add negative tests for unauthorized customer/admin/API roles.",
  cloud_topology:
    "Validate this against Adobe Commerce Cloud topology: use remote storage/CDN " +
    "where appropriate, keep generated files out of Git, and ensure deploy hooks " +
    "are idempotent.",
  utc_timestamp:
    "Use Magento UTC storage conventions, convert only at presentation boundaries, " +
    "and avoid MySQL TIMESTAMP surprises unless timezone conversion is explicitly intended.",
  sku_unique:
    "Add a unique constraint only if business rules guarantee one row per SKU; " +
    "otherwise add a non-unique index and enforce uniqueness at the correct scope " +
    "such as website/store/channel.",
  false_positive_secrets:
    "Constants that only hold config XML paths are not secrets; downgrade if no " +
    "literal key/token is present. If actual values exist in code/config dumps, " +
    "rotate them and move them to encrypted admin config, env.php/Cloud variables, " +
    "or a vault with least-privilege ACLs.",
  security_priority:
    "Treat as high priority, but verify exploitability and false positives. Apply " +
    "least privilege, input validation, output escaping, secret hygiene, and " +
    "security regression tests.",
  di_injection:
    "Inject dependencies through constructors/factories/proxies instead of " +
    "ObjectManager. Watch for heavy services in constructors and use proxies for " +
    "expensive or optional dependencies.",
  controller_thin:
    "Move orchestration into service classes with interfaces, keep controllers thin, " +
    "and add unit/integration coverage around the extracted business rules.",
  queue_limits:
    "Set max_messages/batch limits, make consumers idempotent, add retry/dead-letter " +
    "handling, and monitor queue lag before increasing concurrency.",
  escaper_output:
    "Escape output by context using escaper methods or secure Knockout bindings; " +
    "do not double-escape translated phrases and validate rich HTML through an allowlist.",
  exception_noswallow:
    "Do not swallow exceptions. Log sanitized context with correlation/order " +
    "identifiers, rethrow when state consistency matters, and only suppress " +
    "documented non-critical exceptions.",
  csrf_formkey:
    "For state-changing POST actions, validate form keys or use " +
    "CsrfAwareActionInterface only with a documented safe exception. Never exempt " +
    "public write endpoints without compensating auth controls.",
  upload_security:
    "Use Magento UploaderFactory or an equivalent service, enforce extension/MIME/size " +
    "whitelist, generate a safe filename, store outside pub until validated, and " +
    "scan or quarantine uploads before processing.",
  test_coverage:
    "Add focused unit/integration/API tests for the corrected behavior and one " +
    "regression test for the failure mode; gate high-risk fixes in CI.",
  business_flow_integrity:
    "Validate the customization against Adobe Commerce service-layer flow, entity " +
    "state machines, events, indexes, emails, and rollback behavior. Add integration " +
    "tests for checkout/order/customer side effects and retry/idempotency.",
  critical_callback_security:
    "Verify authentication/signature, replay protection, idempotency keys, row locking, " +
    "and duplicate/out-of-order handling before changing payment, shipment, refund, or " +
    "inventory state.",
  msi_inventory_api:
    "Use MSI service contracts/reservation/source-item APIs instead of legacy stock table " +
    "writes. Test multi-source, salable qty, backorders, cancellations, refunds, and shipment " +
    "deduction behavior.",
  admin_api_least_privilege:
    "Apply least-privilege ACL, ownership validation, CSRF/form-key or signed request checks, " +
    "and negative API/admin tests for anonymous, wrong customer, and low-privilege admin access.",
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
  "Exception Handling": {
    default: "exception_refine",
    overrides: [
      ["Empty Catch", "exception_noswallow", null],
      ["Debug Output", "validate_general", null],
      ["Missing Finally", "validate_general", null],
      ["Silent Return", "validate_general", null],
      ["Return After Exception", "validate_general", null],
      ["Wrong Log Level", "validate_general", null],
    ],
  },
  Security: {
    default: "security_priority",
    overrides: [
      ["Hardcoded Credentials", "false_positive_secrets", "needs_review"],
      ["Unsafe File Upload", "upload_security", null],
      ["SQL Injection", "sql_injection_control", "correct_stronger"],
      ["Superglobal", "security_priority", null],
      ["Path Traversal", "security_priority", null],
      ["Test Framework", "escaper_output", null],
      ["CSP", "security_priority", null],
    ],
  },
  Database: {
    default: "ddl_validation",
    overrides: [
      ["N+1", "batch_load", null],
      ["Load in Loop", "batch_load", null],
      ["Missing Transaction", "transaction_wrap", null],
      ["Save in Loop", "ddl_validation", null],
      ["Raw SQL", "ddl_validation", null],
      ["Table Name Interpolation", "sql_injection_control", "correct_stronger"],
      ["Missing Index", "audit_timestamps", null],
    ],
  },
  Caching: {
    default: "cache_profiling",
    overrides: [["GraphQL Resolver Without Cache", "resolver_cache", null]],
  },
  "Code Structure": {
    default: "service_contracts",
    overrides: [
      ["Missing strict_types", "strict_types", "optional"],
      ["Business Logic in Controller", "controller_thin", null],
    ],
  },
  Performance: { default: "cache_profiling" },
  Deprecated: { default: "deprecated_upgrade" },
  Logging: {
    default: "structured_logging",
    overrides: [["Static Logger", "logger_injection", null]],
  },
  "File Storage": {
    default: "cron_stagger",
    overrides: [["S3", "cloud_topology", null]],
  },
  Reusability: { default: "service_contracts" },
  "Test Coverage": { default: "test_coverage" },
  "Dependency Injection": {
    default: "di_injection",
    overrides: [["Legacy _objectManager", "deprecated_upgrade", null]],
  },
  "Plugin Architecture": { default: "plugin_ordering" },
  "Cron Jobs": {
    default: "cron_stagger",
    overrides: [["Cron Without Lock", "observer_thin", null]],
  },
  GraphQL: {
    default: "resolver_cache",
    overrides: [["N+1", "batch_load", null]],
  },
  "Queue Processing": { default: "queue_limits" },
  Configuration: { default: "escaper_output" },
  "Frontend Templates": { default: "escaper_output" },
  "XML Configuration": {
    default: "encrypted_config",
    overrides: [
      ["Plugin Missing sortOrder", "plugin_ordering", null],
      ["Plugin Missing disabled", "plugin_ordering", null],
      ["Sandbox", "false_positive_secrets", "needs_review"],
      ["Test URL", "false_positive_secrets", "needs_review"],
      ["Core Class Override", "di_injection", null],
      ["TODO in Cron", "cron_stagger", null],
      ["Sensitive Field Not Encrypted", "encrypted_config", null],
    ],
  },
  "WebAPI & ACL": { default: "acl_least_privilege" },
  "DB Schema": {
    default: "ddl_validation",
    overrides: [
      ["Status Column Without Index", "lob_access_patterns", null],
      ["Nullable Without Default", "lob_access_patterns", null],
      ["No Indexes on Table", "ddl_validation", null],
      ["created_at", "audit_timestamps", null],
      ["updated_at", "audit_timestamps", null],
    ],
  },
  Infrastructure: {
    default: "cloud_topology",
    overrides: [
      ["Security Header", "observer_thin", null],
      ["X-XSS-Protection", "escaper_output", null],
      ["Rate Limiting", "cloud_topology", null],
    ],
  },
  "Cloud Deployment": {
    default: "cron_stagger",
    overrides: [
      ["Missing PHP Extension", "cloud_topology", null],
      ["PHP Extension", "cloud_topology", null],
      ["High Consumer", "queue_limits", null],
      ["Consumer Processes", "queue_limits", null],
    ],
  },
  "PHP Deep Analysis": {
    default: "validate_general",
    overrides: [
      ["Direct DB Connection", "repository_pattern", null],
      ["DateTime Without Timezone", "utc_timestamp", null],
      ["Deprecated", "deprecated_upgrade", null],
      ["exit/die", "validate_general", null],
      ["Weak Hashing", "validate_general", null],
    ],
  },
  "Event Observers": { default: "observer_thin" },
  "Module Architecture": {
    default: "service_contracts",
    overrides: [
      ["Controller Missing HTTP", "http_action_interface", null],
      ["Global Plugin", "service_contracts", null],
    ],
  },
  "Code Metrics": { default: "validate_general" },
  "Business Logic Identification": {
    default: "validate_general",
    overrides: [
      ["Admin Grid", "deprecated_upgrade", null],
      ["REST API", "acl_least_privilege", null],
    ],
  },
  "Business Customization Review": {
    default: "business_flow_integrity",
    overrides: [
      ["Direct Order/Entity State", "business_flow_integrity", "correct_stronger"],
      ["Direct Save", "business_flow_integrity", "correct_stronger"],
      ["Synchronous External API", "critical_callback_security", null],
      ["Hardcoded Business Rule", "validate_general", null],
    ],
  },
  "Critical Commerce Flows": {
    default: "business_flow_integrity",
    overrides: [
      ["Webhook/Callback", "critical_callback_security", "correct_stronger"],
      ["Around Plugin", "plugin_ordering", null],
      ["collectTotals", "cache_profiling", null],
    ],
  },
  "MSI Inventory & Source Management": { default: "msi_inventory_api" },
  "Admin & Integration Security": {
    default: "admin_api_least_privilege",
    overrides: [
      ["Inbound Integration", "critical_callback_security", "correct_stronger"],
      ["Broad WebAPI ACL", "admin_api_least_privilege", "correct_stronger"],
    ],
  },
  "Logical Flow & Cross-Module": {
    default: "service_contracts",
    overrides: [
      ["Circular Dependency", "service_contracts", null],
      ["High Coupling", "service_contracts", null],
      ["Central Module", "service_contracts", null],
      ["Duplicated Logic", "service_contracts", null],
      ["Duplicate Class", "service_contracts", null],
      ["Unused Module", "validate_general", "needs_review"],
      ["Missing module.xml Sequence", "validate_general", null],
      ["Cross-Module Event", "observer_thin", null],
      ["Multi-Module Plugin", "plugin_ordering", null],
      ["Cross-Module Analysis Summary", "validate_general", null],
    ],
  },
  // ── DB Audit Categories ──
  "DB: Table Structure": {
    default: "ddl_validation",
    overrides: [
      ["No Secondary Indexes", "index_validation", null],
      ["Wide Table", "lob_access_patterns", null],
      ["Extremely Wide", "lob_access_patterns", null],
      ["Moderately Wide", "lob_access_patterns", null],
    ],
  },
  "DB: Index Analysis": {
    default: "index_validation",
    overrides: [
      ["Date Column", "audit_timestamps", null],
      ["Wide Composite", "ddl_validation", null],
      ["Redundant Index", "ddl_validation", null],
      ["Excessive Indexes", "audit_timestamps", null],
    ],
  },
  "DB: Column Analysis": {
    default: "lob_access_patterns",
    overrides: [
      ["TIMESTAMP", "audit_timestamps", null],
      ["Oversized Boolean", "ddl_validation", null],
      ["Excessive VARCHAR", "ddl_validation", null],
      ["Signed ID", "unsigned_ids", null],
      ["Imprecise Type for Money", "ddl_validation", null],
    ],
  },
  "DB: Foreign Keys": { default: "fk_lifecycle" },
  "DB: Naming Conventions": {
    default: "reserved_word_rename",
    default_status: "low_risk",
    overrides: [
      ["Missing Vendor Prefix", "ddl_validation", null],
      ["CamelCase", "ddl_validation", null],
    ],
  },
  "DB: Storage Engine": { default: "fk_lifecycle" },
  "DB: Charset & Collation": { default: "charset_utf8mb4" },
  "DB: Adobe Commerce Schema": {
    default: "ddl_validation",
    overrides: [["Cleanup Tables", "cron_stagger", null]],
  },
  "DB: Data Integrity": {
    default: "audit_timestamps",
    overrides: [
      ["Email Column", "ddl_validation", null],
      ["SKU Without UNIQUE", "sku_unique", null],
    ],
  },
  "DB: Performance": {
    default: "lob_access_patterns",
    overrides: [
      ["No Clustered Index", "cache_profiling", null],
      ["DB Performance Summary", "cache_profiling", null],
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

export function getExecutiveSummaryExpert(rowLabel: string): string {
  const label = rowLabel.trim();

  if (["Generated:", "Project Root:", "Tool:", "Version:"].includes(label)) {
    return "Metadata only; no remediation required.";
  }

  if (label.includes("Total Findings")) {
    return (
      "Use as a triage count, not a defect count; de-duplicate " +
      "repeated patterns before sizing remediation."
    );
  }

  if (label.includes("SEVERITY BREAKDOWN") || label === "Severity") {
    return (
      "Prioritize by exploitability/customer impact, not severity " +
      "label alone; review possible false positives."
    );
  }

  if (label === "CRITICAL" || label === "HIGH") {
    return (
      "Prioritize by exploitability/customer impact, not severity " +
      "label alone; review possible false positives."
    );
  }

  return "Review supporting detailed sheets before actioning this summary item.";
}
