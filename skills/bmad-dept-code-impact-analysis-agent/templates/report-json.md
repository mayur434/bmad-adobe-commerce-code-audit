# Impact Analysis Report — JSON Template

```json
{
  "meta": {
    "project": "{{PROJECT_NAME}}",
    "engine": "{{ENGINE_ID}}",
    "mode": "{{MODE}}",
    "timestamp": "{{TIMESTAMP}}"
  },
  "summary": {
    "riskLevel": "{{RISK_LEVEL}}",
    "blastRadius": {{BLAST_RADIUS}},
    "affectedFiles": {{AFFECTED_FILES_COUNT}},
    "breakingChanges": {{BREAKING_COUNT}}
  },
  "affectedItems": [
    {
      "file": "{{FILE_PATH}}",
      "symbol": "{{SYMBOL_NAME}}",
      "type": "{{ITEM_TYPE}}",
      "impact": "{{IMPACT_LEVEL}}",
      "confidence": {{CONFIDENCE}},
      "reason": "{{REASON}}"
    }
  ]
}
```
