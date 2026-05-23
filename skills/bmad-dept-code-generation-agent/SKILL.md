---
name: bmad-dept-code-generation-agent
description: "AI-driven code generation agent (part of BMAD DEPT Code Agent suite). Generates production-ready code for AEMaaCS (MCP), AEM AMS (LLM skills), and Adobe Commerce (Magento 2) following platform best practices, security standards, and scalable architecture."
---

# BMAD DEPT Code Agent — Generation Skill

## Purpose

AI-driven code generation agent that produces production-ready code by combining:
1. **Live instance context** via AEM MCP servers (AEMaaCS only — components, templates, content structure)
2. **LLM Skills** — Built-in generation patterns for AEM AMS and Adobe Commerce (no MCP required)
3. **Project-level conventions** detected from the codebase (naming, packages, patterns)
4. **Adobe best practices** from built-in resource packs
5. **Security-first** — OWASP Top 10, Magento security checklist, input validation, ACL enforcement

Generates all layers of an AEM project: Sling Models, HTL templates, OSGi services, Content Fragment Models, Experience Fragments, Editable Templates, Dispatcher configs, CI/CD pipelines, Workflows, Servlets, Schedulers, and unit tests.

Generates all layers of an Adobe Commerce project: Modules, Plugins, Observers, API endpoints, GraphQL resolvers, Admin UI components, Storefront blocks/widgets, Console commands, Cron jobs, Message queues, Setup scripts, and integration tests.

### Platform Support:
- **AEMaaCS** — Full MCP integration (remote + local), Cloud Manager, SDK validation
- **AEM AMS** — LLM skills-based generation, project scanning, Maven + CI/CD deploy, no MCP
- **Adobe Commerce** — LLM skills-based generation, module scaffolding, PHP best practices, Magento 2 architecture

## MCP Integration (Zero-Config, Pre-Configured)

This module ships with **pre-configured MCP** for both remote (Adobe Cloud) and local (AEM SDK) servers. Consumers do not configure MCP — the development team maintains the registry.

### Auto-Provisioning

On first activation, if `.mcp.json` does not contain AEM server entries, the agent **automatically** runs:
```bash
npx ts-node {skill_path}/scripts/run.ts --setup --path {project_root}
```

This creates (without user intervention):
- `.mcp.json` — all MCP server entries (Adobe remote + community local)
- `.bmad/mcp-registry.toml` — capability-to-server mapping
- `.env` — local SDK connection defaults (if not already present)

**The consumer does nothing.** The agent self-provisions on first use.

### Pre-Configured Servers

#### Remote — Adobe Official (Cloud Instances)

| Server | URL | Capabilities |
|--------|-----|-------------|
| AEM Content | `https://mcp.adobeaemcloud.com/adobe/mcp/content` | component-discovery, template-discovery, site-structure, content-crud, asset-operations |
| AEM Content (Read-Only) | `https://mcp.adobeaemcloud.com/adobe/mcp/content-readonly` | component-discovery, template-discovery, site-structure |
| AEM Cloud Manager | `https://mcp.adobeaemcloud.com/adobe/mcp/cloudmanager` | pipeline-management |
| AEM Experience Governance | `https://mcp.adobeaemcloud.com/adobe/mcp/experience-governance` | brand-governance |

**Auth:** OAuth via Adobe ID — sign in when your IDE prompts.

#### Local — Community (AEM SDK on localhost)

| Server | Package | Capabilities |
|--------|---------|-------------|
| AEM MCP Server | `aem-mcp-server` (npx) | component-discovery, template-discovery, site-structure, content-crud, content-validation |
| AEM Dev MCP Server | `aem-dev-mcp-server` (npx) | osgi-config, osgi-bundles, health-check, content-validation |

**Auth:** Basic auth via `.env` (`AEM_USER`/`AEM_PASSWORD`).

### Capability Resolution

The agent uses capabilities, not specific tool names (per Adobe's guidance: *"Do not hardcode tool names in prompts"*).

```
Resolution order:
1. .bmad/mcp-registry.toml → explicit capability mapping
2. priority field → lower number wins (Adobe = 1, Community = 2)
3. prefer_mode → "auto" (remote first, local fallback)
4. If no MCP available → fallback to source scanning
```

| Capability | Used for | Fallback (no MCP) |
|------------|----------|-------------------|
| `component-discovery` | Avoid naming conflicts, detect patterns | Scan `ui.apps/.../components/` |
| `template-discovery` | Understand page structure | Scan `ui.content/.../templates/` |
| `site-structure` | Content hierarchy, i18n | Scan `ui.content/.../content/` |
| `content-crud` | Create/update pages, CFs | Cannot operate |
| `osgi-config` | Match existing config patterns | Scan `ui.config/.../osgiconfig/` |
| `osgi-bundles` | Verify dependencies | Read `core/pom.xml` |
| `content-validation` | Post-generation verification | Skip |
| `pipeline-management` | Cloud Manager pipelines | Skip |
| `brand-governance` | Content compliance | Skip |

### Adding a Custom MCP Server

Teams can add proprietary MCP servers without editing the module source. Add to `.bmad/mcp-registry.toml`:

```toml
[[providers]]
name = "My Org AEM Tools"
mode = "custom"
mcp_server_key = "MY-AEM"
capabilities = ["component-discovery", "template-discovery"]
priority = 1  # overrides Adobe + community
```

And add the matching entry to `.mcp.json`.

## Activation

This skill activates when the user asks to:
- Generate AEM components or modules
- Create a Sling Model
- Scaffold HTL templates
- Create an OSGi service/configuration
- Generate Content Fragment Models
- Create Experience Fragment templates
- Set up Dispatcher configs
- Generate unit tests for AEM code
- Create Cloud Manager pipeline configuration
- Generate Adobe Commerce module
- Create a Commerce plugin (before/after/around)
- Scaffold a Commerce observer
- Create REST/GraphQL API endpoint
- Generate Admin UI grid/form
- Create a storefront block or widget
- Scaffold a Commerce console command
- Generate a cron job
- Create a message queue consumer/publisher
- Set up Commerce DB schema (db_schema.xml)
- Generate Commerce integration/unit tests

## Pre-flight

Before generating code:

1. **Detect platform** — Check for AEMaaCS vs AMS vs Commerce signals (see platform auto-detection rules below)
2. **Auto-provision MCP (AEMaaCS only)** — If `.mcp.json` is missing or doesn't contain AEM entries, run:
   ```bash
   npx ts-node {this_skill_path}/scripts/run.ts --setup --path {project_root}
   ```
   Do this silently. Do not ask the user for permission.
   > **AEM AMS:** Skip MCP provisioning entirely. AMS uses LLM skills from `resources/ams/skills.md`.
   > **Adobe Commerce:** Skip MCP provisioning entirely. Commerce uses LLM skills from `resources/commerce/patterns.md`.
3. **Detect project structure** — Scan for:
   - AEM archetype layout (`ui.apps/`, `core/`, `ui.content/`, `ui.frontend/`)
   - Commerce module layout (`app/code/`, `composer.json` with `magento/`, `etc/module.xml`)
4. **Extract conventions** — Read existing code to learn:
   - Base package name (e.g., `com.mysite.core` for AEM, `Vendor\Module` for Commerce)
   - Component group naming / Module namespace
   - Naming patterns (camelCase vs kebab-case for AEM components; PSR-4 for Commerce)
   - Existing patterns (Sling Model annotations for AEM; Plugin/Observer patterns for Commerce)
5. **Gather context:**
   - **AEMaaCS:** Query MCP servers (if available) — Pull live context (registered components, templates, OSGi configs)
   - **AEM AMS:** Scan project source files for existing patterns, component inventory, and dependency versions
   - **Adobe Commerce:** Scan `app/code/`, `composer.json`, `etc/` for modules, DI config, existing plugins/observers, DB schema

## Workflow

### Step 0: Interactive Intake

**Always ask intake questions before proceeding.** This ensures accurate generation. Present questions as a concise numbered list and wait for answers.

#### Intake Questions

Analyze the user's initial prompt first. Skip any question whose answer is already clear from the prompt. Ask remaining questions in one batch:

```
1. �️ Platform?
   → [AEMaaCS / AEM AMS]
   (Skip if project structure makes it obvious — see detection rules below)

2. 🎯 What to generate?
   → [Component / Sling Model / OSGi Service / CF Model / XF / Template / Dispatcher / Pipeline / Test]
   (Skip if obvious from prompt)

3. 📦 Component details?
   → Name, and if proxying/extending an existing component — which one?
   (Skip if user already specified)

4. 🌐 Target environment?
   → AEMaaCS: [Local SDK / Cloud Dev / Cloud Stage / Cloud Prod]
   → AEM AMS: [Local / Dev / Stage / Prod]
   (Skip if user said "local", "deploy to dev", etc.)

5. 🚀 Deploy after generation?
   → [Yes – build & deploy / No – generate code only]
   (Skip if user explicitly said "deploy" or "just create")

6. ✅ Validate on instance after deploy?
   → [Yes – verify on instance / No – skip validation]
   (Only ask if deploy = yes)
```

#### Platform auto-detection rules:

| Signal in project | Platform |
|-------------------|----------|
| `ui.config/` exists | AEMaaCS |
| `.cloudmanager/` or `dispatcher/src/` (SDK structure) | AEMaaCS |
| `config.author/`, `config.publish/`, `config.dev/` runmode folders under `/apps` | AEM AMS |
| `dispatcher/src/conf/httpd.conf` (classic Apache) | AEM AMS |
| Replication agent configs present | AEM AMS |
| `composer.json` with `magento/` packages | Adobe Commerce |
| `app/code/` directory exists | Adobe Commerce |
| `etc/module.xml` or `registration.php` in module | Adobe Commerce |
| `bin/magento` exists at project root | Adobe Commerce |
| Cannot determine | **Ask Q1** |

#### Smart skipping rules:

| If user said... | Skip questions | Auto-fill |
|----------------|---------------|-----------|
| "create proxy of X" | Q2, Q3 (partial) | type=component, extends=X |
| "deploy on local" | Q4 | env=local |
| "generate CF model for articles" | Q2, Q3 | type=cf-model, name=articles |
| "just scaffold, don't deploy" | Q5, Q6 | deploy=no |
| Project has `ui.config/` | Q1 | platform=aemcs |

#### Example interaction:

> **User:** "Create proxy of CIF Core component - Product Recommendation, and deploy it on local"
>
> **Agent asks only what's missing:**
> ```
> Got it — proxying CIF Product Recommendation component, deploying to local SDK.
>
> A few questions:
> 1. Component name for your proxy? (e.g., `product-recommendation-custom`)
> 2. Any dialog customizations needed beyond the base CIF component?
> 3. Validate on local instance after deploy? [Yes/No]
> ```

### Step 1: Resolve MCP Mode

Based on intake answers, select the MCP mode. **Do not ask again — this is derived from Step 0.**

#### AEMaaCS:

| Intake answer (Q4) | MCP Mode | Providers used |
|--------------------|----------|----------------|
| Local SDK | `local` | AEM-Local, AEM-Local-Dev |
| Cloud Dev/Stage/Prod | `remote` | AEM-Content, AEM-CloudManager |
| Not answered (skipped) | `local` | Default for development |

#### AEM AMS:

| Intake answer (Q4) | Mode | Intelligence source |
|--------------------|------|---------------------|
| Any (Local/Dev/Stage/Prod) | `llm-skills` | `resources/ams/skills.md` + project scanning |

> **IMPORTANT:** AEM AMS does NOT use MCP. No remote Adobe MCP, no community MCP.
> All generation intelligence comes from built-in LLM skills (`resources/ams/skills.md`) and static project scanning.
> Custom MCP via Scripts Engine will be available in a future release.

#### How this affects behavior:

- **AEMaaCS + `local`** → Use `AEM-Local` / `AEM-Local-Dev`. Validate against localhost SDK.
- **AEMaaCS + `remote`** → Use `AEM-Content` / `AEM-CloudManager`. Validate against cloud.
- **AEM AMS** → Use LLM skills only. Scan project source. Validate via Maven build + post-deploy curl commands. No live MCP queries.

### Step 2: Gather Project Context

```
Project Structure Detection:
├── core/                    → Java source (Sling Models, OSGi Services)
│   └── src/main/java/{base.package}/
├── ui.apps/                 → Component definitions (.content.xml, HTL, clientlibs)
│   └── src/main/content/jcr_root/apps/{project}/components/
├── ui.content/              → Content (templates, policies, pages)
│   └── src/main/content/jcr_root/conf/{project}/
├── ui.frontend/             → Frontend build (CSS/JS)
├── dispatcher/              → Dispatcher configs
│   └── src/conf.d/ & src/conf.dispatcher.d/
└── ui.tests/                → Integration tests
```

### Step 3: Gather Instance Context

**AEMaaCS (via MCP):**

Use the resolved MCP mode from Step 1. Query using **capabilities**, not hardcoded tool names:

| Capability | Purpose |
|------------|---------|
| `component-discovery` | List existing components to avoid naming conflicts |
| `template-discovery` | Understand available page templates |
| `osgi-config` | See existing OSGi config patterns |
| `site-structure` | Understand content hierarchy |

If MCP is unavailable for a capability, use the fallback (scan source files).

**AEM AMS (via project scanning):**

No MCP available. Scan project source to gather equivalent context:

| What to scan | Where to look | Purpose |
|-------------|---------------|---------|
| Existing components | `ui.apps/.../apps/{project}/components/` | Avoid naming conflicts |
| Templates | `ui.content/.../conf/{project}/settings/wcm/templates/` | Understand page structure |
| OSGi configs | `ui.apps/.../apps/{project}/config*/` | Match existing patterns |
| Content structure | `ui.content/.../content/{project}/` | Understand hierarchy |
| Dependencies | `core/pom.xml`, `all/pom.xml` | AEM version, uber-jar version |
| Runmodes used | `config.*` folder names | Know available environments |

### Step 4: Generate Code

Produce all files for the requested artifact:
- **AEMaaCS:** Follow patterns in `resources/aemcs/patterns.md`
- **AEM AMS:** Follow patterns in `resources/ams/skills.md` (comprehensive LLM skills reference)

### Step 5: Generate Unit Tests

For every Sling Model or OSGi service generated, also produce:
- JUnit 5 test class using AEM Mocks (`io.wcm.testing.mock.aem`)
- Mock resource setup matching the component's `.content.xml`
- Assertions for all exposed methods

### Step 6: Deploy (if requested in intake)

If the user answered "Yes" to deploy in Step 0:

**AEMaaCS:**
- **Local SDK:** `mvn clean install -PautoInstallSinglePackage`
- **Cloud:** Provide Cloud Manager deployment guidance or trigger via MCP

**AEM AMS:**
- **Local/Dev:** `mvn clean install -PautoInstallSinglePackage -Daem.host={ams-host} -Daem.port=443 -Dsling.scheme=https`
- **Stage/Prod:** Provide CI/CD deployment guidance (Jenkins/GitLab pipeline)

### Step 7: Validate (if requested in intake)

If the user answered "Yes" to validation:

**AEMaaCS (via MCP):**
- Use `osgi-bundles` capability → verify bundle is Active
- Use `component-discovery` capability → verify component appears in registry
- Use `content-validation` capability → verify content structures

**AEM AMS (via curl commands):**
- Provide bundle verification command (`/system/console/bundles.json`)
- Provide component check command (`/system/console/components.json`)
- Provide OSGi config verification command
- See `resources/ams/skills.md` → Validation Strategy section

Report results to user.

---

## Generation Scopes

### Platform-Specific Differences

| Scope | AEMaaCS | AEM AMS |
|-------|---------|---------|
| OSGi Config location | `ui.config/.../osgiconfig/config/` | `/apps/{project}/config.{runmode}/` |
| Dispatcher structure | SDK (immutable, `${DOCROOT}`) | Classic (httpd.conf, dispatcher.any) |
| Pipeline/Deploy | Cloud Manager YAML | Jenkins/GitLab CI + Maven profiles |
| Java annotations | `javax.*` (moving to `jakarta.*`) | `javax.*` only |
| Replication | Sling Distribution (auto) | Replication agents (manual) |
| Resource patterns file | `resources/aemcs/patterns.md` | `resources/ams/skills.md` |

**Select the correct resource patterns based on platform detected in Step 0.**

### 1. Sling Models (Java)

**Output location:** `core/src/main/java/{base.package}/models/`

Generate with:
- `@Model` annotation with correct `adaptables`, `adapters`, `defaultInjectionStrategy`
- `@ValueMapValue`, `@ChildResource`, `@Self`, `@OSGiService` injectors
- Getter methods (not public fields)
- `@PostConstruct` for initialization logic
- Interface-based pattern when project uses it

### 2. HTL/Sightly Templates

**Output location:** `ui.apps/src/main/content/jcr_root/apps/{project}/components/{component}/`

Generate:
- `{component}.html` — Main HTL template
- `_cq_dialog/.content.xml` — Touch UI dialog
- `_cq_editConfig/.content.xml` — Edit configuration (when needed)
- `.content.xml` — Component node definition (jcr:title, componentGroup, sling:resourceSuperType)

### 3. OSGi Services/Components (Java)

**Output location:** `core/src/main/java/{base.package}/services/`

Generate:
- Service interface + implementation (separate files)
- `@Component` with appropriate `service`, `immediate`, `configurationPolicy`
- `@Designate` with `@ObjectClassDefinition` for configurable services
- OSGi config file:
  - **AEMaaCS:** `ui.config/src/main/content/jcr_root/apps/{project}/osgiconfig/config/`
  - **AEM AMS:** `ui.apps/src/main/content/jcr_root/apps/{project}/config/` (with runmode variants)

### 4. Content Fragment Models

**Output location:** `ui.content/src/main/content/jcr_root/conf/{project}/settings/dam/cfm/models/`

Generate:
- Model definition (`.content.xml` with field definitions)
- Field types: text, multi-line, number, boolean, date, enumeration, content-reference, fragment-reference, JSON

### 5. Experience Fragments

**Output location:** `ui.content/src/main/content/jcr_root/content/experience-fragments/{project}/`

Generate:
- XF folder structure
- Variation templates (web, email, social)
- Associated editable template policies

### 6. Editable Templates

**Output location:** `ui.content/src/main/content/jcr_root/conf/{project}/settings/wcm/templates/`

Generate:
- Template definition (structure, initial, policies)
- Allowed components policy
- Layout container configuration
- Template type reference

### 7. Dispatcher Configs

**Output location:** `dispatcher/src/`

Generate based on platform:

**AEMaaCS (SDK structure):**
- `conf.d/rewrites/` — Rewrite rules
- `conf.d/variables/` — Custom variables
- `conf.dispatcher.d/filters/` — Request filters
- `conf.dispatcher.d/cache/` — Cache rules
- Uses `${DOCROOT}`, `enableTTL`, immutable patterns

**AEM AMS (Classic structure):**
- `conf/httpd.conf` — Apache config with VirtualHosts
- `conf.dispatcher.d/dispatcher.any` — Dispatcher farm config
- `conf.dispatcher.d/filters/` — Filter rules
- `conf.dispatcher.d/cache/` — Cache rules with explicit docroot
- Uses absolute paths, `mod_expires`, classic farm syntax

### 8. Cloud Manager Pipeline Configs (AEMaaCS ONLY)

**Output location:** Project root or `.cloudmanager/`

Generate:
- Pipeline YAML configuration
- Environment variables template
- Build step customization

> **AEM AMS:** This scope is not available. For AMS CI/CD, use Scope 10 (CI/CD Pipelines) instead.

### 9. Unit Tests (JUnit/AEM Mocks)

**Output location:** `core/src/test/java/{base.package}/models/` (or `/services/`)

Generate:
- JUnit 5 test class
- `@ExtendWith(AemContextExtension.class)` setup
- `AemContext` with resource type registration
- Mock content tree (JSON or inline)
- Test methods for each public method on the model/service

### 10. CI/CD Pipelines (AEM AMS ONLY)

**Output location:** Project root (`Jenkinsfile`, `.gitlab-ci.yml`)

Generate based on user's CI/CD platform:
- **Jenkins:** `Jenkinsfile` with build/test/deploy stages, environment parameters, Maven deploy commands
- **GitLab CI:** `.gitlab-ci.yml` with build/test/deploy-dev/deploy-stage/deploy-prod stages
- **Azure DevOps:** `azure-pipelines.yml` with equivalent stages
- All include: bundle verification, dispatcher flush, post-deploy health check

> See `resources/ams/skills.md` → Skill 12 for templates.

### 11. Replication Agents (AEM AMS ONLY)

**Output location:** Content package or OSGi config

Generate:
- Forward replication agent (author → publish)
- Reverse replication agent (publish → author)
- Dispatcher flush agent
- All with environment-specific transport URIs

> See `resources/ams/skills.md` → Skill 5 for templates.

### 12. Workflows (AEM AMS ONLY)

**Output location:** `core/src/main/java/{base.package}/workflows/`

Generate:
- Custom workflow process step (Java)
- Workflow launcher configuration
- Workflow model (if applicable)

> See `resources/ams/skills.md` → Skill 6 for templates.

### 13. Servlets & Filters

**Output location:** `core/src/main/java/{base.package}/servlets/` or `.../filters/`

Generate:
- Sling Servlet (by resource type or by path)
- Sling Filter (with scope and path pattern)

> See `resources/ams/skills.md` → Skill 7 for templates.

### 14. Schedulers & Event Handlers

**Output location:** `core/src/main/java/{base.package}/schedulers/` or `.../listeners/`

Generate:
- Sling Scheduler (cron-based, configurable)
- Sling Event Handler (resource/page change listeners)

> See `resources/ams/skills.md` → Skill 8 for templates.

---

## Adobe Commerce Workflow

When platform is detected as Adobe Commerce, follow this workflow instead of the AEM workflow above.

### Step 1: Resolve Generation Mode

Adobe Commerce does NOT use MCP. All intelligence comes from:
- **LLM Skills** → `resources/commerce/patterns.md` (generation patterns + templates)
- **Security Rules** → `resources/commerce/security.md` (mandatory compliance)
- **Project Scanning** → Static analysis of `app/code/`, `composer.json`, `etc/`

### Step 2: Gather Commerce Project Context

Scan the project to detect:

| What to scan | Where to look | Purpose |
|-------------|---------------|---------|
| Existing modules | `app/code/{Vendor}/` | Detect vendor namespace, existing modules |
| DI configuration | `etc/di.xml`, `etc/*/di.xml` | Existing plugins, preferences, types |
| Events | `etc/events.xml`, `etc/*/events.xml` | Existing observer subscriptions |
| DB schema | `etc/db_schema.xml` | Existing tables, avoid conflicts |
| Web APIs | `etc/webapi.xml` | Existing endpoints, URL patterns |
| ACL | `etc/acl.xml` | Existing access control resources |
| Composer deps | `composer.json` | PHP version, Magento version, dependencies |
| Admin routes | `etc/adminhtml/routes.xml` | Existing admin routes |
| Frontend routes | `etc/frontend/routes.xml` | Existing storefront routes |
| System config | `etc/adminhtml/system.xml` | Existing configuration sections |

### Step 3: Interactive Intake (Commerce)

Ask only what's missing from the user's prompt:

```
1. What to generate?
   → [Module / Plugin / Observer / API / GraphQL / Admin Grid / Admin Form / Block / CLI Command / Cron / Queue / DB Schema / Tests / EAV Attribute / Config]
   (Skip if obvious from prompt)

2. Module namespace?
   → {Vendor}\{Module} (e.g., Acme\CustomShipping)
   (Auto-detect from existing app/code/ if possible)

3. Target entity/class?
   → For plugins: which class/method to intercept
   → For observers: which event to listen to
   → For APIs: endpoint path + HTTP method
   (Skip if specified in prompt)

4. Scope (area)?
   → [global / frontend / adminhtml / webapi_rest / webapi_soap / crontab]
   (Default: global unless context suggests otherwise)

5. Deploy after generation?
   → [Yes – run setup:upgrade + di:compile / No – generate code only]
```

### Step 4: Generate Code

Follow the patterns in `resources/commerce/patterns.md` for the requested scope.
Apply all rules from `resources/commerce/security.md`.

**Every generated file MUST:**
- Use `declare(strict_types=1)` at the top
- Follow PSR-12 coding standards
- Use constructor dependency injection (never ObjectManager)
- Include proper PHP type declarations (param types, return types)
- Pass `vendor/bin/phpcs --standard=Magento2` without errors

### Step 5: Generate Tests

For every service class, repository, or complex logic generated:
- Unit test in `Test/Unit/` with mocked dependencies
- Integration test skeleton in `Test/Integration/` (if requested)

Follow test patterns in `resources/commerce/patterns.md` → Skill 17.

### Step 6: Deploy (if requested)

```bash
bin/magento module:enable {Vendor}_{Module}
bin/magento setup:upgrade
bin/magento setup:di:compile
bin/magento cache:flush
```

### Step 7: Validate

| Check | Command |
|-------|---------|
| Module status | `bin/magento module:status {Vendor}_{Module}` |
| DI compilation | `bin/magento setup:di:compile` (exit 0) |
| DB schema | `bin/magento setup:db:status` |
| Coding standards | `vendor/bin/phpcs --standard=Magento2 app/code/{Vendor}/{Module}` |
| Unit tests | `vendor/bin/phpunit app/code/{Vendor}/{Module}/Test/Unit` |

---

## Commerce Generation Scopes

All Commerce scopes reference `resources/commerce/patterns.md` for detailed templates and rules.

### C1. Module Scaffolding
Generate: `registration.php`, `etc/module.xml`, `composer.json`
→ See patterns.md → Skill 1

### C2. Plugin (Interceptor)
Generate: Plugin class + `di.xml` registration
→ See patterns.md → Skill 2

### C3. Observer
Generate: Observer class + `events.xml` subscription
→ See patterns.md → Skill 3

### C4. REST/SOAP API
Generate: Service interface + implementation + `webapi.xml` + `acl.xml`
→ See patterns.md → Skill 4

### C5. GraphQL Resolver
Generate: `schema.graphqls` + resolver class + data provider
→ See patterns.md → Skill 5

### C6. Admin UI Grid
Generate: UI component listing XML + data provider + controller + layout + menu + ACL
→ See patterns.md → Skill 6

### C7. Admin UI Form
Generate: UI component form XML + edit/save/delete controllers + data provider
→ See patterns.md → Skill 7

### C8. Storefront Block + Template
Generate: Block (thin) + ViewModel + .phtml template + layout XML
→ See patterns.md → Skill 8

### C9. Console Command (CLI)
Generate: Command class + `di.xml` registration
→ See patterns.md → Skill 9

### C10. Cron Job
Generate: Cron class (with locking) + `crontab.xml`
→ See patterns.md → Skill 10

### C11. Message Queue
Generate: Consumer + publisher + `communication.xml` + topology + consumer/publisher XML
→ See patterns.md → Skill 11

### C12. Declarative DB Schema
Generate: `db_schema.xml` + whitelist JSON
→ See patterns.md → Skill 12

### C13. Data Patch
Generate: Data patch class in `Setup/Patch/Data/`
→ See patterns.md → Skill 13

### C14. System Configuration
Generate: `system.xml` + `config.xml` + Config helper class + ACL
→ See patterns.md → Skill 14

### C15. Repository Pattern (CRUD)
Generate: Interface + model + resource model + collection + repository + DI preferences
→ See patterns.md → Skill 15

### C16. Frontend JavaScript
Generate: RequireJS module + `requirejs-config.js` + KO template (if needed)
→ See patterns.md → Skill 16

### C17. Unit & Integration Tests
Generate: PHPUnit tests + fixtures
→ See patterns.md → Skill 17

### C18. EAV Attribute
Generate: Data patch creating product/customer/category EAV attribute
→ See patterns.md → Skill 18

---

## Error Handling

- **AEMaaCS:** If MCP servers are not configured → proceed with project-level context only (no live instance data)
- **AEM AMS:** No MCP expected — always uses LLM skills + project scanning
- **Adobe Commerce:** No MCP expected — always uses LLM skills (`resources/commerce/patterns.md`) + project scanning
- If project structure is non-standard → ask user to confirm paths
- If naming conflict detected (via MCP or source scan) → warn and suggest alternative name
- If base package can't be detected → ask user

## Configuration

The skill reads from environment (`.env`):

| Variable | Purpose | Default |
|----------|---------|---------|
| `AEM_HOST` | AEM instance URL | `http://localhost:4502` |
| `AEM_USER` | AEM username | `admin` |
| `AEM_PASSWORD` | AEM password | `admin` |
| `AEM_INSTANCES_CONFIG` | Path to aem-instances.yaml | `~/aem-instances.yaml` |
