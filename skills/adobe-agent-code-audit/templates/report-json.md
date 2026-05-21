{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Adobe Code Audit Report",
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
          "description": { "type": "string" },
          "evidence": { "type": "string" },
          "impact": {
            "type": "object",
            "properties": {
              "summary": { "type": "string" },
              "blast_radius": {
                "type": "string",
                "enum": ["isolated", "module", "section", "site-wide", "cross-system"]
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
            "properties": {
              "description": { "type": "string" },
              "effort": {
                "type": "string",
                "enum": ["trivial", "small", "medium", "large", "epic"]
              },
              "code_suggestion": { "type": "string" }
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
