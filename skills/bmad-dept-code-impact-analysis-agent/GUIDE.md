# BMAD Code Impact Analysis Agent — Setup Guide

Code impact analysis for enterprise projects.

---

## Prerequisites

- Python 3.10+
- BMAD installed on your project

## Installation

Installed as part of the BMAD DEPT Code Agent module:

```bash
npx bmad-method install \
  --directory . \
  --modules bmm,bmb \
  --custom-source /path/to/bmad-dept-code-agent/skills \
  --tools claude-code \
  --yes
```

After install: `.claude/skills/bmad-dept-code-impact-analysis-agent/`

## Usage

Ask your AI agent using natural language:

| Action | Prompt |
|--------|--------|
| Change impact | `what's the impact if I change this class?` |
| Blast radius | `evaluate blast radius of modifying the Checkout module` |
| Upgrade risk | `assess risk for upgrading from 2.4.6 to 2.4.7` |
| Dependency trace | `trace all dependencies of the Payment module` |
| Breaking changes | `check what breaks if I remove this interface` |
| Patch risk | `what's the risk of applying this patch?` |

The agent will:
1. Identify the target class/module/interface
2. Trace all dependency chains (usages, plugins, observers, DI preferences)
3. Evaluate blast radius and risk score
4. Report affected modules with remediation effort estimate

## Output

Reports are generated in `{audit_output}/`:
- Impact report with affected modules and risk scores
- Dependency map visualization
- Remediation recommendations
