# BMAD DEPT Code Agent

[![GitHub](https://img.shields.io/badge/GitHub-mayur434%2Fbmad--dept--code--agent-blue)](https://github.com/mayur434/bmad-dept-code-agent)

---

## The BMAD Framework

[BMAD Method](https://github.com/bmadcode/bmad-method) is a modular AI-agent framework that lets you compose specialized skills into any AI coding tool (Claude Code, Cursor, VS Code Copilot, etc.). Modules are installed into your project with a single CLI command and extend your agent with domain-specific knowledge, scripts, and workflows — no custom infrastructure needed.

This repository is a **custom BMAD module** (`dca`) that plugs directly into the framework.

---

## What We Built

A multi-agent AI suite purpose-built for **Adobe platform** projects — Commerce, AEMaaCS, EDS, and EDS+Commerce.

### Coverage Matrix

| Agent | Commerce | AEMaaCS | EDS | EDS+Commerce |
|-------|:--------:|:-------:|:---:|:------------:|
| **Audit** (Scanner + LLM) | ✅ | 🔲 | 🔲 | 🔲 |
| **Code Generation** (MCP + LLM) | ✅ | ✅ | 🔲 | 🔲 |
| **Test Coverage** (Scanner + LLM) | 🔲 | 🔲 | 🔲 | 🔲 |
| **Impact Analysis** (Scanner + LLM) | 🔲 | 🔲 | 🔲 | 🔲 |
| **Scan** (Scanner + LLM) | 🔲 | 🔲 | 🔲 | 🔲 |

> ✅ = Implemented &nbsp;&nbsp; 🔲 = Scaffolded, coming next

### What Each Agent Does

| Agent | Tier 1 (TypeScript Scanner) | Tier 2 (LLM Skills) |
|-------|----------------------------|---------------------|
| **Audit** | 42+ category static scan → Excel report | Architecture, data flow, business logic deep analysis |
| **Code Generation** | — | MCP-powered (AEMaaCS) + LLM skills (AMS/Commerce) code gen |
| **Test Coverage** | Coverage gap detection, priority scoring | Generates unit/integration/functional tests |
| **Impact Analysis** | Dependency tracing, blast radius mapping | Risk assessment, upgrade compatibility |
| **Scan** | Fast violation detection | Pattern matching, contextual analysis |

### Module Architecture

```mermaid
flowchart TD
    Install["npx bmad-method install"]
    Install -->|deploys into| Project[".claude/skills/"]

    Project --> Agents

    subgraph Agents ["DCA Agents (independent)"]
        direction LR
        Gen["⚡ Generation"]
        Scan["📡 Scan"]
        Audit["🔍 Audit"]
        TestCov["🧪 Test Coverage"]
        Impact["💥 Impact"]
    end

    Agents --> T1["Tier 1: TS Engine"]
    Agents --> T2["Tier 2: LLM Skills"]

    T1 --> Platforms

    subgraph Platforms ["Engines"]
        direction LR
        Commerce["commerce ✅"]
        AEM["aem 🔲"]
        EDS["eds 🔲"]
        EDSCom["eds-commerce 🔲"]
    end

    T1 --> Output
    T2 --> Output

    subgraph Output ["Output"]
        direction LR
        Reports["📊 Reports"]
        Code["📁 Code + Tests"]
        Findings["📋 Findings"]
    end
```

> Agents are **independent** — use any one on its own. Listed in SDLC order (generate → scan → audit → test → impact) but no dependencies between them. Each agent uses Tier 1 (TypeScript deterministic engine) + Tier 2 (LLM skills). Commerce is fully implemented; other platforms are scaffolded (🔲).

---

### Project Structure — In Detail

#### How BMAD Framework + DCA Module Connect

```
your-project/                          ← Your Adobe Commerce / AEM / EDS project
├── .claude/
│   └── skills/                        ← BMAD installs skills here
│       ├── bmad-dept-code-audit-agent/
│       ├── bmad-dept-code-generation-agent/
│       ├── bmad-dept-code-test-coverage-agent/
│       ├── bmad-dept-code-impact-analysis-agent/
│       └── bmad-dept-code-scan-agent/
├── .bmad/
│   └── mcp-registry.toml             ← MCP server config (Code Gen)
├── .mcp.json                          ← IDE MCP connections
├── .env                               ← Platform credentials (gitignored)
└── [your project files]
```

The BMAD installer (`npx bmad-method install`) reads our `module.yaml` + `marketplace.json` and deploys each agent skill into the target project's `.claude/skills/` folder.

#### DCA Module Source Layout

```
bmad-dept-code-agent/                  ← This repository (the custom module)
├── README.md                          ← You are here
├── MANUAL.md                          ← Operational guide
├── PROMPTS.md                         ← Full prompt reference
└── skills/
    ├── module.yaml                    ← Module manifest (agents list, config vars)
    ├── module-help.csv                ← Menu/capability registry
    │
    └── bmad-dept-code-<agent>/        ← Each agent follows this structure ↓
        ├── SKILL.md                   ← AI instructions (activation, workflow, modes)
        ├── GUIDE.md                   ← Human instructions (setup, examples)
        ├── customize.toml             ← Activation keywords, commands, scripts
        ├── assets/                    ← Module registry (module-help.csv, module.yaml)
        ├── resources/                 ← Knowledge base (rule packs, strategies)
        ├── templates/                 ← Output templates (report-json.md, report-markdown.md)
        └── scripts/                   ← TypeScript Tier 1 engine
            ├── run.ts                 ← CLI dispatcher (entry point)
            ├── package.json           ← Node.js dependencies
            ├── tsconfig.json          ← TypeScript config
            ├── shared/
            │   └── base.ts            ← Abstract base class / shared interfaces
            └── engines/
                ├── registry.ts        ← Platform auto-detection + engine resolution
                ├── commerce/          ← Adobe Commerce engine (✅ implemented in Audit)
                ├── aem/               ← AEMaaCS engine (🔲 placeholder)
                ├── eds/               ← EDS engine (🔲 placeholder)
                └── eds_commerce/      ← EDS+Commerce hybrid (🔲 placeholder)
```

#### File Roles Explained

| File | Who Reads It | Purpose |
|------|:------------:|---------|
| `SKILL.md` | AI Agent | Workflow instructions, activation triggers, operating modes |
| `GUIDE.md` | Human | Setup steps, usage examples, troubleshooting |
| `customize.toml` | BMAD Framework | Activation keywords, named commands, script paths |
| `assets/module.yaml` | BMAD Installer | Agent metadata for module registry |
| `assets/module-help.csv` | BMAD Help | Capabilities listing for `bmad-help` queries |
| `resources/` | AI Agent (Tier 2) | Rule packs, detection strategies, scoring models |
| `templates/` | Tier 1 Engine | Output format skeletons (JSON, Markdown) |
| `scripts/run.ts` | CLI / Agent | Entry point — arg parsing, engine dispatch |
| `scripts/shared/base.ts` | Engine devs | Abstract class that all platform engines extend |
| `scripts/engines/registry.ts` | Dispatcher | Maps platform IDs → detection logic → engine modules |

#### Commerce Engine (Reference Implementation)

The Audit agent's Commerce engine is the fully-implemented benchmark:

```
scripts/engines/commerce/
├── audit.ts              ← Entry point (CLI arg parsing, orchestration)
├── config.json           ← Project-specific overrides (paths, thresholds)
└── lib/
    ├── scanner/
    │   ├── index.ts      ← Main scanner class (42+ scan categories)
    │   ├── types.ts      ← Finding, FindingsMap, Thresholds interfaces
    │   ├── context.ts    ← File discovery (PHP, XML, PHTML via fast-glob)
    │   ├── scans-code.ts     ← Security, Performance, Deprecated, Caching
    │   ├── scans-arch.ts     ← DI, Plugins, Crons, GraphQL, Config
    │   ├── scans-infra.ts    ← Cloud, PHP deep, Observers, Metrics
    │   ├── scans-business.ts ← Business logic, MSI, Admin security
    │   ├── scans-quality.ts  ← Standards, Validation, Compat, XSD
    │   └── db-analysis.ts    ← SQL dump parsing, schema validation
    ├── brd_analyzer.ts   ← BRD requirement → code impact mapping
    ├── brd_parser.ts     ← .docx BRD document parser
    ├── bug_parser.ts     ← .xlsx bug report parser
    ├── impact.ts         ← Patch/upgrade breaking-change analysis
    ├── report.ts         ← Excel report generation (ExcelJS)
    ├── expert.ts         ← Expert-level finding enrichment
    └── styles.ts         ← Excel styling constants
```

#### Adding a New Platform Engine

1. Create `scripts/engines/<platform>/`
2. Extend the abstract base class from `shared/base.ts`
3. Register in `engines/registry.ts` with a `detect()` function
4. The dispatcher (`run.ts`) handles the rest — CLI parsing, engine resolution, output routing

---

## Install

### Prerequisites

- **Node.js** v20.12+
- A target project where you want the agents installed

### Fresh Install (from Git)

```bash
cd /path/to/your-project

npx bmad-method install \
  --directory . \
  --modules bmm,bmb \
  --custom-source https://github.com/mayur434/bmad-dept-code-agent.git \
  --tools claude-code \
  --yes
```

### Fresh Install (from local clone)

```bash
npx bmad-method install \
  --directory . \
  --modules bmm,bmb \
  --custom-source /path/to/bmad-dept-code-agent/skills \
  --tools claude-code \
  --yes
```

After install, dependencies are auto-installed on first use. To pre-install manually:

```bash
cd .claude/skills/bmad-dept-code-audit-agent/scripts && npm install
```

---

## Update

```bash
cd /path/to/your-project

# Quick update — preserves settings, syncs module files only
npx bmad-method install \
  --directory . \
  --action quick-update \
  --custom-source https://github.com/mayur434/bmad-dept-code-agent.git \
  --yes

# Full update — re-resolves everything, allows config changes
npx bmad-method install \
  --directory . \
  --action update \
  --custom-source https://github.com/mayur434/bmad-dept-code-agent.git \
  --yes
```

Then reinstall deps:

```bash
cd .claude/skills/bmad-dept-code-audit-agent/scripts && npm install
```

### Uninstall

```bash
npx bmad-method uninstall --directory .
```

### Useful Flags

| Flag | Purpose |
|------|---------|
| `--action quick-update` | Fast sync — preserves all config |
| `--action update` | Full update — can modify modules/config |
| `--custom-source <url\|path>` | Git URL or local `skills/` folder path |
| `--yes` | Non-interactive, accept defaults |
| `--channel next` | Use latest HEAD instead of stable tag |
| `--pin CODE=TAG` | Pin module to specific release tag |
| `--set module.key=value` | Override config non-interactively |

---

## Configuration

### Supported Engines

| Engine | Platform | Status |
|--------|----------|--------|
| `commerce` | Adobe Commerce / Magento 2 | ✅ Ready |
| `aem` | AEM as a Cloud Service | 🔲 Planned |
| `eds` | Edge Delivery Services | 🔲 Planned |
| `eds-commerce` | EDS + Commerce Hybrid | 🔲 Planned |

### Standalone Scanner (without BMAD)

Run the TypeScript scanner directly:

```bash
cd skills/bmad-dept-code-audit-agent/scripts && npm install

# Auto-detect platform
npx ts-node run.ts --path /path/to/your/project --name "Project Name"

# Explicit engine
npx ts-node run.ts --engine commerce --path /path/to/project

# List available engines
npx ts-node run.ts --list-engines
```

---

## Getting Started

See **[MANUAL.md](MANUAL.md)** for full operational details:

- Repository structure and key files
- How to create a new skill module from scratch
- Naming conventions and file contracts
- The SKILL.md / GUIDE.md / customize.toml relationship
- Pre-flight checklist before publishing

---

## Prompts

See **[PROMPTS.md](PROMPTS.md)** for the complete prompt reference organized by agent and platform.

Quick examples to get going:

```text
# Audit (Commerce)
audit my project
scan my project and name it "Client Name"
scan my project with DB dump at /path/to/dump.sql
deep audit my project
full audit my project

# Code Generation (AEMaaCS)
create a new AEM component called Hero Banner
generate a Sling Model for the Article component
create Cloud Manager pipeline configuration

# Code Generation (Commerce)
create a new Commerce module Acme_CustomShipping
create an after plugin on Magento\Catalog\Model\Product::getName
add a GraphQL resolver for querying custom entity by ID

# Test Coverage
analyze test coverage
generate tests for the Checkout module
full test coverage
create test plan
```

After an audit completes, follow up with:

```text
summarize the audit findings
show me all CRITICAL severity items
create a fix plan for the critical items
estimate effort to fix all HIGH and CRITICAL findings
```

---

## License

MIT
