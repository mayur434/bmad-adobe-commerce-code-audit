# AEM Audit Engine v1.0

Enterprise-grade static code analysis for AEM (AMS & Cloud Service) projects.

## Usage

```bash
cd scripts
npx ts-node engines/aem/audit.ts --path /path/to/aem-project
npx ts-node engines/aem/audit.ts --path /path/to/aem-project --platform aemcs
npx ts-node engines/aem/audit.ts --config engines/aem/config.json
```

## Options

| Flag | Description |
|------|-------------|
| `--path <path>` | AEM project root (required) |
| `--name <name>` | Project name (default: folder name) |
| `--output <dir>` | Output directory (default: output) |
| `--platform <type>` | `aemcs`, `aemams`, or `both` (default: both) |
| `--module <mods>` | Module filter (comma-separated) |
| `--config <path>` | Config JSON file |
| `--json` | Also output findings as JSON |

## Audit Categories (Excel Sub-Sheets)

1. **Performance** — Unbounded queries, thread issues, caching, resolver leaks
2. **Code Quality** — Deprecated APIs, standards, dead code, technical debt
3. **Security** — XSS, SSRF, credentials, CSRF, injections, ACLs
4. **SEO** — Meta tags, canonicals, headings, structured data, URLs
5. **Accessibility** — WCAG 2.1, ARIA, keyboard navigation, focus management
6. **Architecture** — Project structure, overlays, mutable/immutable, design patterns
7. **Sling & OSGi** — Resolver leaks, service users, lifecycle, configuration
8. **Cloud Readiness** — AEMaaCS compatibility, file system, replication, indexes
9. **Dispatcher** — Cache rules, filters, security configuration
10. **HTL & Frontend** — Template quality, clientlibs, JavaScript, CSS
11. **Test Coverage** — Unit tests, integration tests, coverage ratio
12. **Maintainability** — Complexity, duplication, nesting, parameter lists

## Output

Generates an Excel workbook (`.xlsx`) with:
- **Executive Summary** — Overall stats, severity breakdown, category counts
- **One sheet per category** — Detailed findings with module, file, line, severity, recommendations
- **Top Recommendations** — Prioritized action items aggregated by issue type
- **Action Plan** — Phased remediation timeline
