---
name: bmad-code-scan-agent
description: "Fast deterministic code scanner for enterprise projects. Performs static analysis across multiple platforms and produces structured reports."
---

# BMAD Code Scan Agent

## Purpose

Dedicated scanning agent that performs fast, deterministic static analysis on project codebases. Produces structured reports (Excel/JSON) covering security, performance, coding standards, and platform-specific best practices.

## Activation

This skill activates when the user asks to:
- Scan project code
- Run static analysis
- Check code quality quickly
- Generate a scan report
- Find code violations

## Pre-flight: Auto-install Dependencies

```bash
python3 -c "import openpyxl" 2>/dev/null || pip3 install openpyxl --quiet
```

## Workflow

> TODO: Define scanning workflow, engine integration, and output format.

## Output

> TODO: Define report format and output location.
