# BMAD DEPT Code Agent

[![GitHub](https://img.shields.io/badge/GitHub-mayur434%2Fbmad--dept--code--agent-blue)](https://github.com/mayur434/bmad-dept-code-agent)

---

## The BMAD Framework

[BMAD Method](https://github.com/bmadcode/bmad-method) is a modular AI-agent framework that lets you compose specialized skills into any AI coding tool (Claude Code, Cursor, VS Code Copilot, etc.). Modules are installed into your project with a single CLI command and extend your agent with domain-specific knowledge, scripts, and workflows — no custom infrastructure needed.

This repository is a **custom BMAD module** (`dca`) that plugs directly into the framework.

---

## What We Built

A multi-agent AI suite purpose-built for **Adobe platform** projects:

| Agent | Purpose | Status |
|-------|---------|--------|
| **Audit** | Two-tier code auditor — deterministic scanner + LLM deep analysis | ✅ Commerce, 🔲 AEM/EDS |
| **Generation** | Produces production-ready code from natural language prompts | ✅ AEMaaCS (MCP), ✅ AEM AMS, ✅ Commerce |
| **Impact Analysis** | Evaluates blast radius of changes, upgrades, and patches | 🔲 Planned |
| **Scan** | Fast static analysis with structured output | 🔲 Planned |

### Audit — Two Tiers

| Tier | Method | Output | Speed |
|------|--------|--------|-------|
| **Tier 1** | Deterministic TypeScript/Node.js scanner | Excel report (42+ categories) | Seconds |
| **Tier 2** | LLM semantic analysis (rule packs + detection strategy) | Markdown/JSON narrative report | Minutes |

**Tier 1** covers security, performance, deprecated APIs, Magento coding standards, DI violations, plugin conflicts, observer issues, database schema integrity, BRD impact mapping, bug cascade analysis, and patch/upgrade breaking changes.

**Tier 2** catches what scripts cannot — architectural anti-patterns, cross-file data flow issues, business logic bugs, contextual N+1 queries, and config consistency problems.

### Generation

- **AEMaaCS** — Full MCP integration (remote Adobe Cloud + local SDK). Zero-config auto-provisioning.
- **AEM AMS** — LLM skills-based generation, Maven + CI/CD deploy pipelines.
- **Adobe Commerce** — Module scaffolding, plugins, observers, GraphQL, admin UI, cron, message queues, and more.

### Module Architecture

```mermaid
graph TB
    subgraph BMAD["BMAD Framework"]
        CLI["npx bmad-method install"]
        Core["Core Module (bmm)"]
    end

    subgraph DCA["Custom Module: bmad-dept-code-agent (dca)"]
        direction TB
        Manifest["module.yaml + marketplace.json"]

        subgraph Agents["Agent Skills"]
            direction LR
            Audit["Audit Agent"]
            Gen["Generation Agent"]
            Impact["Impact Analysis Agent"]
            Scan["Scan Agent"]
        end

        subgraph AuditInternals["Audit Engine (TypeScript)"]
            direction TB
            Scanner["Tier 1: Static Scanner"]
            LLM["Tier 2: LLM Analysis"]
            Scanner -->|feeds findings| LLM
        end

        subgraph GenInternals["Generation Engine"]
            direction TB
            MCP["MCP Servers (AEMaaCS)"]
            Skills["LLM Skills (AMS / Commerce)"]
        end
    end

    subgraph Target["Your Project"]
        Claude[".claude/skills/"]
        Report["Audit Reports (Excel / Markdown)"]
        Code["Generated Code"]
    end

    CLI -->|installs| DCA
    Core -->|required by| DCA
    Manifest -->|registers| Agents
    Audit --> AuditInternals
    Gen --> GenInternals
    DCA -->|deployed into| Claude
    Scanner --> Report
    LLM --> Report
    MCP --> Code
    Skills --> Code
```

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

### Architecture

```
Tier 1 (TypeScript/Node.js)        Tier 2 (LLM Skill)
┌────────────────────────┐        ┌──────────────────────────┐
│  Deterministic         │        │  Semantic Analysis       │
│  Static Analysis       │        │  (Rule Packs + AI)       │
│                        │        │                          │
│  • 42+ categories      │───────▶│  • Architectural flaws   │
│  • Regex + AST scan    │ feeds  │  • Cross-file data flow  │
│  • Excel report        │ into   │  • Business logic bugs   │
│  • Seconds to run      │        │  • Contextual issues     │
└────────────────────────┘        └──────────────────────────┘
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

# Generation (AEMaaCS)
create a new AEM component called Hero Banner
generate a Sling Model for the Article component
create Cloud Manager pipeline configuration

# Generation (Commerce)
create a new Commerce module Acme_CustomShipping
create an after plugin on Magento\Catalog\Model\Product::getName
add a GraphQL resolver for querying custom entity by ID
```

After an audit completes, follow up with:

```text
summarize the audit findings
show me all CRITICAL severity items
create a fix plan for the critical items
estimate effort to fix all HIGH and CRITICAL findings
```

---

## Folder Structure

```
bmad-dept-code-agent/
├── README.md                         ← You are here
├── MANUAL.md                         ← Operational guide
├── PROMPTS.md                        ← Full prompt reference
└── skills/
    ├── module.yaml                   ← BMAD module manifest
    ├── module-help.csv               ← Menu/capability registry
    ├── bmad-dept-code-audit-agent/
    ├── bmad-dept-code-generation-agent/
    ├── bmad-dept-code-impact-analysis-agent/
    └── bmad-dept-code-scan-agent/
```

Each skill folder contains:

| File | Role |
|------|------|
| `SKILL.md` | Instructions TO the AI agent — workflows, modes, triggers |
| `GUIDE.md` | Instructions FOR humans — setup, examples |
| `customize.toml` | Activation keywords, named commands, script paths |
| `assets/` | Module manifest + capability registry |
| `resources/` | Rule packs, scoring models, detection strategies |
| `templates/` | Report output templates |
| `scripts/` | TypeScript/Python engines |

---

## License

MIT
