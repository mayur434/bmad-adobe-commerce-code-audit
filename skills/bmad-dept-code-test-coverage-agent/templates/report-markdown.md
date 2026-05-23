# Test Coverage Report — Markdown Template

## {{project_name}} — Test Coverage Analysis

**Engine:** {{engine}}
**Date:** {{date}}
**Total Source Files:** {{total_source_files}}
**Tested Files:** {{tested_files}}
**Untested Files:** {{untested_files}}
**Coverage:** {{coverage_percent}}%

---

## Coverage Gaps (Priority Order)

| # | File | Class/Function | Complexity | Priority | Reason |
|---|------|----------------|-----------|----------|--------|
{{#gaps}}
| {{index}} | `{{file}}` | `{{method}}` | {{complexity}} | {{priority}} | {{reason}} |
{{/gaps}}

---

## Recommendations

{{recommendations}}

---

## Next Steps

1. Run `generate tests` to auto-create tests for top-priority gaps
2. Review generated tests and adjust mocking as needed
3. Re-run `analyze test coverage` to track progress
