# EDS + Commerce Hybrid Audit Engine

## Status: Placeholder

This engine will provide static analysis for EDS storefronts with Commerce dropins.

## Planned Capabilities

- All EDS checks (block structure, JS quality, performance)
- Commerce dropin integration validation
- Cart/checkout flow correctness
- Product data layer consistency
- Commerce event tracking compliance
- API mesh / catalog service integration patterns
- Dropin customization anti-patterns

## To Implement

Create `audit.ts` in this directory with a `main()` function that accepts:
- `--path` — project root
- `--name` — project name
- `--output` — output directory
- `--config` — config JSON path (optional)

Follow the same pattern as `engines/commerce/audit.ts`.
