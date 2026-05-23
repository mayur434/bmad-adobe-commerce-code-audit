# Test Coverage Report — JSON Template

Output schema for machine-readable coverage reports:

```json
{
  "projectName": "{{project_name}}",
  "engine": "{{engine}}",
  "date": "{{date}}",
  "summary": {
    "totalSourceFiles": 0,
    "testedFiles": 0,
    "untestedFiles": 0,
    "coveragePercent": 0.0
  },
  "gaps": [
    {
      "file": "path/to/file",
      "className": "ClassName",
      "method": "methodName",
      "complexity": 12,
      "priority": "critical|high|medium|low",
      "reason": "Why this needs a test"
    }
  ],
  "recommendations": [],
  "generatedTests": []
}
```
