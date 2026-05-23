# BMAD DEPT Code Agent — Test Coverage Guide

## Overview

The Test Coverage agent analyzes your project's test coverage gaps and generates missing tests using platform-specific patterns. It works in two tiers:

- **Tier 1 (Scanner):** Fast deterministic analysis — inventories source files, maps existing tests, identifies gaps, scores priority.
- **Tier 2 (LLM):** AI-driven test generation — produces unit, integration, and functional tests following your project's conventions.

## Quick Start

After BMAD install, just ask:

```
analyze test coverage
```

Or go straight to generation:

```
generate tests for the Checkout module
```

## Usage Modes

### Analyze Only

```
analyze test coverage
show untested code
create test plan
```

Produces an Excel report + JSON gap list.

### Generate Only

```
generate tests for src/Model/OrderProcessor.php
generate unit tests for the Payment module
```

Uses existing coverage data (or runs analysis first).

### Full (Analyze + Generate)

```
full test coverage
```

Runs analysis, presents top gaps, generates tests upon confirmation.

## CLI (Standalone)

```bash
cd .claude/skills/bmad-dept-code-test-coverage-agent/scripts

# Analyze coverage gaps
npx ts-node run.ts --mode analyze --path /path/to/project

# Explicit engine
npx ts-node run.ts --mode analyze --engine commerce --path /path/to/project

# List engines
npx ts-node run.ts --list-engines
```

## Output

- `{output_folder}/test-coverage-report.xlsx` — Coverage gap report
- `{output_folder}/coverage-gaps.json` — Machine-readable gap list
- Generated test files placed in correct directories per platform conventions
