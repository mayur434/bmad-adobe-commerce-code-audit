# Adobe Code Audit — BMAD Custom Module

[![GitHub](https://img.shields.io/badge/GitHub-mayur434%2Fbmad--adobe--commerce--code--audit-blue)](https://github.com/mayur434/bmad-adobe-commerce-code-audit)

Two-tier enterprise code audit for **Adobe Commerce**, **AEM as a Cloud Service**, **Edge Delivery Services**, and **EDS+Commerce** hybrid projects.

| Tier | Method | Output | Speed |
|------|--------|--------|-------|
| **Tier 1** | Deterministic Python scanner | Excel report (42+ categories) | Seconds |
| **Tier 2** | LLM semantic analysis | Markdown/JSON narrative report | Minutes |

---

## Quick Start

### From a Git URL

```bash
cd /path/to/your/adobe-commerce-project

npx bmad-method install \
  --directory . \
  --modules bmm,bmb \
  --custom-source https://github.com/mayur434/bmad-adobe-commerce-code-audit.git \
  --tools claude-code \
  --yes
```

### From a Local Path

```bash
npx bmad-method install \
  --directory . \
  --modules bmm,bmb \
  --custom-source /path/to/bmad-adobe-commerce-code-audit/skills \
  --tools claude-code \
  --yes
```

After install, ask your agent: **"audit my project"**

The agent will:
1. Auto-install Python dependencies if missing
2. Ask which mode you prefer (Scanner / LLM / Full Audit)
3. Run the audit and produce the report

---

## What It Does

### Tier 1 — Python Static Scanner

Fast, deterministic scan that produces an enterprise Excel report:

- **42+ code audit categories** — security, performance, deprecated APIs, Magento coding standards, DI violations, plugin conflicts, observer issues, etc.
- **Database dump analysis** — schema integrity, missing indexes, orphaned tables, constraint violations
- **BRD impact analysis** — maps new requirements to affected modules, estimates effort
- **Bug cascade analysis** — severity scoring, dependency chains, regression risk
- **Patch/upgrade analysis** — breaking changes, removed APIs, compatibility flags

### Tier 2 — LLM Deep Analysis

AI-driven analysis that catches what scripts cannot:

- Architectural anti-patterns and design violations
- Cross-file data flow issues (unsanitized input propagation)
- Business logic correctness problems
- Contextual performance issues (N+1 across multiple endpoints)
- Configuration consistency (code expects config that doesn't exist)

Uses platform-specific [rule packs](skills/adobe-agent-code-audit/resources/rule-packs/) and a multi-pass [detection strategy](skills/adobe-agent-code-audit/resources/shared/detection-strategy.md).

---

## Folder Structure

```
bmad-adobe-commerce-code-audit/
└── skills/
    └── adobe-agent-code-audit/
        ├── SKILL.md              # AI agent instructions
        ├── GUIDE.md              # Human usage guide
        ├── customize.toml        # Skill metadata & commands
        ├── assets/
        │   ├── module.yaml       # BMAD module manifest
        │   └── module-help.csv   # Capability registry
        ├── resources/
        │   ├── shared/
        │   │   ├── severity-model.md
        │   │   ├── confidence-scoring.md
        │   │   ├── impact-analysis.md
        │   │   └── detection-strategy.md
        │   └── rule-packs/
        │       ├── aemcs/rules.md
        │       ├── commerce/rules.md
        │       ├── eds/rules.md
        │       └── eds-commerce/rules.md
        ├── templates/
        │   ├── report-markdown.md
        │   └── report-json.md
        └── scripts/
            ├── run.py            # Multi-engine dispatcher
            ├── requirements.txt
            ├── engines/
            │   ├── registry.py   # Engine auto-detection
            │   ├── commerce/     # Full Commerce engine
            │   ├── aem/          # Planned
            │   ├── eds/          # Planned
            │   └── eds_commerce/ # Planned
            └── shared/
                └── base.py       # Base engine class
```

---

## Available Engines

| Engine | Platform | Status |
|--------|----------|--------|
| `commerce` | Adobe Commerce / Magento 2 | ✅ Ready |
| `aem` | AEM as a Cloud Service | 🔲 Planned |
| `eds` | Edge Delivery Services | 🔲 Planned |
| `eds-commerce` | EDS + Commerce Hybrid | 🔲 Planned |

---

## Usage Modes

### Mode 1: Scanner Only (Tier 1)

Fast deterministic scan → Excel report in seconds.

```bash
# After BMAD install (from project root)
python3 .claude/skills/adobe-agent-code-audit/scripts/run.py --path . --engine commerce --name "My Project"

# With database dump + BRD
python3 .claude/skills/adobe-agent-code-audit/scripts/run.py --path . --engine commerce \
  --db /path/to/dump.sql \
  --brd /path/to/requirements.docx \
  --name "Client Project"
```

### Mode 2: LLM Analysis Only (Tier 2)

AI agent reads rule packs + detection strategy, performs multi-pass semantic analysis.

Ask: **"deep audit my project using LLM analysis"**

### Mode 3: Full Audit (Tier 1 + Tier 2)

Scanner runs first → LLM analyzes high-severity findings deeper → combined report.

Ask: **"full audit my project"**

---

## Standalone Usage (Without BMAD)

Run the Python scanner directly without any BMAD setup:

```bash
cd skills/adobe-agent-code-audit/scripts

pip install -r requirements.txt

# Auto-detect platform
python3 run.py --path /path/to/your/project --name "Project Name"

# Explicit engine
python3 run.py --engine commerce --path /path/to/project

# List available engines
python3 run.py --list-engines
```

---

## Architecture

```
Tier 1 (Python Script)           Tier 2 (LLM Skill)
┌──────────────────────┐        ┌──────────────────────────┐
│  Deterministic       │        │  Semantic Analysis       │
│  Static Analysis     │        │  (Rule Packs + AI)       │
│                      │        │                          │
│  • 42+ categories    │───────▶│  • Architectural flaws   │
│  • Regex/AST scan    │ feeds  │  • Cross-file data flow  │
│  • Excel report      │ into   │  • Business logic bugs   │
│  • Seconds to run    │        │  • Contextual issues     │
└──────────────────────┘        └──────────────────────────┘
```

---

## Prerequisites

- **Node.js** v20.12+ (for BMAD installer)
- **Python** 3.10+ (for Tier 1 scanner)
- Python packages: `openpyxl`, `python-docx` (auto-installed by the agent)

---

## Reference Files

| File | Purpose |
|------|---------|
| [SKILL.md](skills/adobe-agent-code-audit/SKILL.md) | AI agent instructions — workflow, activation triggers, modes |
| [GUIDE.md](skills/adobe-agent-code-audit/GUIDE.md) | Human-readable setup and usage guide |
| [customize.toml](skills/adobe-agent-code-audit/customize.toml) | Skill metadata, commands, activation keywords |
| [module.yaml](skills/adobe-agent-code-audit/assets/module.yaml) | BMAD module manifest (code, agents, config vars) |
| [module-help.csv](skills/adobe-agent-code-audit/assets/module-help.csv) | Capability registry (13-column format) |
| [detection-strategy.md](skills/adobe-agent-code-audit/resources/shared/detection-strategy.md) | Multi-pass analysis strategy for Tier 2 |
| [severity-model.md](skills/adobe-agent-code-audit/resources/shared/severity-model.md) | Severity scoring framework |
| [confidence-scoring.md](skills/adobe-agent-code-audit/resources/shared/confidence-scoring.md) | Confidence calculation model |
| [impact-analysis.md](skills/adobe-agent-code-audit/resources/shared/impact-analysis.md) | Impact assessment framework |
| [commerce/rules.md](skills/adobe-agent-code-audit/resources/rule-packs/commerce/rules.md) | Commerce platform rule pack |
| [aemcs/rules.md](skills/adobe-agent-code-audit/resources/rule-packs/aemcs/rules.md) | AEM Cloud Service rule pack |
| [eds/rules.md](skills/adobe-agent-code-audit/resources/rule-packs/eds/rules.md) | Edge Delivery Services rule pack |
| [eds-commerce/rules.md](skills/adobe-agent-code-audit/resources/rule-packs/eds-commerce/rules.md) | EDS+Commerce hybrid rule pack |
| [report-markdown.md](skills/adobe-agent-code-audit/templates/report-markdown.md) | Markdown report template |
| [report-json.md](skills/adobe-agent-code-audit/templates/report-json.md) | JSON report template |

---

## License

MIT
