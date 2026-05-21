"""
Expert Validation & Recommendation Engine
==========================================
Auto-generates enterprise-grade expert recommendations for audit findings
based on Adobe Commerce best practices, severity, and effort level.

Architecture:
- 40 base recommendation templates (domain-specific guidance)
- Category routing rules: default template + issue-type overrides
- Severity-aware prefix: "prioritize:" for CRITICAL/HIGH
- Effort-aware suffix: rollout guidance for High effort
- Special status prefixes: false-positive, optional, low-risk, correct-with-stronger-control
"""

# ─── Base Templates ────────────────────────────────────────────────────────────
# Each template provides domain-specific, actionable expert guidance.
# Keyed by short ID for compact routing rules.

TEMPLATES = {
    "charset_utf8mb4": (
        "Standardize new/custom tables on utf8mb4 with a compatible collation "
        "for the target MySQL version. Plan conversion in batches, verify index "
        "length, and test comparisons/sorting before production rollout."
    ),
    "audit_timestamps": (
        "Add created_at/updated_at only for mutable business records that require "
        "auditability; populate defaults in db_schema.xml/resource model and index "
        "dates only when used in filters or cleanup jobs."
    ),
    "lob_access_patterns": (
        "Review actual access patterns. Split rarely used large/LOB attributes into "
        "extension/detail tables only if row size, cache pressure, or query plans "
        "show measurable impact."
    ),
    "strict_types": (
        "Add declare(strict_types=1) to new or actively touched PHP files, but avoid "
        "bulk-only churn unless CI static analysis is ready. Pair with type hints "
        "and tests to catch compatibility issues."
    ),
    "ddl_validation": (
        "Validate the recommendation with schema intent and production query patterns "
        "before changing DDL. Use declarative schema/data patches and test "
        "rollback/forward deployment behavior."
    ),
    "index_validation": (
        "Add indexes only for real query predicates/orderings. Validate with EXPLAIN "
        "on production-like data to avoid unnecessary write overhead and overly wide indexes."
    ),
    "exception_refine": (
        "Refine catches to expected Magento/domain exceptions first, keep a final "
        "Throwable/Exception fallback only at a boundary, and avoid returning partial "
        "or silent success after failure."
    ),
    "unsigned_ids": (
        "Use unsigned integer types for foreign keys referencing Magento entity IDs. "
        "Plan a data-safe migration if values or FK compatibility could be affected."
    ),
    "deprecated_upgrade": (
        "Prioritize deprecated APIs that block PHP/Adobe Commerce upgrades. Replace "
        "with Laminas/Magento equivalents and verify behavior through automated "
        "regression tests."
    ),
    "fk_lifecycle": (
        "Validate parent-child lifecycle before adding FKs. Add constraints for strong "
        "ownership, but avoid cascade deletes on high-volume commerce tables unless "
        "the data-retention impact is approved."
    ),
    "validate_general": (
        "Recommendation direction looks reasonable. Before implementation, validate "
        "the finding against real execution paths, add a targeted test, and confirm "
        "the fix does not alter checkout/order/customer flows unexpectedly."
    ),
    "logger_injection": (
        "Replace static helper calls with PSR-3 logger injection so logs are testable, "
        "contextual, and channel-aware; include masked IDs and avoid PII/secrets."
    ),
    "service_contracts": (
        "Extract reusable service contracts where there is real reuse, not just cosmetic "
        "refactoring. Preserve backward compatibility for public APIs and DI preferences."
    ),
    "repository_pattern": (
        "Prefer repositories/resource models/collections for domain data. Use direct "
        "connection only for justified bulk operations with typed parameters, "
        "whitelisted identifiers, and covered tests."
    ),
    "reserved_word_rename": (
        "Rename in a backward-compatible migration only when practical; otherwise quote "
        "identifiers consistently and avoid exposing reserved names in new schema."
    ),
    "encrypted_config": (
        "Use encrypted backend models for sensitive config, scope values deliberately, "
        "mask secrets in admin/logs, and move environment-specific values to Cloud "
        "variables/env.php."
    ),
    "cron_stagger": (
        "Stagger heavy jobs, add locking/idempotency, set sane batch sizes, and "
        "monitor duration/failure metrics so jobs do not overlap or block sales operations."
    ),
    "resolver_cache": (
        "Add resolver-level identity/cache metadata only for cacheable reads. Validate "
        "customer/session-specific data is not cached and add integration tests for "
        "cache invalidation."
    ),
    "sql_injection_control": (
        "Do not rely on bind parameters for identifiers such as table/column names; "
        "validate them against an explicit whitelist and quote identifiers via the DB "
        "adapter. Bind all values, cast LIMIT/OFFSET to int, and add integration tests "
        "for malicious inputs."
    ),
    "http_action_interface": (
        "Implement the appropriate HttpGetActionInterface/HttpPostActionInterface and "
        "enforce form key/ACL where needed; this is especially important for admin and "
        "state-changing endpoints."
    ),
    "structured_logging": (
        "Use structured, leveled logs with correlation IDs. Mask PII/secrets, avoid "
        "noisy info logs in hot paths, and configure rotation/retention in Cloud/log "
        "aggregation."
    ),
    "plugin_ordering": (
        "Add explicit sortOrder and disabled attributes, minimize around plugins, and "
        "verify plugin ordering against third-party modules to avoid hidden behavior changes."
    ),
    "observer_thin": (
        "Keep observers thin and idempotent. Move heavy work to services/queues, guard "
        "against repeated dispatch, and document event payload assumptions."
    ),
    "transaction_wrap": (
        "Wrap multi-write operations in beginTransaction/commit/rollBack, ensure "
        "idempotency for retries, and keep external API calls outside the DB "
        "transaction where possible."
    ),
    "batch_load": (
        "Batch-load collections before the loop, select only required fields, preserve "
        "result ordering explicitly, and profile affected pages/cron jobs before and "
        "after the fix."
    ),
    "cache_profiling": (
        "Confirm the change with production-like profiling. Avoid blanket caching for "
        "personalized data; define cache identities/tags and invalidation before enabling."
    ),
    "acl_least_privilege": (
        "Ensure admin routes, WebAPI resources, and controller actions use "
        "least-privilege ACLs. Add negative tests for unauthorized customer/admin/API roles."
    ),
    "cloud_topology": (
        "Validate this against Adobe Commerce Cloud topology: use remote storage/CDN "
        "where appropriate, keep generated files out of Git, and ensure deploy hooks "
        "are idempotent."
    ),
    "utc_timestamp": (
        "Use Magento UTC storage conventions, convert only at presentation boundaries, "
        "and avoid MySQL TIMESTAMP surprises unless timezone conversion is explicitly intended."
    ),
    "sku_unique": (
        "Add a unique constraint only if business rules guarantee one row per SKU; "
        "otherwise add a non-unique index and enforce uniqueness at the correct scope "
        "such as website/store/channel."
    ),
    "false_positive_secrets": (
        "Constants that only hold config XML paths are not secrets; downgrade if no "
        "literal key/token is present. If actual values exist in code/config dumps, "
        "rotate them and move them to encrypted admin config, env.php/Cloud variables, "
        "or a vault with least-privilege ACLs."
    ),
    "security_priority": (
        "Treat as high priority, but verify exploitability and false positives. Apply "
        "least privilege, input validation, output escaping, secret hygiene, and "
        "security regression tests."
    ),
    "di_injection": (
        "Inject dependencies through constructors/factories/proxies instead of "
        "ObjectManager. Watch for heavy services in constructors and use proxies for "
        "expensive or optional dependencies."
    ),
    "controller_thin": (
        "Move orchestration into service classes with interfaces, keep controllers thin, "
        "and add unit/integration coverage around the extracted business rules."
    ),
    "queue_limits": (
        "Set max_messages/batch limits, make consumers idempotent, add retry/dead-letter "
        "handling, and monitor queue lag before increasing concurrency."
    ),
    "escaper_output": (
        "Escape output by context using escaper methods or secure Knockout bindings; "
        "do not double-escape translated phrases and validate rich HTML through an allowlist."
    ),
    "exception_noswallow": (
        "Do not swallow exceptions. Log sanitized context with correlation/order "
        "identifiers, rethrow when state consistency matters, and only suppress "
        "documented non-critical exceptions."
    ),
    "csrf_formkey": (
        "For state-changing POST actions, validate form keys or use "
        "CsrfAwareActionInterface only with a documented safe exception. Never exempt "
        "public write endpoints without compensating auth controls."
    ),
    "upload_security": (
        "Use Magento UploaderFactory or an equivalent service, enforce extension/MIME/size "
        "whitelist, generate a safe filename, store outside pub until validated, and "
        "scan or quarantine uploads before processing."
    ),
    "test_coverage": (
        "Add focused unit/integration/API tests for the corrected behavior and one "
        "regression test for the failure mode; gate high-risk fixes in CI."
    ),
    "business_flow_integrity": (
        "Validate the customization against Adobe Commerce service-layer flow, entity "
        "state machines, events, indexes, emails, and rollback behavior. Add integration "
        "tests for checkout/order/customer side effects and retry/idempotency."
    ),
    "critical_callback_security": (
        "Verify authentication/signature, replay protection, idempotency keys, row locking, "
        "and duplicate/out-of-order handling before changing payment, shipment, refund, or "
        "inventory state."
    ),
    "msi_inventory_api": (
        "Use MSI service contracts/reservation/source-item APIs instead of legacy stock table "
        "writes. Test multi-source, salable qty, backorders, cancellations, refunds, and shipment "
        "deduction behavior."
    ),
    "admin_api_least_privilege": (
        "Apply least-privilege ACL, ownership validation, CSRF/form-key or signed request checks, "
        "and negative API/admin tests for anonymous, wrong customer, and low-privilege admin access."
    ),
}


# ─── Status Prefix Map ────────────────────────────────────────────────────────
# Some issue types get special status prefixes instead of the standard Aligned.

STATUS_PREFIXES = {
    "aligned":           "Aligned",
    "aligned_prioritize": "Aligned; prioritize",
    "optional":          "Optional / style alignment",
    "low_risk":          "Low-risk correction",
    "correct_stronger":  "Correct with stronger control",
    "needs_review":      "Needs review / possible false positive",
}

# Rollout suffix for high-effort items
ROLLOUT_SUFFIX = (
    " Plan rollout in small PRs with rollback notes because "
    "the estimated effort is high."
)


# ─── Category Routing Rules ───────────────────────────────────────────────────
# Each category defines:
#   "default": template_id — used for all issue types unless overridden
#   "overrides": list of (keyword_or_prefix, template_id, optional_status)
#     - keyword matches are case-insensitive substring checks on issue_type
#     - status override replaces the auto-computed status

CATEGORY_RULES = {
    # ── Code Audit Categories ──
    "Exception Handling": {
        "default": "exception_refine",
        "overrides": [
            ("Empty Catch", "exception_noswallow", None),
            ("Debug Output", "validate_general", None),
            ("Missing Finally", "validate_general", None),
            ("Silent Return", "validate_general", None),
            ("Return After Exception", "validate_general", None),
            ("Wrong Log Level", "validate_general", None),
        ],
    },
    "Security": {
        "default": "security_priority",
        "overrides": [
            ("Hardcoded Credentials", "false_positive_secrets", "needs_review"),
            ("Unsafe File Upload", "upload_security", None),
            ("SQL Injection", "sql_injection_control", "correct_stronger"),
            ("Superglobal", "security_priority", None),
            ("Path Traversal", "security_priority", None),
            ("Test Framework", "escaper_output", None),
            ("CSP", "security_priority", None),
        ],
    },
    "Database": {
        "default": "ddl_validation",
        "overrides": [
            ("N+1", "batch_load", None),
            ("Load in Loop", "batch_load", None),
            ("Missing Transaction", "transaction_wrap", None),
            ("Save in Loop", "ddl_validation", None),
            ("Raw SQL", "ddl_validation", None),
            ("Table Name Interpolation", "sql_injection_control", "correct_stronger"),
            ("Missing Index", "audit_timestamps", None),
        ],
    },
    "Caching": {
        "default": "cache_profiling",
        "overrides": [
            ("GraphQL Resolver Without Cache", "resolver_cache", None),
        ],
    },
    "Code Structure": {
        "default": "service_contracts",
        "overrides": [
            ("Missing strict_types", "strict_types", "optional"),
            ("Business Logic in Controller", "controller_thin", None),
        ],
    },
    "Performance": {
        "default": "cache_profiling",
    },
    "Deprecated": {
        "default": "deprecated_upgrade",
    },
    "Logging": {
        "default": "structured_logging",
        "overrides": [
            ("Static Logger", "logger_injection", None),
        ],
    },
    "File Storage": {
        "default": "cron_stagger",
        "overrides": [
            ("S3", "cloud_topology", None),
        ],
    },
    "Reusability": {
        "default": "service_contracts",
    },
    "Test Coverage": {
        "default": "test_coverage",
    },
    "Dependency Injection": {
        "default": "di_injection",
        "overrides": [
            ("Legacy _objectManager", "deprecated_upgrade", None),
        ],
    },
    "Plugin Architecture": {
        "default": "plugin_ordering",
    },
    "Cron Jobs": {
        "default": "cron_stagger",
        "overrides": [
            ("Cron Without Lock", "observer_thin", None),
        ],
    },
    "GraphQL": {
        "default": "resolver_cache",
        "overrides": [
            ("N+1", "batch_load", None),
        ],
    },
    "Queue Processing": {
        "default": "queue_limits",
    },
    "Configuration": {
        "default": "escaper_output",
    },
    "Frontend Templates": {
        "default": "escaper_output",
    },
    "XML Configuration": {
        "default": "encrypted_config",
        "overrides": [
            ("Plugin Missing sortOrder", "plugin_ordering", None),
            ("Plugin Missing disabled", "plugin_ordering", None),
            ("Sandbox", "false_positive_secrets", "needs_review"),
            ("Test URL", "false_positive_secrets", "needs_review"),
            ("Core Class Override", "di_injection", None),
            ("TODO in Cron", "cron_stagger", None),
            ("Sensitive Field Not Encrypted", "encrypted_config", None),
        ],
    },
    "WebAPI & ACL": {
        "default": "acl_least_privilege",
    },
    "DB Schema": {
        "default": "ddl_validation",
        "overrides": [
            ("Status Column Without Index", "lob_access_patterns", None),
            ("Nullable Without Default", "lob_access_patterns", None),
            ("No Indexes on Table", "ddl_validation", None),
            ("created_at", "audit_timestamps", None),
            ("updated_at", "audit_timestamps", None),
        ],
    },
    "Infrastructure": {
        "default": "cloud_topology",
        "overrides": [
            ("Security Header", "observer_thin", None),
            ("X-XSS-Protection", "escaper_output", None),
            ("Rate Limiting", "cloud_topology", None),
        ],
    },
    "Cloud Deployment": {
        "default": "cron_stagger",
        "overrides": [
            ("Missing PHP Extension", "cloud_topology", None),
            ("PHP Extension", "cloud_topology", None),
            ("High Consumer", "queue_limits", None),
            ("Consumer Processes", "queue_limits", None),
        ],
    },
    "PHP Deep Analysis": {
        "default": "validate_general",
        "overrides": [
            ("Direct DB Connection", "repository_pattern", None),
            ("DateTime Without Timezone", "utc_timestamp", None),
            ("Deprecated", "deprecated_upgrade", None),
            ("exit/die", "validate_general", None),
            ("Weak Hashing", "validate_general", None),
        ],
    },
    "Event Observers": {
        "default": "observer_thin",
    },
    "Module Architecture": {
        "default": "service_contracts",
        "overrides": [
            ("Controller Missing HTTP", "http_action_interface", None),
            ("Global Plugin", "service_contracts", None),
        ],
    },
    "Code Metrics": {
        "default": "validate_general",
    },
    "Business Logic Identification": {
        "default": "validate_general",
        "overrides": [
            ("Admin Grid", "deprecated_upgrade", None),
            ("REST API", "acl_least_privilege", None),
        ],
    },
    "Business Customization Review": {
        "default": "business_flow_integrity",
        "overrides": [
            ("Direct Order/Entity State", "business_flow_integrity", "correct_stronger"),
            ("Direct Save", "business_flow_integrity", "correct_stronger"),
            ("Synchronous External API", "critical_callback_security", None),
            ("Hardcoded Business Rule", "validate_general", None),
        ],
    },
    "Critical Commerce Flows": {
        "default": "business_flow_integrity",
        "overrides": [
            ("Webhook/Callback", "critical_callback_security", "correct_stronger"),
            ("Around Plugin", "plugin_ordering", None),
            ("collectTotals", "cache_profiling", None),
        ],
    },
    "MSI Inventory & Source Management": {
        "default": "msi_inventory_api",
    },
    "Admin & Integration Security": {
        "default": "admin_api_least_privilege",
        "overrides": [
            ("Inbound Integration", "critical_callback_security", "correct_stronger"),
            ("Broad WebAPI ACL", "admin_api_least_privilege", "correct_stronger"),
        ],
    },
    "Logical Flow & Cross-Module": {
        "default": "service_contracts",
        "overrides": [
            ("Circular Dependency", "service_contracts", None),
            ("High Coupling", "service_contracts", None),
            ("Central Module", "service_contracts", None),
            ("Duplicated Logic", "service_contracts", None),
            ("Duplicate Class", "service_contracts", None),
            ("Unused Module", "validate_general", "needs_review"),
            ("Missing module.xml Sequence", "validate_general", None),
            ("Cross-Module Event", "observer_thin", None),
            ("Multi-Module Plugin", "plugin_ordering", None),
            ("Cross-Module Analysis Summary", "validate_general", None),
        ],
    },

    # ── DB Audit Categories ──
    "DB: Table Structure": {
        "default": "ddl_validation",
        "overrides": [
            ("No Secondary Indexes", "index_validation", None),
            ("Wide Table", "lob_access_patterns", None),
            ("Extremely Wide", "lob_access_patterns", None),
            ("Moderately Wide", "lob_access_patterns", None),
        ],
    },
    "DB: Index Analysis": {
        "default": "index_validation",
        "overrides": [
            ("Date Column", "audit_timestamps", None),
            ("Wide Composite", "ddl_validation", None),
            ("Redundant Index", "ddl_validation", None),
            ("Excessive Indexes", "audit_timestamps", None),
        ],
    },
    "DB: Column Analysis": {
        "default": "lob_access_patterns",
        "overrides": [
            ("TIMESTAMP", "audit_timestamps", None),
            ("Oversized Boolean", "ddl_validation", None),
            ("Excessive VARCHAR", "ddl_validation", None),
            ("Signed ID", "unsigned_ids", None),
            ("Imprecise Type for Money", "ddl_validation", None),
        ],
    },
    "DB: Foreign Keys": {
        "default": "fk_lifecycle",
    },
    "DB: Naming Conventions": {
        "default": "reserved_word_rename",
        "default_status": "low_risk",
        "overrides": [
            ("Missing Vendor Prefix", "ddl_validation", None),
            ("CamelCase", "ddl_validation", None),
        ],
    },
    "DB: Storage Engine": {
        "default": "fk_lifecycle",
    },
    "DB: Charset & Collation": {
        "default": "charset_utf8mb4",
    },
    "DB: Adobe Commerce Schema": {
        "default": "ddl_validation",
        "overrides": [
            ("Cleanup Tables", "cron_stagger", None),
        ],
    },
    "DB: Data Integrity": {
        "default": "audit_timestamps",
        "overrides": [
            ("Email Column", "ddl_validation", None),
            ("SKU Without UNIQUE", "sku_unique", None),
        ],
    },
    "DB: Performance": {
        "default": "lob_access_patterns",
        "overrides": [
            ("No Clustered Index", "cache_profiling", None),
            ("DB Performance Summary", "cache_profiling", None),
        ],
    },
}


# ─── Expert Recommendation Generator ──────────────────────────────────────────

def get_expert_recommendation(category, issue_type, severity="MEDIUM", effort="Medium"):
    """Generate expert recommendation for a finding based on category, issue type, severity and effort.

    Returns a string like:
        "Aligned; prioritize: <template text>. Plan rollout in small PRs..."
    or  "Needs review / possible false positive: <template text>"
    """
    rules = CATEGORY_RULES.get(category)
    if not rules:
        # Fallback for unknown categories
        return _format_recommendation("validate_general", severity, effort)

    template_id = rules["default"]
    status_override = rules.get("default_status")

    # Check overrides (first keyword match wins)
    for override in rules.get("overrides", []):
        keyword, tmpl_id, s_override = override
        if keyword.lower() in issue_type.lower():
            template_id = tmpl_id
            status_override = s_override
            break

    return _format_recommendation(template_id, severity, effort, status_override)


def _format_recommendation(template_id, severity, effort, status_override=None):
    """Format the final recommendation with appropriate prefix and suffix."""
    base_text = TEMPLATES.get(template_id, TEMPLATES["validate_general"])

    # Determine status prefix
    if status_override:
        prefix = STATUS_PREFIXES.get(status_override, "Aligned")
    elif severity in ("CRITICAL", "HIGH"):
        prefix = "Aligned; prioritize"
    else:
        prefix = "Aligned"

    result = f"{prefix}: {base_text}"

    # Add rollout suffix for high-effort items
    if effort in ("High", "Very High"):
        result += ROLLOUT_SUFFIX

    return result


def get_executive_summary_expert(row_label, severity_context=None):
    """Generate expert recommendation for Executive Summary rows."""
    label = str(row_label).strip()

    if label in ("Generated:", "Project Root:", "Tool:", "Version:"):
        return "Metadata only; no remediation required."

    if "Total Findings" in label:
        return ("Use as a triage count, not a defect count; de-duplicate "
                "repeated patterns before sizing remediation.")

    if "SEVERITY BREAKDOWN" in label or label == "Severity":
        return ("Prioritize by exploitability/customer impact, not severity "
                "label alone; review possible false positives.")

    if label in ("CRITICAL", "HIGH"):
        return ("Prioritize by exploitability/customer impact, not severity "
                "label alone; review possible false positives.")

    return "Review supporting detailed sheets before actioning this summary item."
