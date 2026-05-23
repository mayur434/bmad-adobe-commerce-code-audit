---
name: bmad-code-audit-agent
description: "Two-tier code auditor for Commerce, AEMaaCS, EDS, and hybrid projects. Tier 1: deterministic TypeScript/Node.js static analysis (42+ categories, Excel report). Tier 2: LLM-driven deep semantic analysis."
---

# BMAD Code Audit Skill

## Purpose

Two-tier code audit system for enterprise projects including AEM as a Cloud Service (AEMaaCS), Adobe Commerce (Magento), Edge Delivery Services (EDS), and EDS+Commerce hybrid implementations.

### Tier 1 — Deterministic Static Analysis (TypeScript/Node.js)

Fast, reproducible scan using `scripts/run.ts`. Produces an enterprise Excel report with:
- 42-category code audit (security, performance, deprecated APIs, etc.)
- Database dump analysis (schema, indexes, integrity)
- BRD impact analysis (new requirements, feature enhancements)
- Bug cascade & severity analysis (from Excel bug reports)
- Patch/upgrade breaking change analysis

**Invocation:** `npx ts-node scripts/run.ts --path <PROJECT_ROOT>`

### Tier 2 — LLM Deep Semantic Analysis

AI-driven analysis using rule packs and detection strategy. Catches what scripts cannot:
- Architectural anti-patterns and design violations
- Cross-file data flow issues (unsanitized input propagation)
- Business logic correctness problems
- Contextual performance issues (N+1 across multiple endpoints)
- Configuration consistency (code expects config that doesn't exist)

**Invocation:** Activated via BMAD skill workflow (rule packs + detection strategy)

## Activation

This skill activates when the user asks to:
- Audit project code
- Scan a project (code scan, quick scan)
- Review code quality for AEM/Commerce/EDS projects
- Analyze architecture compliance
- Check for anti-patterns or violations
- Generate a code audit report
- Run a static analysis scan
- Analyze with DB dump / database schema
- Run BRD impact analysis
- Analyze bug reports / bug cascade
- Analyze patch upgrade impact
- Export audit findings

## Pre-flight: Auto-install Dependencies

Before running any audit, check if Node dependencies are installed. If not, install them automatically:

```bash
# Check and install (works on macOS, Linux, Windows WSL)
cd .claude/skills/bmad-code-audit-agent/scripts && [ -d node_modules ] || npm install --silent
```

Do NOT ask the user for permission to install these — they are required for the scanner to function. Just install silently if missing.

## Consent: Ask Audit Mode

**Direct-intent triggers (skip the question, go straight to that mode):**
- "scan my project" / "run scanner" / "quick scan" / "scan with DB" / "scan with BRD" / "scan with bugs" / "analyze patch" → Tier 1 (Scanner)
- "deep audit" / "LLM analysis" / "semantic audit" → Tier 2 (LLM)
- "full audit" / "complete audit" → Tier 1 + Tier 2

**Ambiguous triggers (ask which mode):**
- "audit my project" / "run code review" / "check my code" / "review code quality"

When asking, present:

> **How would you like to audit this project?**
>
> 1. **Scanner** — Fast deterministic scan. Produces Excel report in seconds.
> 2. **LLM Analysis** — AI-driven semantic analysis. Catches architectural flaws, cross-file issues.
> 3. **Full Audit (Scanner + LLM)** — Run both for comprehensive coverage.

Proceed with the user's chosen mode.

## Prompt → CLI Resolution (Tier 1)

When the user triggers a Tier 1 scan, build the CLI command by extracting parameters from their natural language prompt. The base command is:

```
npx ts-node {this_skill_path}/scripts/run.ts [flags]
```

### Flag Resolution Rules

| User says... | Flag | Value |
|--------------|------|-------|
| _(always)_ | `--path` | Current workspace root (auto-detect) |
| _(always)_ | `--engine` | Auto-detect from project signals, or from user's mention of "commerce" / "AEM" / "EDS" |
| "name it X" / "call it X" / "project name X" | `--name` | Extract quoted or mentioned name |
| "DB dump at /path" / "database /path" / "with DB" | `--db` | Extract file path. If user says "with database" but no path → **ask for path** |
| "BRD from /path" / "requirements /path" / "with BRD" | `--brd` | Extract file path. Repeatable. If no path → **ask** |
| "bug report /path" / "bugs /path" / "with bugs" | `--bugs` | Extract file path (.xlsx). If no path → **ask** |
| "only X module" / "scan X and Y modules" | `--module` | Comma-separated module names |
| "only X namespace" / "Custom namespace" | `--namespace` | Namespace string |
| "skip code audit" / "BRD only" / "just BRD" | `--no-code-audit` | Flag set (no value) |
| "export JSON" / "JSON output" / "for CI" / "machine-readable" | `--json` | Flag set (no value) |
| "output to /dir" / "save report at /dir" | `--output` | Directory path |

### Compound Resolution

When a single prompt mentions multiple inputs, combine all matched flags into one command:

- "full audit named Client X with DB at /db.sql and BRD at /spec.docx"
  → `--name "Client X" --db /db.sql --brd /spec.docx`
- "scan Checkout module, include bugs from /bugs.xlsx, output JSON"
  → `--module Checkout --bugs /bugs.xlsx --json`
- "audit Payment namespace with database from /prod.sql"
  → `--namespace Payment --db /prod.sql`

### Missing Required Info — Ask (don't guess)

| When user says... | What to ask |
|-------------------|-------------|
| "scan with database" (no path) | "Please provide the path to your DB dump file (.sql)" |
| "run BRD analysis" (no path) | "Please provide the path to your BRD document (.docx/.txt)" |
| "scan with bugs" (no path) | "Please provide the path to your bug report (.xlsx)" |
| "scan" but project path unclear | "Which project directory should I scan? Current workspace?" |
| "analyze patch upgrade" (no versions) | "Please provide the from and to versions (e.g., 2.4.7-p7 → 2.4.7-p9)" |

### Patch Analysis (Config-Based)

Patch analysis is configured via `config.json`, not CLI flags. When the user says "analyze patch upgrade from X to Y":

1. Read `{this_skill_path}/scripts/engines/commerce/config.json`
2. Set `analysis.patch.enabled = true`, `analysis.patch.from_version = "X"`, `analysis.patch.to_version = "Y"`
3. Write config back
4. Run the CLI command normally (patch will be included in the scan automatically)

Example prompt: "analyze patch upgrade impact from 2.4.7-p7 to 2.4.7-p9"
→ Update config.json patch section, then run: `npx ts-node {this_skill_path}/scripts/run.ts --path {cwd} --engine commerce`

### Engine Auto-Detection (do not ask unless ambiguous)

| Project signal | Engine |
|----------------|--------|
| `composer.json` with `magento/` or `app/code/` | `commerce` |
| `ui.apps/`, `pom.xml` with AEM SDK | `aem` |
| `blocks/`, `helix-query.yaml`, `fstab.yaml` | `eds` |
| EDS signals + commerce dropins | `eds-commerce` |
| Cannot determine | Ask: "What platform is this? Commerce / AEM / EDS?" |

### Examples of Full Resolution

**User:** "scan my project"
```bash
npx ts-node {this_skill_path}/scripts/run.ts --path {cwd} --engine commerce
```

**User:** "scan my project and name it Acme, include DB dump at ./db/prod.sql"
```bash
npx ts-node {this_skill_path}/scripts/run.ts --path {cwd} --engine commerce --name "Acme" --db ./db/prod.sql
```

**User:** "run full scanner with everything — DB at /tmp/dump.sql, BRD at /docs/brd.docx, bugs at /reports/bugs.xlsx"
```bash
npx ts-node {this_skill_path}/scripts/run.ts --path {cwd} --engine commerce --db /tmp/dump.sql --brd /docs/brd.docx --bugs /reports/bugs.xlsx
```

**User:** "just run BRD analysis from /spec/requirements.docx, skip the code scan"
```bash
npx ts-node {this_skill_path}/scripts/run.ts --path {cwd} --engine commerce --no-code-audit --brd /spec/requirements.docx
```

**User:** "what engines are available?"
```bash
npx ts-node {this_skill_path}/scripts/run.ts --list-engines
```

---

## Workflow

### Mode A: Script-Only (Tier 1)

Use when the user wants a quick deterministic report. Build the command using the **Prompt → CLI Resolution** rules above and execute it.

Output: Excel report in engine's `output/` directory.

### Mode B: Deep Analysis (Tier 2)

Use when the user wants semantic/architectural analysis:

### Mode C: Full Audit (Tier 1 + Tier 2)

Recommended for comprehensive audits:

1. Run Tier 1 → produces Excel with deterministic findings
2. Feed high-severity findings into Tier 2 for deeper analysis
3. Tier 2 analyzes flagged areas + discovers issues scripts missed
4. Combined output: Excel report + AI-driven narrative report

### Step 1: Detect Project Type

Scan the workspace to determine which Adobe platform(s) are in use:

| Platform | Detection Signals |
|----------|------------------|
| AEMaaCS | `ui.apps/`, `ui.content/`, `core/`, `all/`, `pom.xml` with AEM SDK dependency |
| Commerce | `app/code/`, `composer.json` with `magento/`, `etc/module.xml` |
| EDS | `scripts/`, `blocks/`, `helix-query.yaml`, `fstab.yaml`, `paths.json` |
| EDS+Commerce | EDS signals + Commerce dropin references, `commerce-` prefixed blocks |

### Step 2: Load Applicable Rule Pack(s)

Based on detected platform, load rules from `resources/rule-packs/<platform>/rules.md`.

For hybrid projects (e.g., EDS+Commerce), load multiple rule packs and apply intersection logic.

### Step 3: Deep Analysis

Use the multi-pass analysis strategy defined in `resources/shared/detection-strategy.md`:

#### Pass 1 — Structural Scan
- Map project topology: packages, modules, configs, deployment artifacts
- Identify dependency graph and module boundaries
- Flag structural violations (misplaced files, missing manifests, circular deps)

#### Pass 2 — Pattern Matching
For each file in scope, apply platform-specific rules from the loaded rule pack:
- Match **bad code examples** against actual source (regex + semantic)
- Compare against **good code examples** to confirm it's truly violating
- Check **false positive conditions** to avoid noise
- Note **related rules** that should also be checked in the same context

#### Pass 3 — Cross-File & Contextual Analysis
- Trace data flow across files (e.g., unsanitized input flowing to output)
- Check configuration consistency (code expects config that doesn't exist)
- Validate inter-module contracts (declared dependencies vs actual usage)
- Assess cumulative patterns (e.g., N+1 query across multiple endpoints)

#### Pass 4 — Scoring & Correlation
1. Score severity using `resources/shared/severity-model.md`
2. Calculate confidence using `resources/shared/confidence-scoring.md`
3. Assess impact using `resources/shared/impact-analysis.md`
4. Correlate related findings (group root causes, deduplicate symptoms)
5. Identify systemic patterns (same mistake repeated = architectural issue)

### Step 4: Generate Report

Use templates from `templates/` to produce the final audit report in the requested format (markdown or JSON).

### Step 5: Actionable Recommendations

Beyond findings, generate:
- Prioritized remediation roadmap (fix order considering dependencies between findings)
- Quick wins list (high-impact, low-effort fixes)
- Architecture improvement suggestions (when systemic patterns detected)
- Upgrade path warnings (deprecated APIs with timeline)

## Configuration

The skill reads configuration from environment variables when available:

| Variable | Purpose | Default |
|----------|---------|---------|
| `AUDIT_SEVERITY_THRESHOLD` | Minimum severity to report | `low` |
| `AUDIT_MAX_FILES` | Max files to analyze per run | `500` |
| `AUDIT_CONFIDENCE_MIN` | Minimum confidence to include finding | `0.6` |
| `AUDIT_OUTPUT_FORMAT` | Report format (`markdown` or `json`) | `markdown` |

## Tools Required

- `claude-code` — For code analysis and pattern matching

## Output

The skill produces a structured audit report containing:
- Executive summary with risk score
- Findings grouped by severity (critical, high, medium, low)
- Each finding includes: location, rule violated, explanation, remediation suggestion, confidence score
- Platform-specific recommendations
- Summary statistics

## Post-Audit Actions

After an audit has been run (Excel or markdown report exists), the user may ask follow-up questions. Handle these by reading the generated report and responding:

| User prompt | Action |
|-------------|--------|
| "summarize the audit findings" | Read the latest report, provide executive summary |
| "show me all CRITICAL severity items" | Filter findings by CRITICAL, list them |
| "what are the top 10 highest-risk findings?" | Sort by risk score, show top 10 |
| "which modules have the most issues?" | Group findings by module, rank by count |
| "create a fix plan for the critical items" | Generate prioritized remediation steps for CRITICAL findings |
| "estimate effort to fix all HIGH and CRITICAL findings" | Analyze findings complexity, provide time estimates |
| "export findings as JSON" | Re-run with `--json` flag or convert existing report |
| "show current audit config" | Read and display `config.json` |
| "update thresholds: god_class_lines=600, fat_constructor_deps=12" | Update `config.json` thresholds section |

**Report location:** Look for the latest `.xlsx` or `.md` file in `{this_skill_path}/scripts/engines/{engine}/output/`
