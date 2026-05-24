# EDS Audit Engine

Automated code quality audit for Adobe Edge Delivery Services (EDS/Franklin) projects. Generates a styled Excel report with 13 sheets covering architecture, performance, security, SEO, accessibility, and more.

## Features

- **12 analyzers** covering all EDS best practices
- **GitHub URL support** — audits public repos without cloning
- **Local path support** — point to a local EDS project folder
- **Excel report** with color-coded severity, category scores, and summary
- **Severity-weighted scoring** (CRITICAL=10, HIGH=7, MEDIUM=4, LOW=1)
- **Zero prompts** — uses sensible defaults, no interactive questions

## Usage

```bash
cd skills/bmad-dept-code-audit-agent/scripts

# Audit a GitHub repository
npx ts-node engines/eds/audit.ts --github https://github.com/org/repo-name

# Audit a local path
npx ts-node engines/eds/audit.ts --path /path/to/eds-project

# Full options
npx ts-node engines/eds/audit.ts \
  --github https://github.com/org/repo \
  --name "My Project" \
  --output ./reports \
  --json
```

## CLI Options

| Flag | Description |
|------|-------------|
| `--path <dir>` | Local project directory to audit |
| `--github <url>` | GitHub repository URL (public repos, no auth needed) |
| `--name <name>` | Project name for the report |
| `--output <dir>` | Output directory (default: current dir) |
| `--config <file>` | Custom config JSON file |
| `--json` | Also generate a JSON report |

## Report Structure (13 Sheets)

1. **Summary** — overall score, severity breakdown, category scores
2. **Architecture** — block structure, DOM scope, loading strategy
3. **Performance** — render-blocking, images, CLS, INP, TBT
4. **Security** — XSS, secrets, external scripts, eval
5. **SEO** — metadata, robots.txt, structured data, headings
6. **Accessibility** — ARIA, keyboard nav, contrast, focus
7. **Code Quality** — console logs, error handling, duplication, naming
8. **CSS** — scoping, !important, fixed dimensions, variables
9. **JavaScript** — ESM patterns, async/await, DOM API, delegation
10. **Linting** — ESLint, Stylelint, EditorConfig, lint scripts
11. **Content Practices** — hardcoded content, block tables, metadata
12. **Dev Workflow** — package.json, CI/CD, documentation
13. **Git Hooks** — husky, pre-commit, commit messages

## Scoring

- Each finding has a severity-based score
- Category score: `max(0, 100 - penalty*2)`
- Overall score: `max(0, 100 - totalPenalty/2)`
- Score of 100 = no issues found
