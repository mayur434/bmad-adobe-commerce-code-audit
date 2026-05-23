---
name: bmad-code-audit-agent
description: "Two-tier code auditor for Commerce, AEMaaCS, EDS, and hybrid projects. Tier 1: deterministic Python static analysis (42+ categories, Excel report). Tier 2: LLM-driven deep semantic analysis."
---

# BMAD Code Audit Skill

## Purpose

Two-tier code audit system for enterprise projects including AEM as a Cloud Service (AEMaaCS), Adobe Commerce (Magento), Edge Delivery Services (EDS), and EDS+Commerce hybrid implementations.

### Tier 1 — Deterministic Static Analysis (Python Script)

Fast, reproducible scan using `scripts/run.py`. Produces an enterprise Excel report with:
- 42-category code audit (security, performance, deprecated APIs, etc.)
- Database dump analysis (schema, indexes, integrity)
- BRD impact analysis (new requirements, feature enhancements)
- Bug cascade & severity analysis (from Excel bug reports)
- Patch/upgrade breaking change analysis

**Invocation:** `python3 scripts/run.py --path <PROJECT_ROOT>`

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
- Review code quality for AEM/Commerce/EDS projects
- Analyze architecture compliance
- Check for anti-patterns or violations
- Generate a code audit report
- Run a static analysis scan

## Pre-flight: Auto-install Dependencies

Before running any audit, check if Python dependencies are available. If not, install them automatically:

```bash
# Check and install (works on macOS, Linux, Windows WSL)
python3 -c "import openpyxl, docx" 2>/dev/null || pip3 install openpyxl python-docx --quiet
```

Do NOT ask the user for permission to install these — they are required for the scanner to function. Just install silently if missing.

## Consent: Ask Audit Mode

**Direct-intent triggers (skip the question, go straight to that mode):**
- "scan my project" / "run scanner" / "quick scan" → Tier 1 (Scanner)
- "deep audit" / "LLM analysis" / "semantic audit" → Tier 2 (LLM)
- "full audit" / "complete audit" → Tier 1 + Tier 2

**Ambiguous triggers (ask which mode):**
- "audit my project" / "run code review" / "check my code"

When asking, present:

> **How would you like to audit this project?**
>
> 1. **Scanner** — Fast deterministic scan. Produces Excel report in seconds.
> 2. **LLM Analysis** — AI-driven semantic analysis. Catches architectural flaws, cross-file issues.
> 3. **Full Audit (Scanner + LLM)** — Run both for comprehensive coverage.

Proceed with the user's chosen mode.

## Workflow

### Mode A: Script-Only (Tier 1)

Use when the user wants a quick deterministic report:

```bash
# Auto-detect platform and run (from project root)
python3 .claude/skills/bmad-code-audit-agent/scripts/run.py --path . --name "Project Name"

# Explicit engine selection
python3 .claude/skills/bmad-code-audit-agent/scripts/run.py --engine commerce --path .
python3 .claude/skills/bmad-code-audit-agent/scripts/run.py --engine aem --path .
python3 .claude/skills/bmad-code-audit-agent/scripts/run.py --engine eds --path .

# List available engines
python3 .claude/skills/bmad-code-audit-agent/scripts/run.py --list-engines
```

Output: Excel report in engine's `output/` directory

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
