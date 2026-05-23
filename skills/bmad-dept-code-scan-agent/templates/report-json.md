# Scan Report — JSON Template

```json
{
  "meta": {
    "project": "{{PROJECT_NAME}}",
    "engine": "{{ENGINE_ID}}",
    "mode": "{{MODE}}",
    "timestamp": "{{TIMESTAMP}}"
  },
  "summary": {
    "totalFiles": {{TOTAL_FILES}},
    "filesScanned": {{FILES_SCANNED}},
    "totalFindings": {{TOTAL_FINDINGS}},
    "bySeverity": {
      "critical": {{CRITICAL_COUNT}},
      "high": {{HIGH_COUNT}},
      "medium": {{MEDIUM_COUNT}},
      "low": {{LOW_COUNT}}
    }
  },
  "findings": [
    {
      "file": "{{FILE_PATH}}",
      "line": {{LINE}},
      "rule": "{{RULE_ID}}",
      "severity": "{{SEVERITY}}",
      "category": "{{CATEGORY}}",
      "message": "{{MESSAGE}}"
    }
  ]
}
```
