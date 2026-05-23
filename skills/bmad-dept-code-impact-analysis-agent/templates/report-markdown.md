# Impact Analysis Report — Markdown Template

## {{PROJECT_NAME}} — Impact Analysis

**Engine:** {{ENGINE_ID}}
**Mode:** {{MODE}}
**Date:** {{TIMESTAMP}}

---

### Risk Summary

| Metric | Value |
|--------|-------|
| Risk Level | {{RISK_LEVEL}} |
| Blast Radius | {{BLAST_RADIUS}} |
| Affected Files | {{AFFECTED_FILES_COUNT}} |
| Breaking Changes | {{BREAKING_COUNT}} |

---

### Affected Items

| File | Symbol | Type | Impact | Confidence | Reason |
|------|--------|------|--------|------------|--------|
{{#ITEMS}}
| {{FILE}} | {{SYMBOL}} | {{TYPE}} | {{IMPACT}} | {{CONFIDENCE}}% | {{REASON}} |
{{/ITEMS}}

---

### Recommendations

{{RECOMMENDATIONS}}
