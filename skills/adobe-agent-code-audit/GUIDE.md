# Adobe Code Audit — BMAD Custom Module

Two-tier code audit system for Adobe ecosystem projects.

---

## End-to-End Setup

### Prerequisites

- Node.js v20.12+
- Python 3.10+
- pip (for `openpyxl`, `python-docx`)
- BMAD already initiated on your Adobe Commerce project

### Step 1: Install BMAD with this custom module

```bash
cd /path/to/your/adobe-commerce-project

npx bmad-method install \
  --directory . \
  --modules bmm,bmb \
  --custom-source ~/bmad-modules/adobe-code-audit/skills \
  --tools claude-code \
  --yes
```

> Replace `~/bmad-modules/adobe-code-audit` with the actual path to this repo.
> Or use a Git URL: `--custom-source https://github.com/your-org/bmad-code-audit.git`

After install, the skill lives at `.claude/skills/adobe-agent-code-audit/`.

### Step 2: Install Python dependencies

```bash
pip install -r .claude/skills/adobe-agent-code-audit/scripts/requirements.txt
```

This installs: `openpyxl` (Excel reports), `python-docx` (BRD .docx parsing).

### Step 3: Run the audit

**Option A — Via AI agent (Tier 1 + Tier 2):**

Ask your agent:
- "audit my project"
- "run a code review"
- "scan my commerce code"

The agent will use the SKILL.md instructions to run the Python scanner (Tier 1) and then perform AI deep analysis (Tier 2).

**Option B — Via CLI (Tier 1 only):**

```bash
# Auto-detect platform
python3 .claude/skills/adobe-agent-code-audit/scripts/run.py --path .

# Explicit engine + name
python3 .claude/skills/adobe-agent-code-audit/scripts/run.py --path . --engine commerce --name "My Project"

# Full audit: code + DB + BRD + patch
python3 .claude/skills/adobe-agent-code-audit/scripts/run.py --path . --engine commerce \
  --db /path/to/dump.sql \
  --brd /path/to/requirements.docx \
  --name "Client Project"

# List engines
python3 .claude/skills/adobe-agent-code-audit/scripts/run.py --list-engines
```

### Step 4: Find your report

The Excel report is generated in the engine's output directory:
```
.claude/skills/adobe-agent-code-audit/scripts/engines/commerce/output/
  ProjectName-audit-code+db+brd+patch-YYYYMMDD_HHMMSS-branch-name.xlsx
```

You can override the output path with `--output /custom/path`.

---

## Direct CLI Usage (without BMAD install)

If you want to run the scanner standalone without the full BMAD setup:

```bash
cd /path/to/bmad-code-audit/skills/adobe-agent-code-audit/scripts

# 1. Install dependencies
pip install -r requirements.txt

# 2. Run an audit (auto-detects platform)
python3 run.py --path /path/to/your/project

# 3. Or specify the engine explicitly
python3 run.py --engine commerce --path /path/to/project --name "My Project"
```

---

## Architecture

```
Tier 1 (Python Script)          Tier 2 (LLM Skill)
┌─────────────────────┐        ┌─────────────────────────┐
│  Deterministic      │        │  Semantic Analysis      │
│  Static Analysis    │        │  (Rule Packs + AI)      │
│                     │        │                         │
│  • 42+ categories   │───────▶│  • Architectural flaws  │
│  • Regex/AST scan   │ feeds  │  • Cross-file data flow │
│  • Excel report     │ into   │  • Business logic bugs  │
│  • Seconds to run   │        │  • Contextual issues    │
└─────────────────────┘        └─────────────────────────┘
```

---

## Available Engines

| Engine | Platform | Status |
|--------|----------|--------|
| `commerce` | Adobe Commerce / Magento 2 | ✅ Ready |
| `aem` | AEM as a Cloud Service | 🔲 Planned |
| `eds` | Edge Delivery Services | 🔲 Planned |
| `eds-commerce` | EDS + Commerce Hybrid | 🔲 Planned |

```bash
# List all engines
python3 scripts/run.py --list-engines
```

---

## Usage Modes

### Mode A: Tier 1 Only (Script)

Fast deterministic scan → Excel report.

```bash
# Commerce audit (full: code + DB + BRD + patch)
python3 run.py --engine commerce --path /project

# Commerce with specific options
python3 run.py --engine commerce --path /project --name "Client" --db /path/dump.sql

# Commerce — BRD impact analysis only
python3 run.py --engine commerce --path /project --no-code-audit --brd /path/brd.txt

# Commerce — bug impact analysis
python3 run.py --engine commerce --path /project --bugs /path/bugs.xlsx
```

### Mode B: Tier 2 Only (LLM Deep Analysis)

Invoke the BMAD skill via agent command — uses rule packs from `resources/rule-packs/` and detection strategy from `resources/shared/`.

### Mode C: Full Audit (Tier 1 + Tier 2)

1. Run Tier 1 to get the deterministic Excel
2. Ask the BMAD agent to perform deep analysis on high-severity findings
3. Get both: structured Excel + AI narrative report

---

## Commerce Engine — Full CLI Reference

```bash
python3 run.py --engine commerce [OPTIONS]

OPTIONS:
  --path PATH          Adobe Commerce project root
  --name NAME          Project name for report title
  --output DIR         Output directory (default: output/)
  --namespace NS       Custom module namespace (default: Custom)
  --module MOD         Audit only specified modules (comma-separated)
  --db PATH            SQL dump file for DB analysis
  --brd PATH           BRD file for impact analysis (repeatable)
  --bugs PATH          Bug report Excel (.xlsx)
  --no-code-audit      Skip code audit categories
  --config PATH        Custom config.json path
  --json               Output as JSON to stdout (for integrations)
```

### Commerce Config File

Each engine has its own `config.json`. For commerce: `scripts/engines/commerce/config.json`

```json
{
    "project": {
        "path": "/path/to/project",
        "name": "Project Name"
    },
    "output": {
        "directory": "output"
    },
    "analysis": {
        "code_audit": "yes",
        "brd": ["/path/to/brd.docx"],
        "bug_report": "",
        "patch": {
            "enabled": true,
            "from_version": "2.4.7-p7",
            "to_version": "2.4.7-p9"
        }
    },
    "scanner": {
        "namespace": "Custom",
        "categories": [],
        "modules": []
    },
    "thresholds": {
        "god_class_lines": 500,
        "fat_constructor_deps": 10
    }
}
```

---

## Adding a New Engine

1. Create the engine directory:
   ```bash
   mkdir -p scripts/engines/myplatform/lib
   ```

2. Create `scripts/engines/myplatform/audit.py` with a `main()` function:
   ```python
   def main():
       # Parse args (--path, --name, --output at minimum)
       # Run scan
       # Generate report
       pass

   if __name__ == "__main__":
       main()
   ```

3. Register detection logic in `scripts/engines/registry.py`:
   ```python
   def _detect_myplatform(path):
       # Return True if path matches this platform
       return os.path.isfile(os.path.join(path, "some-marker-file"))

   register("myplatform", "My Platform Description", _detect_myplatform, "engines.myplatform.audit")
   ```

4. Optionally add a rule pack for Tier 2: `resources/rule-packs/myplatform/rules.md`

---

## Directory Structure

```
bmad-code-audit/                    # Module repository
├── package.json                    # npm metadata for BMAD discovery
├── src/
│   ├── module.yaml                 # BMAD module declaration (code: aca)
│   ├── module-help.csv             # Capability registry (13-column format)
│   └── skills/
│       └── bmad-code-audit/        # The audit skill
│           ├── SKILL.md            # Agent instructions
│           ├── GUIDE.md            # This file
│           ├── customize.toml      # Skill config
│           ├── resources/
│           │   ├── rule-packs/     # Tier 2 rule packs (per platform)
│           │   │   ├── aemcs/rules.md
│           │   │   ├── commerce/rules.md
│           │   │   ├── eds/rules.md
│           │   │   └── eds-commerce/rules.md
│           │   └── shared/         # Tier 2 analysis models
│           │       ├── confidence-scoring.md
│           │       ├── detection-strategy.md
│           │       ├── impact-analysis.md
│           │       └── severity-model.md
│           ├── templates/          # Tier 2 report templates
│           │   ├── report-json.md
│           │   └── report-markdown.md
│           └── scripts/            # Tier 1 Python engines
│               ├── run.py          # Unified dispatcher
│               ├── requirements.txt
│               ├── shared/         # Shared utilities
│               │   ├── __init__.py
│               │   └── base.py
│               └── engines/
│                   ├── __init__.py
│                   ├── registry.py # Engine registration & detection
│                   ├── commerce/   # ✅ Implemented
│                   │   ├── audit.py
│                   │   ├── config.json
│                   │   └── lib/
│                   ├── aem/        # 🔲 Planned
│                   ├── eds/        # 🔲 Planned
│                   └── eds_commerce/ # 🔲 Planned
```

When installed via BMAD into a project:
```
your-project/
├── _bmad/
│   ├── aca/                        # Module code = "aca"
│   │   ├── scripts/run.py          # Tier 1 entry point
│   │   ├── resources/              # Tier 2 rule packs
│   │   └── ...
│   └── _config/
│       ├── skill-manifest.csv      # Skill registered here
│       └── bmad-help.csv           # Commands registered here
└── _bmad-output/
    └── audit-reports/              # Generated reports land here
```

---

## Dependencies

```bash
pip install -r scripts/requirements.txt
```

Current requirements:
- `openpyxl>=3.1.0` — Excel report generation
- `python-docx>=1.0.0` — BRD .docx parsing
- `mcp[cli]>=1.0.0` — MCP server integration (optional)

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `No app/code directory found` | Ensure --path points to the Magento root (where `app/`, `composer.json` live) |
| `Could not auto-detect project type` | Use `--engine commerce` explicitly |
| `ModuleNotFoundError: openpyxl` | Run `pip install -r scripts/requirements.txt` |
| `Engine 'aem' not yet implemented` | The AEM engine is planned — contribute `engines/aem/audit.py` |
