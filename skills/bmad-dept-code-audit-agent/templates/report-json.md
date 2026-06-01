{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "BMAD DEPT Code Agent — Audit Report",
  "type": "object",
  "properties": {
    "metadata": {
      "type": "object",
      "properties": {
        "project_name": { "type": "string" },
        "date": { "type": "string", "format": "date-time" },
        "platform": {
          "type": "string",
          "enum": ["aemcs", "commerce", "eds", "eds-commerce"]
        },
        "scope": { "type": "string" },
        "version": { "type": "string" }
      },
      "required": ["project_name", "date", "platform"]
    },
    "summary": {
      "type": "object",
      "properties": {
        "risk_score": { "type": "number", "minimum": 0, "maximum": 10 },
        "total_findings": { "type": "integer" },
        "by_severity": {
          "type": "object",
          "properties": {
            "critical": { "type": "integer" },
            "high": { "type": "integer" },
            "medium": { "type": "integer" },
            "low": { "type": "integer" }
          }
        },
        "files_analyzed": { "type": "integer" },
        "rules_evaluated": { "type": "integer" },
        "average_confidence": { "type": "number" },
        "executive_summary": { "type": "string" }
      }
    },
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "rule_id": { "type": "string" },
          "title": { "type": "string" },
          "severity": {
            "type": "string",
            "enum": ["critical", "high", "medium", "low"]
          },
          "severity_score": { "type": "number", "minimum": 1, "maximum": 10 },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
          "location": {
            "type": "object",
            "properties": {
              "file": { "type": "string" },
              "line": { "type": "integer" },
              "column": { "type": "integer" }
            },
            "required": ["file"]
          },
          "description": { "type": "string", "description": "Plain-language explanation of why this matters to the developer" },
          "evidence": { "type": "string", "description": "The actual code snippet causing the issue" },
          "impact": {
            "type": "object",
            "description": "What breaks if this is not fixed",
            "properties": {
              "summary": { "type": "string", "description": "One-line description of what will go wrong" },
              "blast_radius": {
                "type": "string",
                "enum": ["isolated", "module", "section", "site-wide", "cross-system"],
                "description": "How much of the site is affected"
              },
              "dimensions": {
                "type": "array",
                "items": {
                  "type": "string",
                  "enum": ["performance", "security", "maintainability", "business"]
                }
              }
            }
          },
          "remediation": {
            "type": "object",
            "description": "How to fix this issue with concrete steps",
            "properties": {
              "description": { "type": "string", "description": "Step-by-step fix instructions with code examples" },
              "effort": {
                "type": "string",
                "enum": ["trivial", "small", "medium", "large", "epic"],
                "description": "How long the fix takes: trivial=<30min, small=1-2hr, medium=half-day, large=1-3 days, epic=1+ week"
              },
              "code_suggestion": { "type": "string", "description": "Ready-to-use code fix (copy-paste ready)" }
            }
          }
        },
        "required": ["id", "rule_id", "title", "severity", "severity_score", "confidence", "location", "description"]
      }
    },
    "recommendations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "category": { "type": "string" },
          "recommendation": { "type": "string" },
          "priority": { "type": "string", "enum": ["immediate", "short-term", "long-term"] }
        }
      }
    }
  },
  "required": ["metadata", "summary", "findings"]
}
