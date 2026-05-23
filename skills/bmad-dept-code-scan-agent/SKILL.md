---
name: bmad-dept-code-scan-agent
description: "Fast deterministic code scanner (part of BMAD DEPT Code Agent suite). Performs static analysis across multiple Adobe platforms and produces structured reports."
---

# BMAD DEPT Code Agent — Scan Skill

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
cd {skill_path}/scripts && [ -d node_modules ] || npm install --silent
```

## Workflow

> TODO: Define scanning workflow, engine integration, and output format.

## Output

> TODO: Define report format and output location.
