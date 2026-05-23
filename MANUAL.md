# BMAD Custom Module — Creation Manual

A step-by-step guide for team members to build a new BMAD custom module from scratch.

---

## Overview

A BMAD custom module is a self-contained skill package that extends the BMAD agent system. It lives in its own repo and gets installed into any project via `npx bmad-method install --custom-source`.

**What we built as reference:** `bmad-code-audit-agent` — a two-tier code auditor with a TypeScript scanner + LLM deep analysis.

---

## 1. Repository Structure

Create a new repo with this exact layout:

```
your-module-repo/
├── README.md
├── skills/
│   ├── module.yaml              ← Module metadata (BMAD reads this)
│   ├── module-help.csv          ← Menu entries for the agent
│   └── your-skill-name/         ← The actual skill folder
│       ├── SKILL.md             ← Agent instructions (THE most important file)
│       ├── GUIDE.md             ← Human setup/usage docs
│       ├── customize.toml       ← Skill config (tools, activation keywords, commands)
│       ├── assets/
│       │   ├── module.yaml      ← Copy of top-level module.yaml
│       │   └── module-help.csv  ← Copy of top-level module-help.csv
│       ├── resources/           ← Reference data the agent/scripts use
│       ├── templates/           ← Output templates (reports, etc.)
│       └── scripts/             ← Executable code (TypeScript, Node, etc.)
│           ├── run.ts           ← Main entry point
│           ├── package.json     ← Dependencies
│           ├── tsconfig.json    ← TypeScript config
│           ├── engines/         ← Pluggable engine modules
│           │   └── registry.ts
│           └── shared/          ← Shared utilities
│               └── base.ts
```

> **Rule:** The `skills/` folder is what `--custom-source` points to. Everything is nested under it.

---

## 2. File-by-File Breakdown

### 2.1 `skills/module.yaml` — Module Identity

This is how BMAD discovers your module. Required fields:

```yaml
code: xyz                      # Short code (unique, lowercase)
name: "My Module Name"
header: "One-liner headline"
subheader: "Slightly longer description"
description: "Brief description for listings"
default_selected: false        # true = auto-selected during install
recommendedModules: [bmm]      # Other modules that pair well
requiredModules: [core]        # Hard dependencies

agents:
  - code: my-agent-code        # Agent identifier
    name: AgentName            # Display name
    title: Full Title Here
    icon: "🔧"                 # Emoji icon
    description: "What this agent does."
    team: software-development # Team grouping

# Configuration variables (prompted during install)
my_output_dir:
  prompt: "Where should output go?"
  default: "{output_folder}/my-reports"
  result: "{project-root}/{value}"

my_setting:
  prompt: "Pick a mode?"
  default: "auto"
  single-select: ["auto", "option-a", "option-b"]

directories:
  - "{my_output_dir}"          # Auto-created during install

post-install-notes: |
  Module installed successfully.
  Quick start: ask "do the thing" to your agent.
```

### 2.2 `skills/module-help.csv` — Agent Menu Entries

CSV with these columns — this controls what shows up in the agent's menu:

```csv
module,skill,display-name,menu-code,description,action,args,phase,preceded-by,followed-by,required,output-location,outputs
My Module,_meta,,,,,,,,,false,https://github.com/your-org/your-repo,
My Module,my-skill,Do Thing,DT,Run the main action.,main-action,,anytime,,,false,{my_output_dir},report
My Module,my-skill,Quick Mode,QM,Run quick mode only.,quick,,anytime,,,false,{my_output_dir},quick report
```

| Column | Purpose |
|--------|---------|
| `module` | Must match `name` in module.yaml |
| `skill` | Folder name of the skill (or `_meta` for the module link row) |
| `display-name` | What the user sees |
| `menu-code` | 2-char shortcut |
| `action` | Maps to a command in customize.toml |
| `phase` | When it can run: `anytime`, `pre-build`, `post-build` |
| `preceded-by` | Dependency: `skill-name:action` |
| `output-location` | Where results go (uses config variables) |

### 2.3 `skills/your-skill-name/customize.toml` — Skill Config

```toml
[skill]
name = "your-skill-name"
description = "What this skill does in one sentence."
version = "1.0.0"

[skill.tools]
required = ["claude-code"]     # Which AI tools support this skill

[skill.activation]
keywords = ["audit", "scan", "review", "check"]  # Trigger words

[skill.scripts]
dispatcher = "scripts/run.ts"
package = "scripts/package.json"

[skill.commands]
# Define named commands (referenced by module-help.csv actions)
main-action = "npx ts-node scripts/run.ts"
quick = "npx ts-node scripts/run.ts --quick"
deep = "skill"                 # Means: use LLM with skill instructions
full = "quick+skill"           # Combined: run script then LLM
list-modes = "npx ts-node scripts/run.ts --list-modes"
```

### 2.4 `skills/your-skill-name/SKILL.md` — The Brain

This is the most important file. It's what the AI agent reads to know how to use your module. Structure it like this:

```markdown
---
name: your-skill-name
description: "What this skill does (short)."
---

# Skill Name

## Purpose
What this skill does. Two paragraphs max.

## Activation
When this skill activates (user says X, Y, or Z).

## Pre-flight: Auto-install Dependencies
Any setup commands to run silently before execution.

## Consent: Ask Mode
What to ask the user before proceeding (if multiple modes exist).
Include direct-intent triggers that skip the question.

## Workflow

### Mode A: Script Only
Step-by-step instructions for the agent.

### Mode B: LLM Analysis
How to use resources/rule-packs for deep analysis.

### Mode C: Combined
Run Mode A, then feed results into Mode B.

## Output
Where reports go, what format, how to present results.

## Error Handling
What to do when things fail.
```

**Key principles for SKILL.md:**
- Write it as instructions TO the AI agent, not to a human
- Be explicit about file paths, commands, error handling
- Include "do NOT ask the user" for things that should be silent
- Define trigger phrases that map to specific modes

### 2.5 `skills/your-skill-name/GUIDE.md` — Human Docs

Setup instructions for humans. Include:
- Prerequisites (Node.js v20+)
- Install command
- CLI usage examples
- Where to find output

### 2.6 `resources/` — Reference Data

Anything the agent or scripts need to reference:
- Rule packs (categorized detection rules)
- Scoring models
- Configuration schemas
- Strategy docs

### 2.7 `templates/` — Output Templates

Report templates with `{{PLACEHOLDER}}` variables:

```markdown
# Report: {{PROJECT_NAME}}
**Date**: {{DATE}}
**Score**: {{RISK_SCORE}}/10
...
```

### 2.8 `scripts/` — Executable Code

#### `run.ts` — Dispatcher Pattern

Use a dispatcher that auto-detects context and routes to the right engine:

```typescript
import { resolve, dirname } from 'path';
import { detectPlatform, getEngine, listEngines } from './engines/registry';

const SCRIPTS_DIR = dirname(resolve(__filename));

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const engineArg = args.find((_, i, a) => a[i - 1] === '--engine');
  const pathArg = args.find((_, i, a) => a[i - 1] === '--path');
  const listEnginesFlag = args.includes('--list-engines');

  // Auto-detect or use explicit engine
  // Dispatch to engines/<platform>/audit.ts
}

main().catch(console.error);
```

#### `engines/registry.ts` — Engine Registration

```typescript
interface EngineEntry {
  description: string;
  detect: (path: string) => boolean;
  module: string;
}

const ENGINES: Record<string, EngineEntry> = {};

export function register(platformId: string, description: string, detectFn: (path: string) => boolean, modulePath: string): void {
  ENGINES[platformId] = { description, detect: detectFn, module: modulePath };
}

export function detectPlatform(projectPath: string): string[] {
  return Object.entries(ENGINES)
    .filter(([_, eng]) => eng.detect(projectPath))
    .map(([pid]) => pid);
}

// Register your engines
register('my-engine', 'Description', detectFn, 'engines/my_engine/audit');
```

#### `shared/base.ts` — Engine Interface

```typescript
export abstract class BaseAuditEngine {
  static PLATFORM_ID = 'base';
  static PLATFORM_NAME = 'Base Engine';

  protected projectRoot: string;
  protected config: Record<string, any>;

  constructor(projectRoot: string, config: Record<string, any> = {}) {
    this.projectRoot = projectRoot;
    this.config = config;
  }

  static detect(path: string): boolean {
    throw new Error('Not implemented');
  }

  abstract scan(): Promise<any>;
  abstract generateReport(findings: any, outputPath: string): Promise<void>;
}
```

---

## 3. Install & Test

### Install into a target project

```bash
cd /path/to/target-project

npx bmad-method install \
  --directory . \
  --modules bmm,bmb \
  --custom-source /absolute/path/to/your-module-repo/skills \
  --tools claude-code \
  --yes
```

**Important:** `--custom-source` points to the `skills/` folder, NOT the repo root.

### Verify installation

After install, your skill lands at:
```
target-project/.claude/skills/your-skill-name/
```

### Test the script independently

```bash
npx ts-node .claude/skills/your-skill-name/scripts/run.ts --path . --list-engines
```

### Test via the agent

Ask the agent one of your activation keywords and confirm it picks up the skill.

---

## 4. Checklist Before Publishing

- [ ] `module.yaml` — `code` is unique, `name` matches everywhere
- [ ] `module-help.csv` — module name matches yaml, actions match customize.toml commands
- [ ] `customize.toml` — skill name matches folder name, all commands are valid
- [ ] `SKILL.md` — frontmatter `name` matches folder name, all file paths relative
- [ ] `GUIDE.md` — install command uses correct `--custom-source` path
- [ ] `package.json` — all Node dependencies listed
- [ ] `scripts/run.ts` — runs standalone without errors (`npx ts-node run.ts --help`)
- [ ] `engines/registry.ts` — all engines registered, detection functions tested
- [ ] `assets/` — contains copies of `module.yaml` and `module-help.csv`
- [ ] Git repo has clean README explaining what the module does

---

## 5. Common Patterns

### Adding a new engine

1. Create `scripts/engines/my_platform/audit.ts`
2. Implement `BaseAuditEngine` subclass
3. Add detection function to `registry.ts`
4. Register it: `register('my-platform', 'Description', detectFn, 'engines/my_platform/audit')`
5. Add rule pack: `resources/rule-packs/my-platform/rules.md`

### Adding configuration variables

1. Add to `module.yaml` with `prompt`, `default`, and optionally `single-select`
2. Reference in `module-help.csv` output-location as `{variable_name}`
3. BMAD prompts the user during install and substitutes values

### Making scripts auto-install deps

In `SKILL.md` pre-flight section:
```bash
cd .claude/skills/your-skill-name/scripts && [ -d node_modules ] || npm install --silent
```

The agent runs this silently before any operation.

---

## 6. Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Repo name | `bmad-<purpose>` | `bmad-code-audit` |
| Skill folder | `bmad-<purpose>-agent` | `bmad-code-audit-agent` |
| Module code | 2-4 char abbreviation | `aca` |
| Agent code | `bmad-<purpose>-agent` | `bmad-code-audit-agent` |
| Engine dirs | lowercase, underscores | `eds_commerce` |
| Engine IDs | lowercase, hyphens | `eds-commerce` |

---

## 7. Quick-Start Template

Copy-paste this to scaffold a new module instantly:

```bash
MODULE_NAME="my-skill-name"
MODULE_CODE="msk"

mkdir -p skills/$MODULE_NAME/{assets,resources,templates,scripts/{engines,shared}}
touch skills/module.yaml skills/module-help.csv
touch skills/$MODULE_NAME/{SKILL.md,GUIDE.md,customize.toml}
touch skills/$MODULE_NAME/assets/{module.yaml,module-help.csv}
touch skills/$MODULE_NAME/scripts/{run.ts,package.json,tsconfig.json}
touch skills/$MODULE_NAME/scripts/engines/registry.ts
touch skills/$MODULE_NAME/scripts/shared/base.ts
echo "# $MODULE_NAME" > README.md
```

Then fill in each file following sections 2.1–2.8 above.
