# BMAD DEPT Code Agent — Prompt Reference

All supported prompts grouped by **Agent** and **Platform**. Only implemented features are listed.

Legend: ✅ Implemented | 🔲 Planned (not yet available)

---

## 1. Code Audit Agent (`bmad-dept-code-audit-agent`)

### Adobe Commerce ✅

| Action | Prompt |
|--------|--------|
| Quick scan | `scan my project` |
| Named scan | `scan my project and name it "Client Name"` |
| Module filter | `scan only the Checkout and Payment modules` |
| Namespace filter | `scan only the Custom namespace` |
| DB analysis | `scan my project with DB dump at /path/to/dump.sql` |
| BRD impact | `scan with BRD impact analysis using /path/to/requirements.docx` |
| Bug analysis | `scan with bug report from /path/to/bugs.xlsx` |
| Patch analysis | `analyze patch upgrade impact from 2.4.7-p7 to 2.4.7-p9` |
| Full scanner | `run full scanner: code + DB + BRD + patch analysis` |
| Deep audit (LLM) | `deep audit my project` |
| Full audit (both) | `full audit my project` |
| Combined multi-layer | `run full audit named "X" with DB at /path.sql, BRD at /path.docx, bugs at /path.xlsx, patch 2.4.7-p7 to 2.4.7-p9` |
| Ambiguous (asks mode) | `audit my project` / `run a code review` / `check my code` |

**Post-audit:**

| Action | Prompt |
|--------|--------|
| Summary | `summarize the audit findings` |
| Filter severity | `show me all CRITICAL severity items` |
| Top risks | `what are the top 10 highest-risk findings?` |
| Module breakdown | `which modules have the most issues?` |
| Fix plan | `create a fix plan for the critical items` |
| Effort estimate | `estimate effort to fix all HIGH and CRITICAL findings` |
| JSON export | `export findings as JSON` |
| Config | `show current audit config` |
| Thresholds | `update thresholds: god_class_lines=600, fat_constructor_deps=12` |

### AEM (AEMaaCS + AEM AMS) ✅

**Tier 1 — Scanner (Excel/MD/PDF report with 15 categories):**

| Action | Prompt |
|--------|--------|
| Quick scan | `scan my AEM project` |
| Named scan | `scan my AEM project and name it "Client Name"` |
| Specify path | `scan my AEM project at D:\path\to\project` |
| Explicit engine | `scan --engine aem --path /path/to/project` |
| Platform filter (ACS only) | `scan my AEM Cloud Service project` |
| Platform filter (AMS only) | `scan my AEM AMS project` |
| Format: Excel (default) | `scan my AEM project --format excel` |
| Format: Markdown | `scan my AEM project --format md` |
| Format: PDF | `scan my AEM project --format pdf` |
| Format: All three | `scan my AEM project --format all` |

**Tier 2 — Deep Audit (LLM semantic analysis):**

| Action | Prompt |
|--------|--------|
| Deep audit | `deep audit my AEM project` |
| Deep audit (named) | `deep audit for my Wipro project` |
| LLM analysis only | `run LLM analysis on my AEM codebase` |

**Full Audit (Tier 1 + Tier 2):**

| Action | Prompt |
|--------|--------|
| Full audit | `full audit my AEM project` |
| Full audit (named) | `full audit my AEM project and name it "Client X"` |
| Complete audit | `complete audit of my AEMaaCS project` |
| Full audit + format | `full audit my AEM project --format all` |

**Output Formats:**

| Format | Flag | Description |
|--------|------|-------------|
| Excel (default) | `--format excel` | `.xlsx` with 16 sheets (Executive Summary + 15 categories) |
| Markdown | `--format md` | `.md` with severity tables, tech stack, action plan |
| PDF | `--format pdf` | Styled `.pdf` with category breakdowns & recommendations |
| All three | `--format all` | Generates `.xlsx` + `.md` + `.pdf` in one run |

**AEM Scan Categories (15):**

| # | Category | What it checks |
|---|----------|----------------|
| 1 | Performance | Oak query traversals, Sling Model caching, bundle sizes |
| 2 | Code Quality | God classes, empty catches, dead code, naming |
| 3 | Security | XSS, path traversal, admin sessions, CSRF |
| 4 | SEO | Meta tags, structured data, canonical URLs |
| 5 | Accessibility | ARIA, alt text, color contrast, keyboard nav |
| 6 | Architecture | Circular deps, layer violations, coupling |
| 7 | Sling & OSGi | Resource resolver leaks, service refs, configs |
| 8 | Cloud Readiness | Mutable content, runmodes, Cloud SDK compat |
| 9 | Dispatcher | Cache rules, filters, rewrites, headers |
| 10 | HTL & Frontend | data-sly usage, clientlib patterns, inline JS |
| 11 | Test Coverage | Missing unit tests, integration test gaps |
| 12 | Maintainability | Complexity, duplication, documentation |
| 13 | Frontend Framework | SPA detection (React/Angular/Vue), bundle analysis |
| 14 | AMS Specific | Replication agents, workflow launchers, legacy APIs |
| 15 | Dependencies & Versions | Java/AEM/Node.js versions, EOL libraries, outdated deps |

**Post-audit:**

| Action | Prompt |
|--------|--------|
| Summary | `summarize the AEM audit findings` |
| Filter severity | `show all CRITICAL findings from the AEM audit` |
| Top risks | `what are the top 10 highest-risk AEM findings?` |
| Security focus | `show all security findings` |
| Performance focus | `show all performance findings` |
| Fix plan | `create a fix plan for the critical AEM issues` |
| Effort estimate | `estimate effort to fix all HIGH and CRITICAL findings` |
| Export as MD | `generate the report in markdown format` |
| Export as PDF | `generate the report as PDF` |
| Export all formats | `generate reports in all formats` |

### EDS 🔲

| Action | Prompt |
|--------|--------|
| Scan | `scan my EDS site` |
| Deep audit | `deep audit this EDS project` |

### EDS + Commerce 🔲

| Action | Prompt |
|--------|--------|
| Scan | `scan my EDS Commerce project` |
| Full audit | `full audit my EDS+Commerce site` |

---

## 2. Code Generation Agent (`bmad-dept-code-generation-agent`)

### AEMaaCS ✅ (MCP-powered)

| Action | Prompt |
|--------|--------|
| Component | `create a new AEM component called Hero Banner` |
| Proxy component | `create proxy of CIF Core component - Product Recommendation` |
| Sling Model | `generate a Sling Model for the Article component` |
| HTL template | `scaffold HTL template for the Card component` |
| OSGi service | `create an OSGi service for email notification` |
| OSGi config | `generate OSGi configuration for the SMTP service` |
| Content Fragment Model | `generate CF model for articles with title, body, author, date` |
| Experience Fragment | `create Experience Fragment template for global header` |
| Editable Template | `create an editable template for landing pages` |
| Dispatcher config | `generate Dispatcher config for my AEMaaCS project` |
| Cloud Manager pipeline | `create Cloud Manager pipeline configuration` |
| Unit tests | `generate unit tests for my Sling Model` |
| Workflow | `create an AEM workflow for content approval` |
| Servlet | `generate a Sling Servlet that returns JSON for product data` |
| Scheduler | `create a scheduled task that runs daily to clean temp nodes` |
| Deploy local | `create proxy of Teaser and deploy it on local` |
| Deploy cloud | `generate Hero Banner and deploy to cloud dev` |
| Scaffold only | `just scaffold the component, don't deploy` |

### AEM AMS ✅ (LLM skills, no MCP)

| Action | Prompt |
|--------|--------|
| Component | `create an AEM component for our AMS project` |
| Sling Model | `generate a Sling Model for the Navigation component` |
| OSGi service | `create an OSGi service for cache invalidation` |
| Dispatcher config | `generate Dispatcher config for AMS` |
| Unit tests | `generate unit tests for the SearchService` |
| Deploy local | `build and deploy to local AEM instance` |
| Deploy AMS | `deploy to AMS dev environment` |

### Adobe Commerce ✅

| Action | Prompt |
|--------|--------|
| Module scaffold | `create a new Commerce module Acme_CustomShipping` |
| Plugin | `create an after plugin on Magento\Catalog\Model\Product::getName` |
| Observer | `create an observer for checkout_submit_all_after event` |
| REST API | `create a REST API endpoint for custom entity CRUD` |
| GraphQL | `add a GraphQL resolver for querying custom entity by ID` |
| Admin grid | `generate admin UI grid listing for my custom entity` |
| Admin form | `create admin edit form for the custom entity` |
| Storefront block | `create a frontend block with ViewModel for product badges` |
| CLI command | `generate a console command to sync inventory` |
| Cron job | `create a cron job that runs every 15 minutes to clean expired quotes` |
| Message queue | `scaffold a message queue consumer for order export` |
| DB schema | `create db_schema.xml for a custom entity table` |
| EAV attribute | `add a custom product attribute 'delivery_estimate'` |
| Repository | `generate full CRUD repository for my custom entity` |
| Config | `add admin system configuration for API credentials` |
| Unit tests | `generate unit tests for the OrderExportService` |
| Deploy | `enable the module and run setup:upgrade` |

### EDS 🔲

_Not yet supported by code generation agent._

### EDS + Commerce 🔲

_Not yet supported by code generation agent._

---

## 3. Impact Analysis Agent (`bmad-dept-code-impact-analysis-agent`)

### All Platforms 🔲 (Workflow TODO — activation defined)

| Action | Prompt |
|--------|--------|
| Change impact | `what's the impact if I change this class?` |
| Blast radius | `evaluate blast radius of modifying the Checkout module` |
| Upgrade risk | `assess risk for upgrading from 2.4.6 to 2.4.7` |
| Dependency trace | `trace all dependencies of the Payment module` |
| Breaking changes | `check what breaks if I remove this interface` |
| Patch risk | `what's the risk of applying this patch?` |

---

## 4. Scan Agent (`bmad-dept-code-scan-agent`)

### All Platforms 🔲 (Workflow TODO — activation defined)

| Action | Prompt |
|--------|--------|
| Quick scan | `scan my project code` |
| Static analysis | `run static analysis on this codebase` |
| Find violations | `find code violations` |
| Quality check | `check code quality quickly` |

---

## 5. Test Coverage Agent (`bmad-dept-code-test-coverage-agent`)

### All Platforms 🔲 (Scaffolded — engines TODO)

**Coverage Analysis (Tier 1):**

| Action | Prompt |
|--------|--------|
| Analyze coverage | `analyze test coverage` |
| Show gaps | `show untested code` |
| Module scope | `analyze test coverage for the Checkout module` |
| File scope | `what's the test coverage for src/Model/OrderProcessor.php` |
| Test plan | `create test plan` |
| Priority gaps | `show highest-priority untested code` |

**Test Generation (Tier 2):**

| Action | Prompt |
|--------|--------|
| Generate for module | `generate tests for the Checkout module` |
| Generate for file | `generate unit tests for src/Model/OrderProcessor.php` |
| Generate integration | `generate integration tests for the Payment API` |
| Generate for class | `create unit tests for the CartService class` |
| Specific framework | `generate PHPUnit tests for the OrderExport service` |
| Specific framework | `generate JUnit tests for the ArticleModel` |
| Specific framework | `generate Jest tests for the hero block` |

**Full (Tier 1 + Tier 2):**

| Action | Prompt |
|--------|--------|
| Full coverage | `full test coverage` |
| Full for module | `full test coverage for the Payment module` |
| Targeted fill | `find and fill test gaps in the Catalog module` |

**Post-analysis:**

| Action | Prompt |
|--------|--------|
| Coverage report | `show test coverage report` |
| Export gaps | `export coverage gaps as JSON` |
| Progress | `how much test coverage did we gain?` |

---

## CLI-Backed Prompts (Commerce Engine)

These prompts trigger the TypeScript scanner under the hood. The agent auto-resolves project path, engine, and flags — **you never need to type CLI commands**.

### Basic Scans

| Prompt | What It Does |
|--------|-------------|
| `scan my project` | Auto-detect platform, run full code audit |
| `scan my project and name it "Acme"` | Audit with named report title |
| `scan only the Checkout and Payment modules` | Filtered audit (specific modules only) |
| `scan only the Custom namespace` | Filtered audit (specific namespace) |

### With Data Inputs

| Prompt | What It Does |
|--------|-------------|
| `scan my project with DB dump at /path/to/dump.sql` | Code + database schema analysis |
| `scan with BRD impact analysis using /path/to/requirements.docx` | Code + BRD requirement mapping |
| `scan with bug report from /path/to/bugs.xlsx` | Code + bug cascade/severity analysis |
| `run full scanner with DB at /db.sql, BRD at /brd.docx, bugs at /bugs.xlsx` | All analysis layers combined |

### Targeted / Partial

| Prompt | What It Does |
|--------|-------------|
| `just run BRD analysis from /spec.docx, skip the code scan` | BRD-only (no code audit) |
| `analyze patch upgrade impact from 2.4.7-p7 to 2.4.7-p9` | Patch breaking-change analysis |
| `export scan results as JSON` | Machine-readable output (for CI pipelines) |

### Compound (multiple inputs in one prompt)

| Prompt | What It Does |
|--------|-------------|
| `full audit named "Client X" with DB at /db.sql and BRD at /spec.docx` | Named audit + DB + BRD |
| `scan Checkout module, include bugs from /bugs.xlsx, output JSON` | Module filter + bugs + JSON |
| `audit Payment namespace with database from /prod.sql` | Namespace filter + DB |

### When Agent Asks for Clarification

| If you say... | Agent will ask... |
|---------------|-------------------|
| "scan with database" (no path) | "Path to your DB dump file (.sql)?" |
| "run BRD analysis" (no path) | "Path to your BRD document?" |
| "scan with bugs" (no path) | "Path to your bug report (.xlsx)?" |
| "audit this" (ambiguous mode) | "Which mode? Scanner / Deep Audit / Full?" |

### Utility

| Prompt | What It Does |
|--------|-------------|
| `what engines are available?` | Lists all registered audit engines |
| `show current audit config` | Displays active configuration |

---

## Platform × Agent Support Matrix

| Platform | Code Audit | Code Generation | Impact Analysis | Scan |
|----------|:----------:|:---------------:|:---------------:|:----:|
| **Adobe Commerce** | ✅ | ✅ (LLM) | 🔲 | 🔲 |
| **AEMaaCS** | 🔲 | ✅ (MCP) | 🔲 | 🔲 |
| **AEM AMS** | 🔲 | ✅ (LLM) | 🔲 | 🔲 |
| **EDS** | 🔲 | 🔲 | 🔲 | 🔲 |
| **EDS + Commerce** | 🔲 | 🔲 | 🔲 | 🔲 |
