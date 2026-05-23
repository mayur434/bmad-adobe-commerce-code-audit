# AEM as a Cloud Service Audit Engine

## Status: Placeholder

This engine will provide static analysis for AEM as a Cloud Service projects.

## Planned Capabilities

- Java code quality analysis (OSGi components, Sling models, servlets)
- Content structure validation (node types, ACLs, namespaces)
- Dispatcher configuration audit
- Cloud Manager pipeline compatibility checks
- AEM SDK API deprecation detection
- Performance anti-patterns (session leaks, unbounded queries, missing indexes)
- Security (XSS in HTL, open servlets, missing ACLs)

## To Implement

Create `audit.ts` in this directory with a `main()` function that accepts:
- `--path` — project root
- `--name` — project name
- `--output` — output directory
- `--config` — config JSON path (optional)

Follow the same pattern as `engines/commerce/audit.ts`.
