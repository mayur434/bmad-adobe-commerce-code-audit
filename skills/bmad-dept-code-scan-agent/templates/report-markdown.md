# Scan Report — Markdown Template

## {{PROJECT_NAME}} — Code Scan Report

**Engine:** {{ENGINE_ID}}
**Mode:** {{MODE}}
**Date:** {{TIMESTAMP}}

---

### Summary

| Metric | Value |
|--------|-------|
| Total Files | {{TOTAL_FILES}} |
| Files Scanned | {{FILES_SCANNED}} |
| Total Findings | {{TOTAL_FINDINGS}} |
| Critical | {{CRITICAL_COUNT}} |
| High | {{HIGH_COUNT}} |
| Medium | {{MEDIUM_COUNT}} |
| Low | {{LOW_COUNT}} |

---

### Findings

| # | Severity | File | Line | Rule | Message |
|---|----------|------|------|------|---------|
{{#FINDINGS}}
| {{INDEX}} | {{SEVERITY}} | {{FILE}} | {{LINE}} | {{RULE}} | {{MESSAGE}} |
{{/FINDINGS}}
