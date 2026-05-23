# BMAD Code Audit — Custom Module

Two-tier code audit system for enterprise projects.

---

## End-to-End Setup

### Prerequisites

- Node.js v20.12+
- npm (for `exceljs`, `mammoth`, `fast-glob`)
- BMAD already initiated on your project

### Step 1: Install BMAD with this custom module

```bash
cd /path/to/your/project

npx bmad-method install \
  --directory . \
  --modules bmm,bmb \
  --custom-source ~/bmad-modules/adobe-code-audit/skills \
  --tools claude-code \
  --yes
```

> Replace `~/bmad-modules/adobe-code-audit` with the actual path to this repo.
> Or use a Git URL: `--custom-source https://github.com/your-org/bmad-code-audit.git`

After install, the skill lives at `.claude/skills/bmad-code-audit-agent/`.

### Step 2: Install Node dependencies

```bash
cd .claude/skills/bmad-code-audit-agent/scripts && npm install
```

This installs: `exceljs` (Excel reports), `mammoth` (BRD .docx parsing), `fast-glob` (file scanning).

### Step 3: Run the audit

Ask your AI agent using natural language. The agent resolves your intent to the correct CLI flags automatically.

**Basic scans:**
- "scan my project"
- "scan my project and name it Acme"
- "scan only the Checkout and Payment modules"
- "scan only the Custom namespace"

**With data inputs:**
- "scan my project with DB dump at /path/to/dump.sql"
- "scan with BRD impact analysis using /path/to/requirements.docx"
- "scan with bug report from /path/to/bugs.xlsx"

**Targeted analysis:**
- "just run BRD analysis from /path/to/brd.docx, skip the code scan"
- "analyze patch upgrade impact from 2.4.7-p7 to 2.4.7-p9"

**Combined (all layers):**
- "run full scanner with DB at /db.sql, BRD at /spec.docx, bugs at /bugs.xlsx"

**Deep/Full audit:**
- "deep audit my project" (Tier 2 only — LLM semantic analysis)
- "full audit my project" (Tier 1 + Tier 2 combined)

**Utilities:**
- "export findings as JSON"
- "what engines are available?"

The agent will:
1. Auto-detect the platform (or ask if ambiguous)
2. Build the correct CLI command with all extracted flags
3. Execute the scanner
4. Present results / point to the generated Excel report

### Step 4: Find your report

The Excel report is generated in the engine's output directory:
```
.claude/skills/bmad-code-audit-agent/scripts/engines/commerce/output/
  ProjectName-audit-code+db+brd+patch-YYYYMMDD_HHMMSS-branch-name.xlsx
```

You can override the output path with `--output /custom/path`.

---

## Direct CLI Usage (without BMAD install)

If you want to run the scanner standalone without the full BMAD setup:

```bash
cd /path/to/bmad-code-audit/skills/bmad-code-audit-agent/scripts

# 1. Install dependencies
npm install

# 2. Run an audit (auto-detects platform)
npx ts-node run.ts --path /path/to/your/project

# 3. Or specify the engine explicitly
npx ts-node run.ts --engine commerce --path /path/to/project --name "My Project"
```

---

## Architecture

```
Tier 1 (TypeScript/Node.js)      Tier 2 (LLM Skill)
┌─────────────────────┐        ┌─────────────────────────┐
│  Deterministic      │        │  Semantic Analysis      │
│  Static Analysis    │        │  (Rule Packs + AI)      │
│                     │        │                         │
│  • 42+ categories   │───────▶│  • Architectural flaws  │
│  • Regex scan       │ feeds  │  • Cross-file data flow │
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
npx ts-node scripts/run.ts --list-engines
```

---

## Usage Modes

### Mode A: Tier 1 Only (Script)

Fast deterministic scan → Excel report.

| Prompt | What Happens |
|--------|-------------|
| "scan my project" | Code audit → Excel |
| "scan with DB dump at /path.sql" | Code + DB audit → Excel |
| "scan with BRD from /brd.docx" | Code + BRD impact → Excel |
| "scan with bug report /bugs.xlsx" | Code + Bug cascade → Excel |
| "run full scanner with DB, BRD, and bugs" | All layers → Excel |
| "just run BRD analysis, skip code scan" | BRD-only (--no-code-audit) → Excel |
| "scan only Checkout module" | Filtered code audit → Excel |
| "export JSON" | JSON output (for CI pipes) |

### Mode B: Tier 2 Only (LLM Deep Analysis)

| Prompt | What Happens |
|--------|-------------|
| "deep audit my project" | AI semantic analysis using rule packs |
| "deep audit only the Payment module" | Focused AI analysis |

### Mode C: Full Audit (Tier 1 + Tier 2)

| Prompt | What Happens |
|--------|-------------|
| "full audit my project" | Scanner → Excel, then AI deep analysis on high-severity findings |
| "complete audit with scanner and deep analysis" | Same as above |

---

## Commerce Engine — CLI Flags (Agent Reference)

The agent builds these commands from user prompts. You should never need to type these manually.

```
npx ts-node run.ts --engine commerce [FLAGS]

FLAGS (resolved from natural language):
  --path PATH          Project root (auto: workspace root)
  --name NAME          Report title (auto: folder name)
  --output DIR         Output dir (default: output/)
  --namespace NS       Module namespace (default: Custom)
  --module MOD         Filter modules (comma-separated)
  --db PATH            SQL dump for DB analysis
  --brd PATH           BRD document (repeatable)
  --bugs PATH          Bug report Excel (.xlsx)
  --no-code-audit      Skip code audit (for BRD-only / bugs-only)
  --config PATH        Custom config.json
  --json               JSON to stdout (for CI)
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

2. Create `scripts/engines/myplatform/audit.ts` with a `main()` function:
   ```typescript
   export async function main(): Promise<void> {
     // Parse args (--path, --name, --output at minimum)
     // Run scan
     // Generate report
   }
   ```

3. Register detection logic in `scripts/engines/registry.ts`:
   ```typescript
   import { register } from './registry';
   import * as fs from 'fs';
   import * as path from 'path';

   register('myplatform', 'My Platform Description',
     (p: string) => fs.existsSync(path.join(p, 'some-marker-file')),
     'engines/myplatform/audit'
   );
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
│           └── scripts/            # Tier 1 TypeScript engines
│               ├── run.ts          # Unified dispatcher
│               ├── package.json    # Node dependencies
│               ├── tsconfig.json   # TypeScript config
│               ├── shared/         # Shared utilities
│               │   └── base.ts
│               └── engines/
│                   ├── registry.ts # Engine registration & detection
│                   ├── commerce/   # ✅ Implemented
│                   │   ├── audit.ts
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
│   │   ├── scripts/run.ts          # Tier 1 entry point
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
cd scripts && npm install
```

Current dependencies (see `scripts/package.json`):
- `exceljs` — Excel report generation
- `mammoth` — BRD .docx parsing
- `fast-glob` — High-performance file scanning
- `typescript` — TypeScript compiler
- `ts-node` — TypeScript execution

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `No app/code directory found` | Ensure --path points to the Magento root (where `app/`, `composer.json` live) |
| `Could not auto-detect project type` | Use `--engine commerce` explicitly |
| `Cannot find module 'exceljs'` | Run `cd scripts && npm install` |
| `Engine 'aem' not yet implemented` | The AEM engine is planned — contribute `engines/aem/audit.ts` |
