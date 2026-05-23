# BMAD Code Scan Agent — Setup Guide

Fast deterministic code scanner for enterprise projects.

---

## Prerequisites

- Node.js v20.12+
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

After install: `.claude/skills/bmad-dept-code-scan-agent/`

## Usage

Ask your AI agent using natural language:

| Action | Prompt |
|--------|--------|
| Quick scan | `scan my project code` |
| Static analysis | `run static analysis on this codebase` |
| Find violations | `find code violations` |
| Quality check | `check code quality quickly` |

The agent will:
1. Auto-detect the platform (Commerce, AEM, EDS)
2. Run deterministic static analysis
3. Produce a structured report (Excel/JSON)

## Output

Reports are generated in `{audit_output}/` (configurable via module install):
- Excel report with categorized findings
- JSON export available on request
