# BMAD Code Scan Agent — Setup Guide

Fast deterministic code scanner for enterprise projects.

---

## Prerequisites

- Python 3.10+
- pip (for dependencies)
- BMAD installed on your project

## Installation

Installed as part of the BMAD Code Audit module:

```bash
npx bmad-method install \
  --directory . \
  --modules bmm,bmb \
  --custom-source /path/to/bmad-code-audit/skills \
  --tools claude-code \
  --yes
```

After install: `.claude/skills/bmad-code-scan-agent/`

## Usage

> TODO: Add CLI usage examples.

## Output

> TODO: Document output format and location.
